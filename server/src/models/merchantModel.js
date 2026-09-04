const pool = require("../config/db");
const crypto = require("crypto");

async function create({ name }) {
  const apiKey = "pk_" + crypto.randomBytes(16).toString("hex");
  const r = await pool.query(
    "INSERT INTO merchants (name, api_key) VALUES ($1, $2) RETURNING *",
    [name, apiKey]
  );
  return r.rows[0];
}

async function findAll() {
  const r = await pool.query("SELECT * FROM merchants ORDER BY created_at DESC");
  return r.rows;
}

async function findById(id) {
  const r = await pool.query("SELECT * FROM merchants WHERE id = $1", [id]);
  return r.rows[0];
}

async function update(id, name, status) {
  const r = await pool.query(
    "UPDATE merchants SET name = $1, status = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $3 RETURNING *",
    [name, status, id]
  );
  return r.rows[0];
}

async function remove(id) {
  const r = await pool.query("DELETE FROM merchants WHERE id = $1 RETURNING *", [id]);
  return r.rows[0];
}

// Log a payment in the database (Called during a transaction)
async function logPayment(client, merchantId, walletId, amount, currency) {
  const r = await client.query(
    `INSERT INTO merchant_payments (merchant_id, wallet_id, amount, currency)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [merchantId, walletId, amount, currency]
  );
  return r.rows[0];
}

module.exports = { create, findAll, findById, update, remove, logPayment };
