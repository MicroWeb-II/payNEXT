require('dotenv').config();

// JWT_SECRET startup guard — fail fast before binding any port
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || Buffer.byteLength(jwtSecret, 'utf8') < 32) {
  console.error(
    'FATAL: JWT_SECRET must be set and at least 32 characters long.\n' +
    'Set it in your .env file or environment. Refusing to start.',
  );
  process.exit(1);
}

const app = require('./app');
const pool = require('./config/db');

// Auto-migrate database for the live Azure server
const port = process.env.PORT || 3000;
async function start() {
  await pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user'");
  await pool.query(`CREATE TABLE IF NOT EXISTS idempotency_keys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), idempotency_key VARCHAR(255) NOT NULL,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE, endpoint VARCHAR(255) NOT NULL,
    response_status INT, response_body JSONB, created_at TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query('ALTER TABLE idempotency_keys ALTER COLUMN response_status DROP NOT NULL, ALTER COLUMN response_body DROP NOT NULL');
  await pool.query('CREATE UNIQUE INDEX IF NOT EXISTS idx_idempotency_keys_unique ON idempotency_keys(idempotency_key,user_id,endpoint)');
  await pool.query(`CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(), actor_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL, entity_type VARCHAR(100), entity_id UUID, metadata JSONB,
    ip VARCHAR(45), user_agent TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`);
  await pool.query('REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM PUBLIC');
  await pool.query(`CREATE OR REPLACE FUNCTION prevent_audit_log_mutation() RETURNS trigger AS $$
    BEGIN RAISE EXCEPTION 'audit_log is append-only'; END;
    $$ LANGUAGE plpgsql`);
  await pool.query(`DROP TRIGGER IF EXISTS audit_log_append_only ON audit_log`);
  await pool.query(`CREATE TRIGGER audit_log_append_only BEFORE UPDATE OR DELETE ON audit_log
    FOR EACH ROW EXECUTE FUNCTION prevent_audit_log_mutation()`);
  app.listen(port, () => console.log(`payNEXT API listening on port ${port}`));
}

start().catch((err) => {
  console.error('FATAL: database initialization failed:', err.message);
  process.exit(1);
});
