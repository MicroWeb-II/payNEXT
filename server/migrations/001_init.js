exports.up = (pgm) => {
  pgm.sql(`
    CREATE EXTENSION IF NOT EXISTS "pgcrypto";

    DO $$ BEGIN CREATE TYPE user_status AS ENUM ('active', 'suspended', 'deleted');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE wallet_status AS ENUM ('active', 'frozen', 'closed');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE transaction_type AS ENUM ('top_up', 'withdrawal', 'transfer_in', 'transfer_out', 'request_in', 'request_out');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE transaction_status AS ENUM ('pending', 'completed', 'failed', 'cancelled');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    DO $$ BEGIN CREATE TYPE request_status AS ENUM ('pending', 'paid', 'declined', 'cancelled');
    EXCEPTION WHEN duplicate_object THEN NULL; END $$;

    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email VARCHAR(255) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      full_name VARCHAR(100) NOT NULL,
      phone VARCHAR(20),
      role VARCHAR(20) NOT NULL DEFAULT 'user',
      status user_status DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS wallets (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      wallet_number VARCHAR(50) UNIQUE NOT NULL,
      currency VARCHAR(3) DEFAULT 'USD',
      balance NUMERIC(15, 2) DEFAULT 0.00 CHECK (balance >= 0),
      status wallet_status DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
      type transaction_type NOT NULL,
      amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
      balance_after NUMERIC(15, 2) NOT NULL,
      currency VARCHAR(3),
      reference_id UUID,
      description TEXT,
      status transaction_status DEFAULT 'completed',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS transfers (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      from_wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
      to_wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
      amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
      currency VARCHAR(3) NOT NULL,
      status transaction_status DEFAULT 'completed',
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS payment_requests (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      requester_wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
      payer_wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL,
      payer_email VARCHAR(255),
      amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
      currency VARCHAR(3) NOT NULL,
      status request_status DEFAULT 'pending',
      note TEXT,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS gateway_transactions (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
      provider VARCHAR(50) NOT NULL,
      provider_transaction_id VARCHAR(255),
      type VARCHAR(20) NOT NULL CHECK (type IN ('top_up', 'withdrawal')),
      amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
      currency VARCHAR(3) NOT NULL,
      status transaction_status DEFAULT 'pending',
      metadata JSONB,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS merchants (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      name VARCHAR(255) NOT NULL,
      api_key VARCHAR(255) UNIQUE NOT NULL,
      status user_status DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );
    CREATE TABLE IF NOT EXISTS merchant_payments (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
      wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
      amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
      currency VARCHAR(3) NOT NULL,
      status transaction_status DEFAULT 'completed',
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    );

    ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user';
    ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE wallets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS currency VARCHAR(3);
    ALTER TABLE transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
    UPDATE transactions t SET currency = w.currency FROM wallets w WHERE t.wallet_id = w.id AND t.currency IS NULL;
    ALTER TABLE transactions ALTER COLUMN currency SET NOT NULL;
    ALTER TABLE transfers ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE payment_requests ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE gateway_transactions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE merchants ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
    ALTER TABLE merchant_payments ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;

    CREATE INDEX IF NOT EXISTS idx_wallets_user_id ON wallets(user_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_wallet_id ON transactions(wallet_id);
    CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions(created_at);
    CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);
    CREATE INDEX IF NOT EXISTS idx_payment_requests_requester ON payment_requests(requester_wallet_id);
    CREATE INDEX IF NOT EXISTS idx_payment_requests_payer ON payment_requests(payer_wallet_id);
    CREATE INDEX IF NOT EXISTS idx_payment_requests_status ON payment_requests(status);
    CREATE INDEX IF NOT EXISTS idx_transfers_from_wallet ON transfers(from_wallet_id);
    CREATE INDEX IF NOT EXISTS idx_transfers_to_wallet ON transfers(to_wallet_id);
    CREATE INDEX IF NOT EXISTS idx_gateway_wallet ON gateway_transactions(wallet_id);
    CREATE INDEX IF NOT EXISTS idx_merchant_payments_merchant ON merchant_payments(merchant_id);
    CREATE INDEX IF NOT EXISTS idx_merchant_payments_wallet ON merchant_payments(wallet_id);

    CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = CURRENT_TIMESTAMP;
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
    DO $$ DECLARE table_name TEXT;
    BEGIN
      FOREACH table_name IN ARRAY ARRAY['users', 'wallets', 'transactions', 'transfers', 'payment_requests', 'gateway_transactions', 'merchants', 'merchant_payments'] LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I_set_updated_at ON %I', table_name, table_name);
        EXECUTE format('CREATE TRIGGER %I_set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()', table_name, table_name);
      END LOOP;
    END $$;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS merchant_payments, merchants, gateway_transactions, payment_requests, transfers, transactions, wallets, users CASCADE;
    DROP FUNCTION IF EXISTS set_updated_at();
    DROP TYPE IF EXISTS request_status, transaction_status, transaction_type, wallet_status, user_status;
  `);
};