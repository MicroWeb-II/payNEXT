const { api, register, topUp } = require('../helpers/api');
const { pool, resetDatabase } = require('../helpers/db');
const { resetAll } = require('../../src/middleware/rateLimiter');

beforeEach(async () => {
  await resetDatabase();
  await resetAll();
});

afterAll(() => pool.end());

test('history is newest first, paginated and filterable by type', async () => {
  const user = await register();
  await topUp(user, '1.25');
  await topUp(user, '2.50');
  await api('post', `/api/v1/wallets/${user.wallet.id}/withdraw`).set(user.auth).send({ amount: '1.00' });

  const all = await api('get', '/api/v1/history').set(user.auth);
  expect(all.status).toBe(200);
  expect(all.body.total).toBe(3);
  expect(all.body.data.map((t) => t.type)).toEqual(['withdrawal', 'top_up', 'top_up']);
  expect(all.body.data[0].balance_after).toBe('2.75');

  const page = await api('get', '/api/v1/history?limit=1&offset=1').set(user.auth);
  expect(page.body.data).toHaveLength(1);
  expect(page.body.data[0].amount).toBe('2.50');
  expect(page.body).toMatchObject({ limit: 1, offset: 1, total: 3 });

  const topUps = await api('get', '/api/v1/history?type=top_up').set(user.auth);
  expect(topUps.body.data).toHaveLength(2);
  expect(topUps.body.total).toBe(2);
  expect(topUps.body.data.every((t) => t.type === 'top_up' && t.currency === 'USD')).toBe(true);
});

test('rejects invalid query parameters', async () => {
  const user = await register();
  for (const qs of ['type=not-real', 'limit=0', 'limit=101', 'offset=-1', 'walletId=nope']) {
    expect((await api('get', `/api/v1/history?${qs}`).set(user.auth)).status).toBe(400);
  }
});

test('per-wallet transaction endpoint is scoped to the owner', async () => {
  const user = await register();
  const other = await register();
  await topUp(user, '3.00');
  const own = await api('get', `/api/v1/wallets/${user.wallet.id}/transactions?limit=5`).set(user.auth);
  expect(own.status).toBe(200);
  expect(own.body.data).toHaveLength(1);
  expect((await api('get', `/api/v1/wallets/${user.wallet.id}/transactions`).set(other.auth)).status).toBe(404);

  const scoped = await api('get', `/api/v1/history?walletId=${user.wallet.id}`).set(other.auth);
  expect(scoped.status).toBe(404);
});
