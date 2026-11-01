const { Pool } = require('pg');
const config = require('./env');
const logger = require('../observability/logger');

const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  user: config.db.user,
  password: config.db.password,
  database: config.db.database,
  max: config.db.poolMax,
  idleTimeoutMillis: config.db.idleTimeoutMs,
  connectionTimeoutMillis: config.db.connectionTimeoutMs,
  statement_timeout: config.db.statementTimeoutMs,
  application_name: 'paynext-api',
  ssl: config.db.ssl ? { rejectUnauthorized: config.db.sslRejectUnauthorized } : false,
});

// An idle client can error (e.g. the database restarts). Without a listener
// the error is emitted on the pool and crashes the process.
pool.on('error', (error) => {
  logger.error({ err: error }, 'Unexpected error on idle PostgreSQL client');
});

/** Readiness probe used by the health endpoint. */
async function checkReadiness() {
  await pool.query('SELECT 1');
}

module.exports = pool;
module.exports.checkReadiness = checkReadiness;
