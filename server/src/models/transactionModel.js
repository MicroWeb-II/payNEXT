const pool = require('../config/db');

async function listByWallet(walletId, { limit = 20, offset = 0, type = null } = {}) {
  const r = await pool.query(
    `SELECT id, wallet_id, type, amount, balance_after, currency, reference_id, description, status, created_at
     FROM transactions
     WHERE wallet_id = $1 AND ($4::transaction_type IS NULL OR type = $4::transaction_type)
     ORDER BY created_at DESC, id DESC
     LIMIT $2 OFFSET $3`,
    [walletId, limit, offset, type],
  );
  return r.rows;
}

async function countByWallet(walletId, type = null) {
  const r = await pool.query(
    `SELECT COUNT(*)::int AS total FROM transactions
     WHERE wallet_id = $1 AND ($2::transaction_type IS NULL OR type = $2::transaction_type)`,
    [walletId, type],
  );
  return r.rows[0].total;
}

module.exports = { listByWallet, countByWallet };
