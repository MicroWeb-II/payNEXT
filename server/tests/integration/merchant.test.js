const { api, register, registerAdmin, topUp, balance } = require('../helpers/api');
const { pool, resetDatabase } = require('../helpers/db');
const { resetAll } = require('../../src/middleware/rateLimiter');

beforeEach(async () => {
  await resetDatabase();
  await resetAll();
});

afterAll(() => pool.end());

async function createMerchant(admin, name = 'Test Shop') {
  const res = await api('post', '/api/v1/merchants').set(admin.auth).send({ name });
  expect(res.status).toBe(201);
  return res.body.data;
}

test('only admins can create, update and delete merchants', async () => {
  const user = await register();
  const admin = await registerAdmin();
  expect((await api('post', '/api/v1/merchants').set(user.auth).send({ name: 'Nope' })).status).toBe(403);

  const merchant = await createMerchant(admin);
  expect(merchant.api_key).toMatch(/^pk_[a-f0-9]{48}$/);
  expect((await api('put', `/api/v1/merchants/${merchant.id}`).set(user.auth).send({ name: 'X', status: 'suspended' })).status).toBe(403);
  expect((await api('delete', `/api/v1/merchants/${merchant.id}`).set(user.auth)).status).toBe(403);

  const updated = await api('put', `/api/v1/merchants/${merchant.id}`).set(admin.auth).send({ name: 'Renamed', status: 'suspended' });
  expect(updated.status).toBe(200);
  expect(updated.body.data.status).toBe('suspended');
});

test('merchant API keys are never shown to regular users', async () => {
  const admin = await registerAdmin();
  const user = await register();
  const merchant = await createMerchant(admin);
  const list = await api('get', '/api/v1/merchants').set(user.auth);
  expect(list.body.data[0]).not.toHaveProperty('api_key');
  const one = await api('get', `/api/v1/merchants/${merchant.id}`).set(user.auth);
  expect(one.body.data).not.toHaveProperty('api_key');
});

test('pays a merchant, records the ledger and keeps history after soft delete', async () => {
  const admin = await registerAdmin();
  const payer = await register();
  await topUp(payer, '20.00');
  const merchant = await createMerchant(admin);

  const res = await api('post', '/api/v1/merchants/pay').set(payer.auth).send({ merchantId: merchant.id, amount: '2.00' });
  expect(res.status).toBe(200);
  expect(res.body.data.newBalance).toBe('18.00');
  const ledger = await pool.query("SELECT type FROM transactions WHERE wallet_id = $1 AND type = 'merchant_payment'", [payer.wallet.id]);
  expect(ledger.rowCount).toBe(1);

  expect((await api('delete', `/api/v1/merchants/${merchant.id}`).set(admin.auth)).status).toBe(200);
  const payments = await pool.query('SELECT COUNT(*)::int AS n FROM merchant_payments');
  expect(payments.rows[0].n).toBe(1);
  expect((await api('get', `/api/v1/merchants/${merchant.id}`).set(payer.auth)).status).toBe(404);
  expect((await api('post', '/api/v1/merchants/pay').set(payer.auth).send({ merchantId: merchant.id, amount: '1.00' })).status).toBe(404);
});

test('rejects payments to suspended merchants and with insufficient funds', async () => {
  const admin = await registerAdmin();
  const payer = await register();
  await topUp(payer, '1.00');
  const merchant = await createMerchant(admin);
  expect((await api('post', '/api/v1/merchants/pay').set(payer.auth).send({ merchantId: merchant.id, amount: '5.00' })).status).toBe(400);
  await api('put', `/api/v1/merchants/${merchant.id}`).set(admin.auth).send({ name: 'Shop', status: 'suspended' });
  expect((await api('post', '/api/v1/merchants/pay').set(payer.auth).send({ merchantId: merchant.id, amount: '0.50' })).status).toBe(409);
  expect(await balance(payer)).toBe('1.00');
});

test('a duplicate merchant payment with the same Idempotency-Key charges once', async () => {
  const admin = await registerAdmin();
  const payer = await register();
  await topUp(payer, '20.00');
  const merchant = await createMerchant(admin);

  const pay = (amount) => api('post', '/api/v1/merchants/pay')
    .set(payer.auth)
    .set('Idempotency-Key', 'merchant-payment-0001')
    .send({ merchantId: merchant.id, amount });

  const first = await pay('2.00');
  const replay = await pay('2.00');
  expect(first.status).toBe(200);
  expect(replay.status).toBe(200);
  expect(replay.headers['idempotent-replayed']).toBe('true');
  expect(replay.body).toEqual(first.body);

  const conflict = await pay('3.00');
  expect(conflict.status).toBe(409);

  const count = await pool.query('SELECT COUNT(*)::int AS n FROM merchant_payments');
  expect(count.rows[0].n).toBe(1);
  expect(await balance(payer)).toBe('18.00');
});
