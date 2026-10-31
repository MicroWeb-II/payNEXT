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

async function begin(userId, key, requestHash) {
  const inserted = await pool.query(
    `INSERT INTO idempotency_keys (user_id, key, request_hash)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, key) DO NOTHING
     RETURNING id`,
    [userId, key, requestHash],
  );
  if (inserted.rowCount) return { state: "new" };

  const existing = await pool.query(
    `SELECT request_hash, response_status, response_body
     FROM idempotency_keys WHERE user_id = $1 AND key = $2`,
    [userId, key],
  );
  const record = existing.rows[0];
  if (!record || record.request_hash.trim() !== requestHash) {
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

async function complete(userId, key, status, body) {
  await pool.query(
    `UPDATE idempotency_keys
     SET response_status = $3, response_body = $4
     WHERE user_id = $1 AND key = $2`,
    [userId, key, status, JSON.stringify(body)],
  );
}

async function remove(userId, key) {
  await pool.query(
    "DELETE FROM idempotency_keys WHERE user_id = $1 AND key = $2",
    [userId, key],
  );
}

module.exports = { stableStringify, createRequestHash, begin, complete, remove };