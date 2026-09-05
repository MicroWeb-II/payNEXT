const pool = require("../config/db");

async function findByEmail(email) {
  const r = await pool.query("SELECT * FROM users WHERE email = $1", [email]);
  return r.rows[0];
}

async function findById(id) {
  const r = await pool.query(
    "SELECT id, email, full_name, phone, role, status, created_at FROM users WHERE id = $1",
    [id],
  );
  return r.rows[0];
}

async function create({ email, passwordHash, fullName, phone }) {
  const r = await pool.query(
    `INSERT INTO users (email, password_hash, full_name, phone)
     VALUES ($1, $2, $3, $4)
     RETURNING id, email, full_name, phone, role, status, created_at`,
    [email, passwordHash, fullName, phone],
  );
  return r.rows[0];
}

async function findAll() {
  const r = await pool.query(
    "SELECT id, email, full_name, phone, role, status, created_at FROM users ORDER BY created_at DESC"
  );
  return r.rows;
}

module.exports = { findByEmail, findById, create, findAll };
