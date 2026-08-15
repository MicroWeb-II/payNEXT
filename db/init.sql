-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Custom Data Types (Enums)
CREATE TYPE user_status AS ENUM ('active', 'suspended', 'deleted');
CREATE TYPE wallet_status AS ENUM ('active', 'frozen', 'closed');
CREATE TYPE transaction_type AS ENUM ('top_up', 'withdrawal', 'transfer_in', 'transfer_out', 'request_in', 'request_out');
CREATE TYPE transaction_status AS ENUM ('pending', 'completed', 'failed', 'cancelled');
CREATE TYPE request_status AS ENUM ('pending', 'paid', 'declined', 'cancelled');

-- 1. USERS TABLE
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(20),
    status user_status DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. WALLETS TABLE
CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    wallet_number VARCHAR(50) UNIQUE NOT NULL,
    currency VARCHAR(3) DEFAULT 'USD',
    balance NUMERIC(15, 2) DEFAULT 0.00 CHECK (balance >= 0),
    status wallet_status DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. MASTER LEDGER (TRANSACTIONS)
CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    type transaction_type NOT NULL,
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    balance_after NUMERIC(15, 2) NOT NULL,
    reference_id UUID, -- Links to transfers, requests, or gateway logs
    description TEXT,
    status transaction_status DEFAULT 'completed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 4. INTERNAL P2P TRANSFERS
CREATE TABLE transfers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    to_wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL,
    status transaction_status DEFAULT 'completed',
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 5. PAYMENT REQUESTS
CREATE TABLE payment_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    payer_wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL,
    payer_email VARCHAR(255), -- Used if requesting from an unregistered email
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL,
    status request_status DEFAULT 'pending',
    note TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 6. PAYMENT GATEWAY LOGS (Stripe, PayPal, Mock Bank)
CREATE TABLE gateway_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    provider VARCHAR(50) NOT NULL, -- 'stripe', 'razorpay', 'mock'
    provider_transaction_id VARCHAR(255),
    type VARCHAR(20) NOT NULL CHECK (type IN ('top_up', 'withdrawal')),
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL,
    status transaction_status DEFAULT 'pending',
    metadata JSONB, -- Stores raw JSON response from the payment gateway
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for fast querying
CREATE INDEX idx_wallets_user_id ON wallets(user_id);
CREATE INDEX idx_transactions_wallet_id ON transactions(wallet_id);
CREATE INDEX idx_transactions_type ON transactions(type);
CREATE INDEX idx_transfers_from_wallet ON transfers(from_wallet_id);
CREATE INDEX idx_transfers_to_wallet ON transfers(to_wallet_id);
CREATE INDEX idx_payment_requests_requester ON payment_requests(requester_wallet_id);
CREATE INDEX idx_gateway_wallet ON gateway_transactions(wallet_id);

-- 7. MERCHANTS
CREATE TABLE merchants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    api_key VARCHAR(255) UNIQUE NOT NULL,
    status user_status DEFAULT 'active',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 8. MERCHANT PAYMENTS
CREATE TABLE merchant_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    amount NUMERIC(15, 2) NOT NULL CHECK (amount > 0),
    currency VARCHAR(3) NOT NULL,
    status transaction_status DEFAULT 'completed',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_merchant_payments_merchant ON merchant_payments(merchant_id);
CREATE INDEX idx_merchant_payments_wallet ON merchant_payments(wallet_id);