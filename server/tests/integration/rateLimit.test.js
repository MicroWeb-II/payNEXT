// Small limits for this file only; jest gives each test file its own modules.
process.env.RATE_LIMIT_AUTH_MAX = '3';
process.env.RATE_LIMIT_MONEY_MAX = '2';
process.env.RATE_LIMIT_READ_MAX = '3';

const { api, register } = require('../helpers/api');
const { pool, resetDatabase } = require('../helpers/db');
const { resetAll } = require('../../src/middleware/rateLimiter');

beforeEach(async () => {
  await resetDatabase();
  await resetAll();
});

afterAll(() => pool.end());

test('login returns 429 after the threshold for one IP + email', async () => {
  const ip = '198.51.100.77';
  const attempt = () => api('post', '/api/v1/auth/login', ip).send({ email: 'victim@example.com', password: 'Wrong12345' });
  expect((await attempt()).status).toBe(401);
  expect((await attempt()).status).toBe(401);
  expect((await attempt()).status).toBe(401);
  const limited = await attempt();
  expect(limited.status).toBe(429);
  expect(limited.headers).toHaveProperty('ratelimit');
});

test('money movement is limited per user even across IPs', async () => {
  const user = await register();
  const topUp = () => api('post', `/api/v1/wallets/${user.wallet.id}/top-up`).set(user.auth).send({ amount: '1.00' });
  expect((await topUp()).status).toBe(201);
  expect((await topUp()).status).toBe(201);
  expect((await topUp()).status).toBe(429);
});

test('money movement is limited per IP even across users', async () => {
  const ip = '198.51.100.99';
  const a = await register();
  const b = await register();
  const topUp = (u) => api('post', `/api/v1/wallets/${u.wallet.id}/top-up`, ip).set(u.auth).send({ amount: '1.00' });
  expect((await topUp(a)).status).toBe(201);
  expect((await topUp(b)).status).toBe(201);
  expect((await topUp(a)).status).toBe(429);
});

test('read endpoints use their own looser bucket', async () => {
  const user = await register();
  const read = () => api('get', '/api/v1/history').set(user.auth);
  for (let i = 0; i < 3; i += 1) expect((await read()).status).toBe(200);
  expect((await read()).status).toBe(429);
});
