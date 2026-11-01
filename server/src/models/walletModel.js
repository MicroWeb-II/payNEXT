const crypto = require('crypto');
const pool = require('../config/db');

const MAX_WALLET_NUMBER_ATTEMPTS = 5;
const WALLET_NUMBER_CONSTRAINT = 'wallets_wallet_number_key';

function generateWalletNumber() {
  // CSPRNG, uniform over 100000..999999 so numbers cannot be predicted.
  return `PAYNX-${crypto.randomInt(100000, 1000000)}`;
}

/**
 * Create a wallet with a unique, unpredictable wallet number.
 *
 * A collision on the wallet number is retried with a fresh number. When a
 * transaction client is supplied, each attempt runs inside a SAVEPOINT so a
 * unique violation does not abort the surrounding transaction.
 */
async function create(userId, currency = 'USD', client = null) {
  const db = client || pool;
  for (let attempt = 1; attempt <= MAX_WALLET_NUMBER_ATTEMPTS; attempt += 1) {
    const walletNumber = generateWalletNumber();
    if (client) await client.query('SAVEPOINT wallet_number_attempt');
    try {
      const r = await db.query(
        `INSERT INTO wallets (user_id, wallet_number, currency)
         VALUES ($1, $2, $3) RETURNING *`,
        [userId, walletNumber, currency],
      );
      if (client) await client.query('RELEASE SAVEPOINT wallet_number_attempt');
      return r.rows[0];
    } catch (error) {
      if (client) await client.query('ROLLBACK TO SAVEPOINT wallet_number_attempt');
      const isNumberCollision = error.code === '23505' && error.constraint === WALLET_NUMBER_CONSTRAINT;
      if (!isNumberCollision) throw error;
    }
  }
  throw new Error(`Could not generate a unique wallet number after ${MAX_WALLET_NUMBER_ATTEMPTS} attempts`);
}

async function listByUser(userId, db = pool) {
  const r = await db.query('SELECT * FROM wallets WHERE user_id = $1 ORDER BY created_at, id', [userId]);
  return r.rows;
}

async function findById(id, db = pool) {
  const r = await db.query('SELECT * FROM wallets WHERE id = $1', [id]);
  return r.rows[0];
}

async function findByNumber(walletNumber, db = pool) {
  const r = await db.query('SELECT * FROM wallets WHERE wallet_number = $1', [walletNumber]);
  return r.rows[0];
}

async function setStatus(client, id, status) {
  const r = await client.query('UPDATE wallets SET status = $2 WHERE id = $1 RETURNING *', [id, status]);
  return r.rows[0];
}

module.exports = {
  create,
  listByUser,
  findById,
  findByNumber,
  setStatus,
  generateWalletNumber,
  MAX_WALLET_NUMBER_ATTEMPTS,
};
