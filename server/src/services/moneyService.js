/**
 * Money primitives shared by every balance-changing operation.
 *
 * Amounts are carried as decimal strings end to end and all arithmetic happens
 * in PostgreSQL NUMERIC, so no binary floating point ever touches a balance.
 */
const pool = require('../config/db');
const config = require('../config/env');
const { ApiError } = require('../lib/errors');

const RETRYABLE_PG_CODES = new Set(['40001', '40P01']); // serialization_failure, deadlock_detected
const AMOUNT_PATTERN = /^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * Run `fn(client)` inside a transaction. Serialization failures and deadlocks
 * are retried with exponential backoff plus jitter; anything else rolls back
 * and propagates.
 */
async function withTransaction(fn, { maxRetries = 3, isolationLevel } = {}) {
  for (let attempt = 0; ; attempt += 1) {
    const client = await pool.connect();
    try {
      await client.query(isolationLevel ? `BEGIN ISOLATION LEVEL ${isolationLevel}` : 'BEGIN');
      const result = await fn(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
      if (attempt >= maxRetries || !RETRYABLE_PG_CODES.has(error.code)) throw error;
    } finally {
      client.release();
    }
    await sleep(10 * 2 ** attempt + Math.floor(Math.random() * 10));
  }
}

/** Convert a validated decimal string to integer cents (BigInt). */
function toCents(value) {
  const [whole, fraction = ''] = String(value).split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

/**
 * Validate an amount and return its canonical 2-decimal string ("5" -> "5.00").
 * Controllers call this even though route validators already ran: money paths
 * never rely on middleware alone.
 */
function normalizeAmount(amount) {
  if (typeof amount !== 'string' && typeof amount !== 'number') {
    throw new ApiError('amount must be a decimal string such as "10.50"', 400);
  }
  const text = String(amount).trim();
  if (!AMOUNT_PATTERN.test(text) || !/[1-9]/.test(text)) {
    throw new ApiError('amount must be positive with at most 2 decimal places', 400);
  }
  const cents = toCents(text);
  if (cents > config.money.maxAmountCents) {
    throw new ApiError(`amount must not exceed ${(config.money.maxAmountCents / 100n).toLocaleString('en-US')}`, 400);
  }
  const whole = cents / 100n;
  const fraction = String(cents % 100n).padStart(2, '0');
  return `${whole}.${fraction}`;
}

async function lockWallet(client, id) {
  const r = await client.query('SELECT * FROM wallets WHERE id = $1 FOR UPDATE', [id]);
  return r.rows[0];
}

/**
 * Lock several wallets in a deterministic (id) order so two concurrent
 * transfers in opposite directions cannot deadlock each other.
 * Returns a Map of id -> wallet row for the wallets that exist.
 */
async function lockWallets(client, ids) {
  const unique = [...new Set(ids)].sort();
  const r = await client.query(
    'SELECT * FROM wallets WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE',
    [unique],
  );
  return new Map(r.rows.map((row) => [row.id, row]));
}

/** Throw unless the wallet exists, belongs to `userId` (when given) and is active. */
function assertUsableWallet(wallet, { userId, label = 'Wallet' } = {}) {
  if (!wallet) throw new ApiError(`${label} not found`, 404);
  if (userId && wallet.user_id !== userId) throw new ApiError('Not your wallet', 403);
  if (wallet.status !== 'active') throw new ApiError(`${label} is ${wallet.status}`, 409);
  return wallet;
}

async function credit(client, walletId, amount) {
  const r = await client.query(
    'UPDATE wallets SET balance = balance + $1::numeric WHERE id = $2 RETURNING balance',
    [amount, walletId],
  );
  return r.rows[0]?.balance;
}

/** Returns the new balance, or undefined when funds are insufficient. */
async function debit(client, walletId, amount) {
  const r = await client.query(
    `UPDATE wallets SET balance = balance - $1::numeric
     WHERE id = $2 AND balance >= $1::numeric
     RETURNING balance`,
    [amount, walletId],
  );
  return r.rows[0]?.balance;
}

async function adjustBalance(client, wallet, amount, direction) {
  return direction === 'debit' ? debit(client, wallet.id, amount) : credit(client, wallet.id, amount);
}

/**
 * Append a ledger row; currency is copied from the wallet. created_at uses
 * clock_timestamp() (not the transaction start time) so rows for a wallet
 * sort in the order their row locks were acquired, matching balance_after.
 */
async function logTx(client, { walletId, type, amount, balanceAfter, referenceId, description }) {
  const r = await client.query(
    `INSERT INTO transactions (wallet_id, type, amount, balance_after, reference_id, description, currency, created_at)
     SELECT id, $2, $3, $4, $5, $6, currency, clock_timestamp() FROM wallets WHERE id = $1
     RETURNING *`,
    [walletId, type, amount, balanceAfter, referenceId || null, description || null],
  );
  return r.rows[0];
}

async function gatewayLog(client, { walletId, provider, providerRef, type, amount, currency, status }) {
  const r = await client.query(
    `INSERT INTO gateway_transactions (wallet_id, provider, provider_transaction_id, type, amount, currency, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [walletId, provider, providerRef, type, amount, currency, status],
  );
  return r.rows[0];
}

module.exports = {
  ApiError,
  withTransaction,
  normalizeAmount,
  toCents,
  lockWallet,
  lockWallets,
  assertUsableWallet,
  credit,
  debit,
  adjustBalance,
  logTx,
  gatewayLog,
};
