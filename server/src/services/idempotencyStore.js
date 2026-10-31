const crypto = require("crypto");
const pool = require("../config/db");

function stableStringify(value) {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function createRequestHash(req) {
  return crypto
    .createHash("sha256")
    .update(`${req.method}\n${req.originalUrl}\n${stableStringify(req.body || {})}`)
    .digest("hex");
}

async function begin(userId, key, endpoint, requestHash) {
  const inserted = await pool.query(
    `INSERT INTO idempotency_keys (idempotency_key, key, user_id, endpoint, request_hash)
     VALUES ($1, $1, $2, $3, $4)
     ON CONFLICT (idempotency_key, user_id, endpoint) DO NOTHING
     RETURNING id`,
    [key, userId, endpoint, requestHash],
  );
  if (inserted.rowCount) return { state: "new" };

  const existing = await pool.query(
    `SELECT request_hash, response_status, response_body, updated_at
     FROM idempotency_keys
     WHERE user_id = $1 AND idempotency_key = $2 AND endpoint = $3`,
    [userId, key, endpoint],
  );
  const record = existing.rows[0];
  if (!record) return { state: "processing" };

  if (Date.now() - new Date(record.updated_at).getTime() > 24 * 60 * 60 * 1000) {
    const reset = await pool.query(
      `UPDATE idempotency_keys
       SET request_hash = $4, response_status = NULL, response_body = NULL, updated_at = CURRENT_TIMESTAMP
       WHERE user_id = $1 AND idempotency_key = $2 AND endpoint = $3
         AND updated_at = $5
       RETURNING id`,
      [userId, key, endpoint, requestHash, record.updated_at],
    );
    return reset.rowCount ? { state: "new" } : { state: "processing" };
  }

  if (!record.request_hash || record.request_hash.trim() !== requestHash) {
    return { state: "conflict" };
  }
  if (record.response_status !== null) {
    return {
      state: "replay",
      status: record.response_status,
      body: record.response_body,
    };
  }
  return { state: "processing" };
}

async function complete(userId, key, endpoint, status, body) {
  await pool.query(
    `UPDATE idempotency_keys
     SET response_status = $4, response_body = $5, updated_at = CURRENT_TIMESTAMP
     WHERE user_id = $1 AND idempotency_key = $2 AND endpoint = $3`,
    [userId, key, endpoint, status, JSON.stringify(body)],
  );
}

async function remove(userId, key, endpoint) {
  await pool.query(
    "DELETE FROM idempotency_keys WHERE user_id = $1 AND idempotency_key = $2 AND endpoint = $3",
    [userId, key, endpoint],
  );
}

module.exports = { stableStringify, createRequestHash, begin, complete, remove };