exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE idempotency_keys (
      id BIGSERIAL PRIMARY KEY,
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      key VARCHAR(255) NOT NULL,
      request_hash CHAR(64) NOT NULL,
      response_status INTEGER,
      response_body JSONB,
      created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (user_id, key)
    );
    CREATE INDEX idx_idempotency_keys_updated_at ON idempotency_keys(updated_at);
    CREATE TRIGGER idempotency_keys_set_updated_at
      BEFORE UPDATE ON idempotency_keys
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);
};

exports.down = (pgm) => {
  pgm.sql("DROP TABLE IF EXISTS idempotency_keys;");
};