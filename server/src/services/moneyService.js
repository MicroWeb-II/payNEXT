const pool = require("../config/db");

class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function lockWallet(client, id) {
  const r = await client.query(
    "SELECT * FROM wallets WHERE id = $1 FOR UPDATE",
    [id],
  );
  return r.rows[0];
}

async function setBalance(client, wallet, balance) {
  await client.query(
    "UPDATE wallets SET balance = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2",
    [balance, wallet.id],
  );
}

async function logTx(
  client,
  { walletId, type, amount, balanceAfter, referenceId, description },
) {
  const r = await client.query(
    `INSERT INTO transactions (wallet_id, type, amount, balance_after, reference_id, description)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
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
  withTransaction,
  lockWallet,
  setBalance,
  logTx,
  gatewayLog,
};
