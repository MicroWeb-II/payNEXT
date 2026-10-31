const pool = require("../config/db");

async function listByWallet(walletId, limit, offset, type = null) {
  const r = await pool.query(
    `SELECT * FROM transactions
     WHERE wallet_id = $1 AND ($4::transaction_type IS NULL OR type = $4::transaction_type)
     ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
    [walletId, limit, offset, type],
  );
  return r.rows;
}

module.exports = { listByWallet };
