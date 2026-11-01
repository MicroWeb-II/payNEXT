const pool = require('../../src/config/db');

const TABLES = [
  'audit_log',
  'refresh_tokens',
  'idempotency_keys',
  'merchant_payments',
  'merchants',
  'gateway_transactions',
  'payment_requests',
  'transfers',
  'transactions',
  'wallets',
  'users',
];

/**
 * Empty every table between tests. audit_log rejects TRUNCATE through a
 * trigger, so triggers are bypassed for this session only (requires the
 * superuser test role; never do this outside tests).
 */
async function resetDatabase() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET LOCAL session_replication_role = replica');
    await client.query(`TRUNCATE TABLE ${TABLES.join(', ')} RESTART IDENTITY CASCADE`);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

module.exports = { pool, resetDatabase };
