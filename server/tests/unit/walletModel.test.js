jest.mock('../../src/config/db', () => ({ query: jest.fn() }));

const pool = require('../../src/config/db');
const walletModel = require('../../src/models/walletModel');

const collision = () => Object.assign(new Error('duplicate'), { code: '23505', constraint: 'wallets_wallet_number_key' });

beforeEach(() => pool.query.mockReset());

test('wallet numbers come from a CSPRNG in the PAYNX-NNNNNN format', () => {
  const crypto = require('crypto');
  const spy = jest.spyOn(crypto, 'randomInt');
  expect(walletModel.generateWalletNumber()).toMatch(/^PAYNX-[1-9]\d{5}$/);
  expect(spy).toHaveBeenCalledWith(100000, 1000000);
  spy.mockRestore();
});

test('retries when the wallet number collides', async () => {
  pool.query.mockRejectedValueOnce(collision()).mockResolvedValueOnce({ rows: [{ id: 'w1' }] });
  await expect(walletModel.create('user', 'USD')).resolves.toEqual({ id: 'w1' });
  expect(pool.query).toHaveBeenCalledTimes(2);
  expect(pool.query.mock.calls[0][1][1]).toMatch(/^PAYNX-/);
});

test('gives up after the maximum number of attempts', async () => {
  pool.query.mockRejectedValue(collision());
  await expect(walletModel.create('user')).rejects.toThrow(/unique wallet number/);
  expect(pool.query).toHaveBeenCalledTimes(walletModel.MAX_WALLET_NUMBER_ATTEMPTS);
});

test('does not retry unrelated errors', async () => {
  const fk = Object.assign(new Error('fk'), { code: '23503' });
  pool.query.mockRejectedValue(fk);
  await expect(walletModel.create('user')).rejects.toBe(fk);
  expect(pool.query).toHaveBeenCalledTimes(1);
});

test('uses savepoints inside a transaction so a collision does not abort it', async () => {
  const client = { query: jest.fn() };
  client.query
    .mockResolvedValueOnce({}) // SAVEPOINT
    .mockRejectedValueOnce(collision()) // INSERT
    .mockResolvedValueOnce({}) // ROLLBACK TO SAVEPOINT
    .mockResolvedValueOnce({}) // SAVEPOINT
    .mockResolvedValueOnce({ rows: [{ id: 'w2' }] }) // INSERT
    .mockResolvedValueOnce({}); // RELEASE
  await expect(walletModel.create('user', 'USD', client)).resolves.toEqual({ id: 'w2' });
  const statements = client.query.mock.calls.map((c) => c[0].trim().split(/\s+/).slice(0, 2).join(' '));
  expect(statements).toEqual(['SAVEPOINT wallet_number_attempt', 'INSERT INTO', 'ROLLBACK TO', 'SAVEPOINT wallet_number_attempt', 'INSERT INTO', 'RELEASE SAVEPOINT']);
});
