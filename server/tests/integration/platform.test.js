const request = require('supertest');
const { api, app } = require('../helpers/api');
const { pool } = require('../helpers/db');

afterAll(() => pool.end());

test('liveness and readiness endpoints', async () => {
  expect((await api('get', '/healthz')).status).toBe(200);
  const ready = await api('get', '/api/v1/health');
  expect(ready.status).toBe(200);
  expect(ready.body).toMatchObject({ success: true, database: 'ok' });
});

test('every response carries a request ID, and a valid incoming one is propagated', async () => {
  const generated = await api('get', '/healthz');
  expect(generated.headers['x-request-id']).toMatch(/^[0-9a-f-]{36}$/);
  const propagated = await api('get', '/healthz').set('X-Request-Id', 'trace-abc-12345');
  expect(propagated.headers['x-request-id']).toBe('trace-abc-12345');
  const rejected = await api('get', '/healthz').set('X-Request-Id', 'bad id with spaces');
  expect(rejected.headers['x-request-id']).not.toBe('bad id with spaces');
});

test('exposes Prometheus metrics with request counters and latency histograms', async () => {
  await api('get', '/api/v1/health');
  const res = await request(app).get('/metrics');
  expect(res.status).toBe(200);
  expect(res.headers['content-type']).toMatch(/text\/plain/);
  expect(res.text).toMatch(/paynext_http_requests_total\{method="GET",route="\/api\/v1\/health",status="200"\}/);
  expect(res.text).toContain('paynext_http_request_duration_seconds_bucket');
});

test('unknown routes, malformed JSON and oversized bodies return clean errors', async () => {
  expect((await api('get', '/api/v1/nope')).status).toBe(404);
  const malformed = await api('post', '/api/v1/auth/login').set('Content-Type', 'application/json').send('{"email":');
  expect(malformed.status).toBe(400);
  expect(malformed.body.error).toBe('Malformed JSON request body');
  const big = await api('post', '/api/v1/auth/login').send({ email: 'a@b.co', password: 'x'.repeat(30000) });
  expect(big.status).toBe(413);
});

test('CORS allows configured origins and rejects others with 403', async () => {
  const allowed = await api('get', '/healthz').set('Origin', 'http://localhost:3000');
  expect(allowed.headers['access-control-allow-origin']).toBe('http://localhost:3000');
  const blocked = await api('get', '/healthz').set('Origin', 'https://evil.example');
  expect(blocked.status).toBe(403);
  expect(blocked.headers['access-control-allow-origin']).toBeUndefined();
});

test('security headers are set', async () => {
  const res = await api('get', '/healthz');
  expect(res.headers['x-content-type-options']).toBe('nosniff');
  expect(res.headers).not.toHaveProperty('x-powered-by');
});

test('migrations installed the required indexes and updated_at triggers', async () => {
  const expected = [
    'idx_wallets_user_id',
    'idx_transactions_wallet_id',
    'idx_transactions_created_at',
    'idx_transactions_type',
    'idx_payment_requests_requester',
    'idx_payment_requests_payer',
    'idx_payment_requests_status',
  ];
  const indexes = await pool.query("SELECT indexname FROM pg_indexes WHERE schemaname = 'public' AND indexname = ANY($1)", [expected]);
  expect(indexes.rows.map((r) => r.indexname).sort()).toEqual([...expected].sort());

  const triggers = await pool.query("SELECT event_object_table FROM information_schema.triggers WHERE trigger_name LIKE '%_set_updated_at'");
  expect(new Set(triggers.rows.map((r) => r.event_object_table))).toEqual(
    new Set(['users', 'wallets', 'transactions', 'transfers', 'payment_requests', 'gateway_transactions', 'merchants', 'merchant_payments', 'idempotency_keys']),
  );
  const currency = await pool.query(
    "SELECT is_nullable FROM information_schema.columns WHERE table_name = 'transactions' AND column_name = 'currency'",
  );
  expect(currency.rows[0].is_nullable).toBe('NO');
});
