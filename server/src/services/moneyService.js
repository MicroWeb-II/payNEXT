const pool = require("../config/db");

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function withTransaction(fn, maxRetries = 3) {
  for (let attempt = 0; ; attempt += 1) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch (rollbackError) {
        error.rollbackError = rollbackError;
      }
      if (
        attempt >= maxRetries ||
        !["40001", "40P01"].includes(error.code)
      ) {
        throw error;
      }
    } finally {
      client.release();
    }
    await new Promise((resolve) => setTimeout(resolve, 10 * 2 ** attempt));
  }
}

function normalizeAmount(amount) {
  const value = String(amount);
  if (!/^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(value) || !/[1-9]/.test(value)) {
    throw new ApiError("amount must be positive with at most 2 decimal places", 400);
  }
  const [whole, fraction = ""] = value.split(".");
  const cents = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  if (cents > 100000000n) throw new ApiError("amount must not exceed 1,000,000", 400);
  return value;
}

async function lockWallet(client, id) {
  const r = await client.query(
    "SELECT * FROM wallets WHERE id = $1 FOR UPDATE",
    [id],
  );
  return r.rows[0];
}

async function adjustBalance(client, wallet, amount, direction) {
  const multiplier = direction === "debit" ? -1 : 1;
  const result = await client.query(
    `UPDATE wallets
     SET balance = balance + ($1::numeric * $2), updated_at = CURRENT_TIMESTAMP
     WHERE id = $3 AND ($2 = 1 OR balance >= $1::numeric)
     RETURNING balance`,
    [amount, multiplier, wallet.id],
  );
  return result.rows[0]?.balance;
}

async function logTx(
  client,
  { walletId, type, amount, balanceAfter, referenceId, description },
) {
  const r = await client.query(
    `INSERT INTO transactions (wallet_id, type, amount, balance_after, reference_id, description, currency)
     SELECT id, $2, $3, $4, $5, $6, currency FROM wallets WHERE id = $1 RETURNING *`,
    [walletId, type, amount, balanceAfter, referenceId, description],
  );
  return r.rows[0];
}

async function gatewayLog(
  client,
  { walletId, provider, providerRef, type, amount, currency, status },
) {
  const r = await client.query(
    `INSERT INTO gateway_transactions (wallet_id, provider, provider_transaction_id, type, amount, currency, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [walletId, provider, providerRef, type, amount, currency, status],
  );
  return r.rows[0];
}

module.exports = {
  ApiError,
  normalizeAmount,
  withTransaction,
  lockWallet,
  adjustBalance,
  logTx,
  gatewayLog,
};
