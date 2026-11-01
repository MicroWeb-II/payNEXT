const { api, register, topUp, balance } = require('../helpers/api');
const { pool, resetDatabase } = require('../helpers/db');
const { resetAll } = require('../../src/middleware/rateLimiter');

beforeEach(async () => {
  await resetDatabase();
  await resetAll();
});

afterAll(() => pool.end());

test('same key and payload returns the stored response without moving money twice', async () => {
  const sender = await register();
  const recipient = await register();
  await topUp(sender, '10.00');
  const send = (amount) => api('post', '/api/v1/transfers')
    .set(sender.auth)
    .set('Idempotency-Key', 'transfer-key-0001')
    .send({ fromWalletId: sender.wallet.id, toWalletNumber: recipient.wallet.wallet_number, amount });

  const first = await send('4.00');
  const second = await send('4.00');
  expect(first.status).toBe(201);
  expect(second.status).toBe(201);
  expect(second.body).toEqual(first.body);
  expect(await balance(sender)).toBe('6.00');

  const different = await send('5.00');
  expect(different.status).toBe(409);
  expect(await balance(sender)).toBe('6.00');
});

test('concurrent requests with one key move money once', async () => {
  const user = await register();
  const results = await Promise.all(
    Array.from({ length: 5 }, () =>
      api('post', `/api/v1/wallets/${user.wallet.id}/top-up`)
        .set(user.auth)
        .set('Idempotency-Key', 'concurrent-top-up-1')
        .send({ amount: '1.00' })),
  );
  expect(results.filter((r) => r.status === 201).length).toBeGreaterThanOrEqual(1);
  expect(results.every((r) => [201, 409].includes(r.status))).toBe(true);
  expect(await balance(user)).toBe('1.00');
});

test('keys are scoped per user and per endpoint', async () => {
  const a = await register();
  const b = await register();
  const key = 'shared-key-value-01';
  const r1 = await api('post', `/api/v1/wallets/${a.wallet.id}/top-up`).set(a.auth).set('Idempotency-Key', key).send({ amount: '1.00' });
  const r2 = await api('post', `/api/v1/wallets/${b.wallet.id}/top-up`).set(b.auth).set('Idempotency-Key', key).send({ amount: '1.00' });
  expect([r1.status, r2.status]).toEqual([201, 201]);
});

test('client errors are stored and replayed; malformed keys are rejected', async () => {
  const user = await register();
  const withdraw = () => api('post', `/api/v1/wallets/${user.wallet.id}/withdraw`)
    .set(user.auth).set('Idempotency-Key', 'withdraw-key-0001').send({ amount: '5.00' });
  expect((await withdraw()).status).toBe(400);
  const replay = await withdraw();
  expect(replay.status).toBe(400);
  expect(replay.headers['idempotent-replayed']).toBe('true');

  const bad = await api('post', `/api/v1/wallets/${user.wallet.id}/top-up`).set(user.auth).set('Idempotency-Key', 'short').send({ amount: '1.00' });
  expect(bad.status).toBe(400);
});

test('expired keys can be reused', async () => {
  const user = await register();
  const send = () => api('post', `/api/v1/wallets/${user.wallet.id}/top-up`).set(user.auth).set('Idempotency-Key', 'expiring-key-0001').send({ amount: '1.00' });
  await send();
  await pool.query("UPDATE idempotency_keys SET created_at = NOW() - INTERVAL '25 hours'");
  const again = await send();
  expect(again.status).toBe(201);
  expect(again.headers['idempotent-replayed']).toBeUndefined();
  expect(await balance(user)).toBe('2.00');
});
