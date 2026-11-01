const crypto = require('crypto');
const pool = require('../config/db');

const PUBLIC_COLUMNS = 'id, name, status, created_at, updated_at';
const ADMIN_COLUMNS = `${PUBLIC_COLUMNS}, api_key`;

function columns(includeSecret) {
  return includeSecret ? ADMIN_COLUMNS : PUBLIC_COLUMNS;
}

async function create({ name }) {
  const apiKey = `pk_${crypto.randomBytes(24).toString('hex')}`;
  const r = await pool.query(
    `INSERT INTO merchants (name, api_key) VALUES ($1, $2) RETURNING ${ADMIN_COLUMNS}`,
    [name, apiKey],
  );
  return r.rows[0];
}

async function findAll({ includeSecret = false, includeDeleted = false } = {}) {
  const r = await pool.query(
    `SELECT ${columns(includeSecret)} FROM merchants
     WHERE ($1 OR status <> 'deleted')
     ORDER BY created_at DESC`,
    [includeDeleted],
  );
  return r.rows;
}

async function findById(id, { includeSecret = false, db = pool } = {}) {
  const r = await db.query(`SELECT ${columns(includeSecret)} FROM merchants WHERE id = $1`, [id]);
  return r.rows[0];
}

async function update(id, { name, status }) {
  const r = await pool.query(
    `UPDATE merchants SET name = $2, status = $3 WHERE id = $1 RETURNING ${ADMIN_COLUMNS}`,
    [id, name, status],
  );
  return r.rows[0];
}

/** Soft delete: payment history referencing the merchant is preserved. */
async function softDelete(id) {
  const r = await pool.query(
    `UPDATE merchants SET status = 'deleted' WHERE id = $1 AND status <> 'deleted' RETURNING ${PUBLIC_COLUMNS}`,
    [id],
  );
  return r.rows[0];
}

async function logPayment(client, { merchantId, walletId, amount, currency }) {
  const r = await client.query(
    `INSERT INTO merchant_payments (merchant_id, wallet_id, amount, currency)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [merchantId, walletId, amount, currency],
  );
  return r.rows[0];
}

module.exports = { create, findAll, findById, update, softDelete, logPayment };
