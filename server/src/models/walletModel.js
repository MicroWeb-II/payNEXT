const pool = require("../config/db");

async function create(userId, currency = "USD") {
  const walletNumber = "PAYNX-" + Math.floor(100000 + Math.random() * 900000);
  const r = await pool.query(
    `INSERT INTO wallets (user_id, wallet_number, currency)
     VALUES ($1, $2, $3) RETURNING *`,
    [userId, walletNumber, currency],
  );
  return r.rows[0];
}

async function listByUser(userId) {
  const r = await pool.query(
    "SELECT * FROM wallets WHERE user_id = $1 ORDER BY created_at",
    [userId],
  );
  return r.rows;
}

async function findById(id) {
  const r = await pool.query("SELECT * FROM wallets WHERE id = $1", [id]);
  return r.rows[0];
}

module.exports = { create, listByUser, findById };
