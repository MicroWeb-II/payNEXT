exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE IF NOT EXISTS idempotency_keys (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      idempotency_key VARCHAR(255),
      key VARCHAR(255),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      endpoint VARCHAR(255),
      request_hash CHAR(64),
      response_status INTEGER,
      response_body JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ
    );

    ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(255);
    ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS key VARCHAR(255);
    ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS endpoint VARCHAR(255);
    ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS request_hash CHAR(64);
    ALTER TABLE idempotency_keys ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ;

    UPDATE idempotency_keys SET idempotency_key = key WHERE idempotency_key IS NULL;
    UPDATE idempotency_keys SET key = idempotency_key WHERE key IS NULL;
    UPDATE idempotency_keys SET endpoint = 'legacy' WHERE endpoint IS NULL;
    UPDATE idempotency_keys SET updated_at = created_at WHERE updated_at IS NULL;
    ALTER TABLE idempotency_keys ALTER COLUMN idempotency_key SET NOT NULL;
    ALTER TABLE idempotency_keys ALTER COLUMN endpoint SET NOT NULL;
    ALTER TABLE idempotency_keys ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE idempotency_keys ALTER COLUMN updated_at SET NOT NULL;
    ALTER TABLE idempotency_keys ALTER COLUMN response_status DROP NOT NULL;
    ALTER TABLE idempotency_keys ALTER COLUMN response_body DROP NOT NULL;

    DO $$ DECLARE constraint_record RECORD;
    BEGIN
      FOR constraint_record IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'idempotency_keys'::regclass AND contype = 'u'
      LOOP
        EXECUTE format('ALTER TABLE idempotency_keys DROP CONSTRAINT %I', constraint_record.conname);
      END LOOP;
    END $$;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_idempotency_keys_unique
      ON idempotency_keys(idempotency_key, user_id, endpoint);
    CREATE INDEX IF NOT EXISTS idx_idempotency_keys_updated_at ON idempotency_keys(updated_at);
    DROP TRIGGER IF EXISTS idempotency_keys_set_updated_at ON idempotency_keys;
    CREATE TRIGGER idempotency_keys_set_updated_at
      BEFORE UPDATE ON idempotency_keys
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);
};

exports.down = (pgm) => {
  pgm.sql("DROP TABLE IF EXISTS idempotency_keys;");
};