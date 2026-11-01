jest.mock('../../src/config/db', () => ({ query: jest.fn() }));

const pool = require('../../src/config/db');
const store = require('../../src/services/idempotencyStore');

const HASH = 'a'.repeat(64);
const fresh = () => new Date().toISOString();

beforeEach(() => pool.query.mockReset());

describe('request hashing', () => {
  test('is stable regardless of object key order', () => {
    expect(store.stableStringify({ amount: '5.00', wallet: { id: 2, tags: [1, 2] } })).toBe(
      store.stableStringify({ wallet: { tags: [1, 2], id: 2 }, amount: '5.00' }),
    );
    const a = store.createRequestHash({ method: 'POST', originalUrl: '/pay', body: { a: 1, b: 2 } });
    const b = store.createRequestHash({ method: 'POST', originalUrl: '/pay', body: { b: 2, a: 1 } });
    expect(a).toMatch(/^[a-f0-9]{64}$/);
    expect(a).toBe(b);
    expect(store.createRequestHash({ method: 'POST', originalUrl: '/other', body: { a: 1, b: 2 } })).not.toBe(a);
  });
});

describe('begin', () => {
  test('claims a new key', async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'x' }] });
    await expect(store.begin('user', 'key', '/pay', HASH)).resolves.toEqual({ state: 'new' });
  });

  test('replays a completed request with the same payload', async () => {
    pool.query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rows: [{ request_hash: `${HASH} `, response_status: 201, response_body: { ok: true }, created_at: fresh() }] });
    await expect(store.begin('user', 'key', '/pay', HASH)).resolves.toEqual({ state: 'replay', status: 201, body: { ok: true } });
  });

  test('flags a different payload as a conflict', async () => {
    pool.query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rows: [{ request_hash: 'b'.repeat(64), response_status: null, created_at: fresh() }] });
    await expect(store.begin('user', 'key', '/pay', HASH)).resolves.toEqual({ state: 'conflict' });
  });

  test('reports an in-flight request as processing', async () => {
    pool.query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rows: [{ request_hash: HASH, response_status: null, created_at: fresh() }] });
    await expect(store.begin('user', 'key', '/pay', HASH)).resolves.toEqual({ state: 'processing' });
  });

  test('re-claims an expired key, and loses gracefully if another request won', async () => {
    const old = new Date(Date.now() - store.TTL_MS - 1000).toISOString();
    pool.query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rows: [{ request_hash: HASH, response_status: 200, created_at: old }] })
      .mockResolvedValueOnce({ rowCount: 1, rows: [{ id: 'x' }] });
    await expect(store.begin('user', 'key', '/pay', HASH)).resolves.toEqual({ state: 'new' });

    pool.query
      .mockResolvedValueOnce({ rowCount: 0, rows: [] })
      .mockResolvedValueOnce({ rows: [{ request_hash: HASH, response_status: 200, created_at: old }] })
      .mockResolvedValueOnce({ rowCount: 0, rows: [] });
    await expect(store.begin('user', 'key', '/pay', HASH)).resolves.toEqual({ state: 'processing' });
  });

  test('treats a row deleted between statements as processing', async () => {
    pool.query.mockResolvedValueOnce({ rowCount: 0, rows: [] }).mockResolvedValueOnce({ rows: [] });
    await expect(store.begin('user', 'key', '/pay', HASH)).resolves.toEqual({ state: 'processing' });
  });
});

describe('complete, remove and purge', () => {
  test('stores the serialised response', async () => {
    pool.query.mockResolvedValue({ rowCount: 1 });
    await store.complete('user', 'key', '/pay', 201, { ok: true });
    expect(pool.query.mock.calls[0][1]).toEqual(['user', 'key', '/pay', 201, '{"ok":true}']);
  });

  test('removes a key and purges expired keys', async () => {
    pool.query.mockResolvedValue({ rowCount: 3 });
    await store.remove('user', 'key', '/pay');
    expect(pool.query.mock.calls[0][0]).toMatch(/^DELETE FROM idempotency_keys/);
    await expect(store.purgeExpired()).resolves.toBe(3);
  });

  test('isExpired respects the TTL', () => {
    expect(store.isExpired({ created_at: fresh() })).toBe(false);
    expect(store.isExpired({ created_at: new Date(Date.now() - store.TTL_MS - 1) })).toBe(true);
  });
});
