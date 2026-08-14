require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || "paynext",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "paynext_db",
});

module.exports = pool;
