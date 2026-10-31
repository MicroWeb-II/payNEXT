const { randomInt } = require('crypto');
const pool = require('../config/db');

async function create(userId, currency = 'USD') {
  for (let attempt = 0; attempt < 5; attempt++) {
    const walletNumber = 'PAYNX-' + String(randomInt(100000, 1000000));
    try {
      const r = await pool.query(
        `INSERT INTO wallets (user_id, wallet_number, currency)
         VALUES ($1, $2, $3) RETURNING *`,
        [userId, walletNumber, currency],
      );
      return r.rows[0];
    } catch (err) {
      if (err.code === '23505') continue; // unique constraint violation — retry
      throw err;
    }
  }
  throw new Error('Could not generate a unique wallet number after 5 attempts');
}

async function listByUser(userId) {
  const r = await pool.query(
    'SELECT * FROM wallets WHERE user_id = $1 ORDER BY created_at',
    [userId],
  );
  return r.rows;
}

async function findById(id) {
  const r = await pool.query('SELECT * FROM wallets WHERE id = $1', [id]);
  return r.rows[0];
}

module.exports = { create, listByUser, findById };
