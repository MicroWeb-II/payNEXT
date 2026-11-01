/**
 * Persistent idempotency key store.
 *
 * A key is scoped to (user, endpoint). The first request claims the key with a
 * null response; once the handler responds, the status and body are stored and
 * any replay within the TTL receives the stored response. Reusing a key with a
 * different payload is rejected as a conflict.
 */
const crypto = require('crypto');
const pool = require('../config/db');
const config = require('../config/env');

const TTL_MS = config.idempotency.ttlHours * 60 * 60 * 1000;

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function createRequestHash(req) {
  return crypto
    .createHash('sha256')
    .update(`${req.method}\n${req.originalUrl}\n${stableStringify(req.body || {})}`)
    .digest('hex');
}

function isExpired(record, now = Date.now()) {
  return now - new Date(record.created_at).getTime() > TTL_MS;
}

/**
 * Claim a key. Resolves to one of:
 *   { state: 'new' }                         - caller should process the request
 *   { state: 'replay', status, body }        - return the stored response
 *   { state: 'conflict' }                    - same key, different payload
 *   { state: 'processing' }                  - the original request is in flight
 */
async function begin(userId, key, endpoint, requestHash) {
  const inserted = await pool.query(
    `INSERT INTO idempotency_keys (idempotency_key, user_id, endpoint, request_hash)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (idempotency_key, user_id, endpoint) DO NOTHING
     RETURNING id`,
    [key, userId, endpoint, requestHash],
  );
  if (inserted.rowCount) return { state: 'new' };

  const existing = await pool.query(
    `SELECT request_hash, response_status, response_body, created_at
     FROM idempotency_keys
     WHERE user_id = $1 AND idempotency_key = $2 AND endpoint = $3`,
    [userId, key, endpoint],
  );
  const record = existing.rows[0];
  if (!record) return { state: 'processing' };

  if (isExpired(record)) {
    // Atomically re-claim an expired key; a concurrent re-claim loses the race.
    const reset = await pool.query(
      `UPDATE idempotency_keys
       SET request_hash = $4, response_status = NULL, response_body = NULL, created_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND idempotency_key = $2 AND endpoint = $3
         AND created_at < NOW() - ($5::int * INTERVAL '1 hour')
       RETURNING id`,
      [userId, key, endpoint, requestHash, config.idempotency.ttlHours],
    );
    return reset.rowCount ? { state: 'new' } : { state: 'processing' };
  }

  if (String(record.request_hash).trim() !== requestHash) return { state: 'conflict' };
  if (record.response_status !== null && record.response_status !== undefined) {
    return { state: 'replay', status: record.response_status, body: record.response_body };
  }
  return { state: 'processing' };
}

async function complete(userId, key, endpoint, status, body) {
  await pool.query(
    `UPDATE idempotency_keys SET response_status = $4, response_body = $5
     WHERE user_id = $1 AND idempotency_key = $2 AND endpoint = $3`,
    [userId, key, endpoint, status, JSON.stringify(body)],
  );
}

/** Release a claimed key so the client may retry (used after server errors). */
async function remove(userId, key, endpoint) {
  await pool.query(
    'DELETE FROM idempotency_keys WHERE user_id = $1 AND idempotency_key = $2 AND endpoint = $3',
    [userId, key, endpoint],
  );
}

async function purgeExpired() {
  const r = await pool.query(
    'DELETE FROM idempotency_keys WHERE created_at < NOW() - ($1::int * INTERVAL \'1 hour\')',
    [config.idempotency.ttlHours],
  );
  return r.rowCount;
}

module.exports = {
  TTL_MS,
  stableStringify,
  createRequestHash,
  isExpired,
  begin,
  complete,
  remove,
  purgeExpired,
};
