const request = require("supertest");
const app = require("../../src/app");
const pool = require("../../src/config/db");
const { authLimiter } = require("../../src/middleware/rateLimiter");

let ipSequence = 1;
let userSequence = 1;
const rateLimitIp = "198.51.100.77";

function api(method, url) {
  const ip = `203.0.113.${(ipSequence++ % 200) + 1}`;
  return request(app)[method](url).set("X-Forwarded-For", ip);
}

async function register(email = `user${userSequence++}@example.com`) {
  const response = await api("post", "/api/v1/auth/register").send({
    email,
    password: "Password123",
    fullName: "Test User",
  });
  return response.body.data;
}

async function balance(token, walletId) {
  const response = await api("get", `/api/v1/wallets/${walletId}/balance`)
    .set("Authorization", `Bearer ${token}`);
  return response.body.data.balance;
}

beforeEach(async () => {
  await pool.query(`TRUNCATE TABLE audit_log, idempotency_keys, merchant_payments, merchants,
    gateway_transactions, payment_requests, transfers, transactions, wallets, users
    RESTART IDENTITY CASCADE`);
  await authLimiter.resetKey(rateLimitIp);
});

afterAll(async () => {
  await pool.end();
});

describe("authentication", () => {
  test("registers, logs in, returns /me, rejects invalid credentials and duplicate email", async () => {
    const email = `auth${userSequence++}@example.com`;
    const registered = await api("post", "/api/v1/auth/register").send({
      email, password: "Password123", fullName: "Auth User",
    });
    expect(registered.status).toBe(201);

    const duplicate = await api("post", "/api/v1/auth/register").send({
      email, password: "Password123", fullName: "Auth User",
    });
    expect(duplicate.status).toBe(409);

    const invalid = await api("post", "/api/v1/auth/login").send({ email, password: "wrongpass" });
    expect(invalid.status).toBe(401);

    const login = await api("post", "/api/v1/auth/login").send({ email, password: "Password123" });
    expect(login.status).toBe(200);
    const me = await api("get", "/api/v1/auth/me").set("Authorization", `Bearer ${login.body.data.token}`);
    expect(me.status).toBe(200);
    expect(me.body.data.email).toBe(email);
  });
});

test("health endpoint checks PostgreSQL readiness", async () => {
  const response = await api("get", "/api/v1/health");
  expect(response.status).toBe(200);
  expect(response.body.success).toBe(true);
});

test("migrations install required indexes and updated_at triggers", async () => {
  const expectedIndexes = [
    "idx_wallets_user_id",
    "idx_transactions_wallet_id",
    "idx_transactions_created_at",
    "idx_transactions_type",
    "idx_payment_requests_requester",
    "idx_payment_requests_payer",
    "idx_payment_requests_status",
  ];
  const indexes = await pool.query(
    "SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1::text[])",
    [expectedIndexes],
  );
  expect(indexes.rows.map((row) => row.indexname)).toEqual(expect.arrayContaining(expectedIndexes));

  const user = await register();
  const updated = await pool.query(
    "UPDATE wallets SET balance = balance WHERE id = $1 RETURNING updated_at = CURRENT_TIMESTAMP AS touched",
    [user.wallet.id],
  );
  expect(updated.rows[0].touched).toBe(true);
});

describe("wallet operations", () => {
  test("tops up, withdraws, transfers, and rejects invalid destinations or insufficient funds", async () => {
    const sender = await register();
    const recipient = await register();
    const token = sender.token;
    const wallet = sender.wallet;

    expect((await api("post", `/api/v1/wallets/${wallet.id}/top-up`)
      .set("Authorization", `Bearer ${token}`).send({ amount: "50.00" })).status).toBe(201);
    expect((await api("post", `/api/v1/wallets/${wallet.id}/withdraw`)
      .set("Authorization", `Bearer ${token}`).send({ amount: "10.00" })).status).toBe(201);
    expect(await balance(token, wallet.id)).toBe("40.00");

    const transfer = (toWalletNumber, amount) => api("post", "/api/v1/transfers")
      .set("Authorization", `Bearer ${token}`)
      .send({ fromWalletId: wallet.id, toWalletNumber, amount });
    expect((await transfer(recipient.wallet.wallet_number, "15.25")).status).toBe(201);
    expect(await balance(token, wallet.id)).toBe("24.75");

    const recipientBalance = await balance(recipient.token, recipient.wallet.id);
    expect(recipientBalance).toBe("15.25");
    expect((await transfer(recipient.wallet.wallet_number, "999.99")).status).toBe(400);
    expect((await transfer(wallet.wallet_number, "1.00")).status).toBe(400);
    expect((await transfer("PAYNX-000000", "1.00")).status).toBe(404);
  });

  test("supports transaction history pagination and type filtering", async () => {
    const user = await register();
    const auth = { Authorization: `Bearer ${user.token}` };
    await api("post", `/api/v1/wallets/${user.wallet.id}/top-up`).set(auth).send({ amount: "1.25" });
    await api("post", `/api/v1/wallets/${user.wallet.id}/top-up`).set(auth).send({ amount: "2.50" });
    await api("post", `/api/v1/wallets/${user.wallet.id}/withdraw`).set(auth).send({ amount: "1.00" });

    const page = await api("get", "/api/v1/history?limit=1&offset=1").set(auth);
    expect(page.status).toBe(200);
    expect(page.body.data).toHaveLength(1);
    const topUps = await api("get", "/api/v1/history?type=top_up&limit=10&offset=0").set(auth);
    expect(topUps.body.data).toHaveLength(2);
    expect(topUps.body.data[0].currency).toBe("USD");
    expect(topUps.body.data.every((tx) => tx.type === "top_up")).toBe(true);
    expect((await api("get", "/api/v1/history?type=not-real").set(auth)).status).toBe(400);
  });
});

describe("merchant and payment request flows", () => {
  test("creates and pays a request, and replays duplicate merchant payment safely", async () => {
    const requester = await register();
    const payer = await register();
    const requesterAuth = { Authorization: `Bearer ${requester.token}` };
    const payerAuth = { Authorization: `Bearer ${payer.token}` };
    await api("post", `/api/v1/wallets/${payer.wallet.id}/top-up`).set(payerAuth).send({ amount: "20.00" });

    const createdRequest = await api("post", "/api/v1/payment-requests").set(requesterAuth).send({
      requesterWalletId: requester.wallet.id,
      payerEmail: payer.user.email,
      amount: "5.25",
    });
    expect(createdRequest.status).toBe(201);
    const paidRequest = await api("post", `/api/v1/payment-requests/${createdRequest.body.data.id}/approve`)
      .set(payerAuth).send({ fromWalletId: payer.wallet.id });
    expect(paidRequest.body.data.paymentRequest.status).toBe("paid");

    const merchant = await api("post", "/api/v1/merchants").set(payerAuth).send({ name: "Test Shop" });
    const payment = () => api("post", "/api/v1/merchants/pay")
      .set(payerAuth)
      .set("Idempotency-Key", "merchant-payment-1")
      .send({ merchantId: merchant.body.data.id, amount: "2.00" });
    const first = await payment();
    const replay = await payment();
    expect(first.status).toBe(200);
    expect(replay.body).toEqual(first.body);
    const conflict = await api("post", "/api/v1/merchants/pay")
      .set(payerAuth)
      .set("Idempotency-Key", "merchant-payment-1")
      .send({ merchantId: merchant.body.data.id, amount: "3.00" });
    expect(conflict.status).toBe(409);
    const count = await pool.query("SELECT COUNT(*) FROM merchant_payments");
    expect(count.rows[0].count).toBe("1");
  });
});

test("rate limiting returns 429 after the configured threshold", async () => {
  await authLimiter.resetKey(rateLimitIp);
  const send = () => request(app).post("/api/v1/auth/login")
    .set("X-Forwarded-For", rateLimitIp)
    .send({});
  expect((await send()).status).toBe(400);
  expect((await send()).status).toBe(400);
  expect((await send()).status).toBe(400);
  expect((await send()).status).toBe(429);
});