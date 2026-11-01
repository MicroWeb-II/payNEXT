const pool = require('../config/db');

const PUBLIC_COLUMNS = 'id, email, full_name, phone, role, status, created_at, updated_at';

async function findByEmail(email, db = pool) {
  const r = await db.query('SELECT * FROM users WHERE email = $1', [email]);
  return r.rows[0];
}

async function findById(id, db = pool) {
  const r = await db.query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`, [id]);
  return r.rows[0];
}

async function create({ email, passwordHash, fullName, phone }, db = pool) {
  const r = await db.query(
    `INSERT INTO users (email, password_hash, full_name, phone)
     VALUES ($1, $2, $3, $4)
     RETURNING ${PUBLIC_COLUMNS}`,
    [email, passwordHash, fullName, phone || null],
  );
  return r.rows[0];
}

async function findAll({ limit = 100, offset = 0 } = {}) {
  const r = await pool.query(
    `SELECT ${PUBLIC_COLUMNS} FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
    [limit, offset],
  );
  return r.rows;
}

async function lockById(client, id) {
  const r = await client.query(`SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1 FOR UPDATE`, [id]);
  return r.rows[0];
}

async function updateRole(client, id, role) {
  const r = await client.query(
    `UPDATE users SET role = $2 WHERE id = $1 RETURNING ${PUBLIC_COLUMNS}`,
    [id, role],
  );
  return r.rows[0];
}

module.exports = { findByEmail, findById, create, findAll, lockById, updateRole };
