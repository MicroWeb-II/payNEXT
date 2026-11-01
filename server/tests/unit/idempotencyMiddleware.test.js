jest.mock('../../src/services/idempotencyStore', () => ({
  createRequestHash: jest.fn(() => 'hash'),
  begin: jest.fn(),
  complete: jest.fn(() => Promise.resolve()),
  remove: jest.fn(() => Promise.resolve()),
}));

const store = require('../../src/services/idempotencyStore');
const idempotency = require('../../src/middleware/idempotency');

function makeReq(key) {
  return {
    get: (name) => (name === 'Idempotency-Key' ? key : undefined),
    user: { sub: 'user-1' },
    baseUrl: '/api/v1/transfers',
    path: '/',
    log: { error: jest.fn() },
  };
}

function makeRes() {
  const res = { statusCode: 200, headers: {} };
  res.status = jest.fn((code) => { res.statusCode = code; return res; });
  res.set = jest.fn((k, val) => { res.headers[k] = val; return res; });
  res.json = jest.fn(() => res);
  return res;
}

const flush = () => new Promise((resolve) => { setImmediate(resolve); });

beforeEach(() => jest.clearAllMocks());

test('passes through when no key is sent, unless the key is required', async () => {
  const next = jest.fn();
  await idempotency(makeReq(undefined), makeRes(), next);
  expect(next).toHaveBeenCalled();

  const res = makeRes();
  await idempotency.required(makeReq(undefined), res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(400);
});

test('rejects malformed keys', async () => {
  const res = makeRes();
  await idempotency(makeReq('bad key with spaces'), res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(400);
  expect(store.begin).not.toHaveBeenCalled();
});

test.each([
  ['conflict', 409],
  ['processing', 409],
])('maps %s to HTTP %d', async (state, status) => {
  store.begin.mockResolvedValue({ state });
  const res = makeRes();
  await idempotency(makeReq('valid-key-123'), res, jest.fn());
  expect(res.status).toHaveBeenCalledWith(status);
});

test('replays a stored response', async () => {
  store.begin.mockResolvedValue({ state: 'replay', status: 201, body: { done: true } });
  const res = makeRes();
  const next = jest.fn();
  await idempotency(makeReq('valid-key-123'), res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.status).toHaveBeenCalledWith(201);
  expect(res.headers['Idempotent-Replayed']).toBe('true');
  expect(res.json).toHaveBeenCalledWith({ done: true });
});

test('stores successful responses and releases the key after server errors', async () => {
  store.begin.mockResolvedValue({ state: 'new' });
  const ok = makeRes();
  const originalJson = ok.json;
  await idempotency(makeReq('valid-key-123'), ok, jest.fn());
  ok.statusCode = 201;
  ok.json({ id: 1 });
  await flush();
  expect(store.complete).toHaveBeenCalledWith('user-1', 'valid-key-123', '/api/v1/transfers/', 201, { id: 1 });
  expect(originalJson).toHaveBeenCalledWith({ id: 1 });

  const failed = makeRes();
  await idempotency(makeReq('valid-key-456'), failed, jest.fn());
  failed.statusCode = 500;
  failed.json({ error: 'x' });
  await flush();
  expect(store.remove).toHaveBeenCalledWith('user-1', 'valid-key-456', '/api/v1/transfers/');
});

test('still responds when persisting the response fails', async () => {
  store.begin.mockResolvedValue({ state: 'new' });
  store.complete.mockRejectedValueOnce(new Error('db down'));
  const req = makeReq('valid-key-789');
  const res = makeRes();
  const originalJson = res.json;
  await idempotency(req, res, jest.fn());
  res.json({ ok: true });
  await flush();
  expect(originalJson).toHaveBeenCalledWith({ ok: true });
  expect(req.log.error).toHaveBeenCalled();
});

test('forwards store errors', async () => {
  const failure = new Error('db down');
  store.begin.mockRejectedValue(failure);
  const next = jest.fn();
  await idempotency(makeReq('valid-key-123'), makeRes(), next);
  expect(next).toHaveBeenCalledWith(failure);
});
