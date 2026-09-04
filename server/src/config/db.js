require("dotenv").config();
const { Pool } = require("pg");

const isNeon = (process.env.DB_HOST || "").endsWith(".neon.tech");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || "paynext",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "paynext_db",
  ssl:
    process.env.DB_SSL === "true" || isNeon
      ? { rejectUnauthorized: false }
      : false,
});

module.exports = pool;
