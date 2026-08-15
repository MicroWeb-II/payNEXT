const pool = require("../config/db");

async function listByWallet(walletId, limit, offset) {
  const r = await pool.query(
    "SELECT * FROM transactions WHERE wallet_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",
    [walletId, limit, offset],
  );
  return r.rows;
}

module.exports = { listByWallet };
