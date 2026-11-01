jest.mock('../../src/config/db', () => ({ connect: jest.fn() }));

const pool = require('../../src/config/db');
const {
  ApiError,
  normalizeAmount,
  toCents,
  withTransaction,
  adjustBalance,
  lockWallets,
  assertUsableWallet,
  logTx,
} = require('../../src/services/moneyService');

function fakeClient(result = {}) {
  return { query: jest.fn().mockResolvedValue(result), release: jest.fn() };
}

beforeEach(() => pool.connect.mockReset());

describe('normalizeAmount', () => {
  test.each([
    ['0.01', '0.01'],
    ['1', '1.00'],
    ['12.5', '12.50'],
    ['1000000.00', '1000000.00'],
    [2.5, '2.50'],
    [' 3.10 ', '3.10'],
  ])('accepts %p as %p', (input, expected) => {
    expect(normalizeAmount(input)).toBe(expected);
  });

  test.each(['0', '0.00', '-1', '1.001', '1e3', '01.00', '1000000.01', '10000000000000', '', 'abc', null, undefined, {}, [], true, NaN, 0.1 + 0.2])(
    'rejects %p',
    (input) => {
      expect(() => normalizeAmount(input)).toThrow(ApiError);
    },
  );

  test('converts decimal strings to integer cents without floating point', () => {
    expect(toCents('0.10') + toCents('0.20')).toBe(30n);
    expect(toCents('1234567.89')).toBe(123456789n);
    expect(toCents('7')).toBe(700n);
  });
});

describe('withTransaction', () => {
  test('commits on success', async () => {
    const client = fakeClient();
    pool.connect.mockResolvedValue(client);
    await expect(withTransaction(async () => 'ok')).resolves.toBe('ok');
    expect(client.query.mock.calls.map((c) => c[0])).toEqual(['BEGIN', 'COMMIT']);
    expect(client.release).toHaveBeenCalledTimes(1);
  });

  test('supports an explicit isolation level', async () => {
    const client = fakeClient();
    pool.connect.mockResolvedValue(client);
    await withTransaction(async () => null, { isolationLevel: 'SERIALIZABLE' });
    expect(client.query.mock.calls[0][0]).toBe('BEGIN ISOLATION LEVEL SERIALIZABLE');
  });

  test.each(['40001', '40P01'])('retries PostgreSQL error %s', async (code) => {
    const client = fakeClient();
    pool.connect.mockResolvedValue(client);
    const conflict = Object.assign(new Error('retryable'), { code });
    const operation = jest.fn().mockRejectedValueOnce(conflict).mockResolvedValue('committed');
    await expect(withTransaction(operation)).resolves.toBe('committed');
    expect(operation).toHaveBeenCalledTimes(2);
    expect(client.release).toHaveBeenCalledTimes(2);
  });

  test('gives up after maxRetries', async () => {
    pool.connect.mockResolvedValue(fakeClient());
    const deadlock = Object.assign(new Error('deadlock'), { code: '40P01' });
    const operation = jest.fn().mockRejectedValue(deadlock);
    await expect(withTransaction(operation, { maxRetries: 2 })).rejects.toBe(deadlock);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  test('rolls back and rethrows non-retryable errors immediately', async () => {
    const client = fakeClient();
    pool.connect.mockResolvedValue(client);
    const failure = new ApiError('Insufficient balance', 400);
    await expect(withTransaction(async () => { throw failure; })).rejects.toBe(failure);
    expect(client.query.mock.calls.map((c) => c[0])).toEqual(['BEGIN', 'ROLLBACK']);
  });

  test('keeps the original error when ROLLBACK also fails', async () => {
    const client = { query: jest.fn(), release: jest.fn() };
    const rollbackError = new Error('connection lost');
    client.query.mockResolvedValueOnce({}).mockRejectedValueOnce(rollbackError);
    pool.connect.mockResolvedValue(client);
    const failure = new Error('boom');
    await expect(withTransaction(async () => { throw failure; })).rejects.toMatchObject({ message: 'boom', rollbackError });
  });
});

describe('balance arithmetic', () => {
  test('debits only when funds are sufficient, in SQL NUMERIC', async () => {
    const client = fakeClient({ rows: [{ balance: '7.25' }] });
    await expect(adjustBalance(client, { id: 'wallet-id' }, '2.75', 'debit')).resolves.toBe('7.25');
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toContain('balance = balance - $1::numeric');
    expect(sql).toContain('balance >= $1::numeric');
    expect(params).toEqual(['2.75', 'wallet-id']);
  });

  test('returns undefined when the debit guard matches no row', async () => {
    const client = fakeClient({ rows: [] });
    await expect(adjustBalance(client, { id: 'w' }, '1.00', 'debit')).resolves.toBeUndefined();
  });

  test('credits with SQL NUMERIC', async () => {
    const client = fakeClient({ rows: [{ balance: '3.00' }] });
    await expect(adjustBalance(client, { id: 'w' }, '1.00', 'credit')).resolves.toBe('3.00');
    expect(client.query.mock.calls[0][0]).toContain('balance = balance + $1::numeric');
  });
});

describe('wallet locking and checks', () => {
  test('locks wallets in id order to prevent deadlocks', async () => {
    const client = fakeClient({ rows: [{ id: 'a' }, { id: 'b' }] });
    const locked = await lockWallets(client, ['b', 'a', 'b']);
    const [sql, params] = client.query.mock.calls[0];
    expect(sql).toMatch(/ORDER BY id FOR UPDATE/);
    expect(params).toEqual([['a', 'b']]);
    expect([...locked.keys()]).toEqual(['a', 'b']);
  });

  test('assertUsableWallet enforces existence, ownership and status', () => {
    const wallet = { id: 'w', user_id: 'u', status: 'active' };
    expect(assertUsableWallet(wallet, { userId: 'u' })).toBe(wallet);
    expect(() => assertUsableWallet(undefined)).toThrow(expect.objectContaining({ status: 404 }));
    expect(() => assertUsableWallet(wallet, { userId: 'other' })).toThrow(expect.objectContaining({ status: 403 }));
    expect(() => assertUsableWallet({ ...wallet, status: 'frozen' })).toThrow(expect.objectContaining({ status: 409 }));
  });

  test('ledger rows copy the currency from the wallet', async () => {
    const client = fakeClient({ rows: [{ id: 'tx' }] });
    await logTx(client, { walletId: 'w', type: 'top_up', amount: '1.00', balanceAfter: '1.00' });
    expect(client.query.mock.calls[0][0]).toMatch(/SELECT id, \$2, \$3, \$4, \$5, \$6, currency, clock_timestamp\(\) FROM wallets/);
  });
});
