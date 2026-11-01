/**
 * Phase 1 security hardening:
 *  - refresh_tokens table for rotating, revocable refresh tokens
 *  - audit_log fully append-only (UPDATE, DELETE and TRUNCATE blocked) and
 *    decoupled from users so audit rows survive any user lifecycle change
 *  - ledger types for merchant payments and admin adjustments
 *  - idempotency_keys cleanup of the legacy duplicate `key` column
 *  - role constraint on users
 */
exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS refresh_tokens (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      family_id UUID NOT NULL,
      token_hash CHAR(64) NOT NULL UNIQUE,
      expires_at TIMESTAMPTZ NOT NULL,
      revoked_at TIMESTAMPTZ,
      revoked_reason VARCHAR(50),
      replaced_by UUID REFERENCES refresh_tokens(id) ON DELETE SET NULL,
      ip VARCHAR(45),
      user_agent TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user ON refresh_tokens(user_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_family ON refresh_tokens(family_id);
    CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires ON refresh_tokens(expires_at);

    -- audit_log: an UPDATE triggered by ON DELETE SET NULL would be rejected by
    -- the append-only trigger, so the actor reference is kept as a plain UUID.
    ALTER TABLE audit_log DROP CONSTRAINT IF EXISTS audit_log_actor_user_id_fkey;
    ALTER TABLE audit_log ALTER COLUMN metadata SET DEFAULT '{}'::jsonb;
    ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS request_id VARCHAR(64);
    CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON audit_log(entity_type, entity_id);

    DROP TRIGGER IF EXISTS audit_log_no_truncate ON audit_log;
    CREATE TRIGGER audit_log_no_truncate
      BEFORE TRUNCATE ON audit_log
      FOR EACH STATEMENT EXECUTE FUNCTION prevent_audit_log_mutation();

    REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM PUBLIC;
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'paynext_app') THEN
        REVOKE UPDATE, DELETE, TRUNCATE ON audit_log FROM paynext_app;
        GRANT SELECT, INSERT ON audit_log TO paynext_app;
      END IF;
    END $$;

    ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'merchant_payment';
    ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'adjustment_credit';
    ALTER TYPE transaction_type ADD VALUE IF NOT EXISTS 'adjustment_debit';

    DELETE FROM idempotency_keys WHERE request_hash IS NULL;
    ALTER TABLE idempotency_keys DROP COLUMN IF EXISTS key;
    ALTER TABLE idempotency_keys ALTER COLUMN request_hash SET NOT NULL;

    UPDATE users SET role = 'user' WHERE role NOT IN ('user', 'admin');
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('user', 'admin'));
    UPDATE users SET status = 'active' WHERE status IS NULL;
    ALTER TABLE users ALTER COLUMN status SET NOT NULL;
    UPDATE wallets SET status = 'active' WHERE status IS NULL;
    ALTER TABLE wallets ALTER COLUMN status SET NOT NULL;
    ALTER TABLE wallets ALTER COLUMN balance SET NOT NULL;
    ALTER TABLE wallets ALTER COLUMN currency SET NOT NULL;
  `);
};

exports.down = (pgm) => {
  // Enum values cannot be removed in PostgreSQL; they are left in place.
  pgm.sql(`
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE idempotency_keys ALTER COLUMN request_hash DROP NOT NULL;
    DROP TRIGGER IF EXISTS audit_log_no_truncate ON audit_log;
    DROP INDEX IF EXISTS idx_audit_log_entity;
    ALTER TABLE audit_log DROP COLUMN IF EXISTS request_id;
    DROP TABLE IF EXISTS refresh_tokens;
  `);
};
