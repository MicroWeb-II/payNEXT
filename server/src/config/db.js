require("dotenv").config();
const { Pool } = require("pg");

const isNeon = (process.env.DB_HOST || "").endsWith(".neon.tech");

const pool = new Pool({
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || 5432),
  user: process.env.DB_USER || "paynext",
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || "paynext_db",
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: Number(process.env.DB_IDLE_TIMEOUT_MS || 30000),
  connectionTimeoutMillis: Number(process.env.DB_CONNECTION_TIMEOUT_MS || 5000),
  ssl:
    process.env.DB_SSL === "true" || isNeon
      ? { rejectUnauthorized: false }
      : false,
});

module.exports = pool;
