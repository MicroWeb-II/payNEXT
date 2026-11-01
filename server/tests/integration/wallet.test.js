const { api, register, topUp, balance } = require('../helpers/api');
const { pool, resetDatabase } = require('../helpers/db');
const { resetAll } = require('../../src/middleware/rateLimiter');

beforeEach(async () => {
  await resetDatabase();
  await resetAll();
});

afterAll(() => pool.end());

const transfer = (user, body) => api('post', '/api/v1/transfers').set(user.auth).send({ fromWalletId: user.wallet.id, ...body });

describe('top-up and withdraw', () => {
  test('credits and debits with exact decimal arithmetic', async () => {
    const user = await register();
    const credited = await topUp(user, '0.10');
    expect(credited.newBalance).toBe('0.10');
    await topUp(user, '0.20');
    expect(await balance(user)).toBe('0.30');

    const res = await api('post', `/api/v1/wallets/${user.wallet.id}/withdraw`).set(user.auth).send({ amount: '0.15' });
    expect(res.status).toBe(201);
    expect(res.body.data.transaction.currency).toBe('USD');
    expect(await balance(user)).toBe('0.15');
  });

  test('rejects invalid amounts', async () => {
    const user = await register();
    for (const amount of ['0', '-5', '1.001', '1e3', 'abc', '1000000.01', null, true]) {
      const res = await api('post', `/api/v1/wallets/${user.wallet.id}/top-up`).set(user.auth).send({ amount });
      expect(res.status).toBe(400);
    }
    const provider = await api('post', `/api/v1/wallets/${user.wallet.id}/top-up`)
      .set(user.auth).send({ amount: '1.00', provider: 'unknown' });
    expect(provider.status).toBe(400);
  });

  test('rejects withdrawals beyond the balance', async () => {
    const user = await register();
    await topUp(user, '5.00');
    const res = await api('post', `/api/v1/wallets/${user.wallet.id}/withdraw`).set(user.auth).send({ amount: '5.01' });
    expect(res.status).toBe(400);
    expect(await balance(user)).toBe('5.00');
  });

  test("hides other users' wallets", async () => {
    const owner = await register();
    const other = await register();
    expect((await api('get', `/api/v1/wallets/${owner.wallet.id}`).set(other.auth)).status).toBe(404);
    const res = await api('post', `/api/v1/wallets/${owner.wallet.id}/top-up`).set(other.auth).send({ amount: '1.00' });
    expect(res.status).toBe(403);
  });

  test('lists wallets and prevents a second wallet in the same currency', async () => {
    const user = await register();
    const list = await api('get', '/api/v1/wallets').set(user.auth);
    expect(list.body.count).toBe(1);
    expect((await api('post', '/api/v1/wallets').set(user.auth).send({ currency: 'USD' })).status).toBe(409);
    const bdt = await api('post', '/api/v1/wallets').set(user.auth).send({ currency: 'bdt' });
    expect(bdt.status).toBe(201);
    expect(bdt.body.data.currency).toBe('BDT');
    expect((await api('post', '/api/v1/wallets').set(user.auth).send({ currency: 'EUR' })).status).toBe(400);
  });
});

describe('transfers', () => {
  test('moves money between users and records both ledger sides', async () => {
    const sender = await register();
    const recipient = await register();
    await topUp(sender, '40.00');

    const res = await transfer(sender, { toWalletNumber: recipient.wallet.wallet_number.toLowerCase(), amount: '15.25', note: 'Lunch' });
    expect(res.status).toBe(201);
    expect(res.body.data.fromBalance).toBe('24.75');
    expect(res.body.data).not.toHaveProperty('toBalance');
    expect(await balance(recipient)).toBe('15.25');

    const ledger = await pool.query('SELECT type, amount, currency FROM transactions WHERE reference_id = $1 ORDER BY type', [
      res.body.data.transfer.id,
    ]);
    expect(ledger.rows).toEqual([
      { type: 'transfer_in', amount: '15.25', currency: 'USD' },
      { type: 'transfer_out', amount: '15.25', currency: 'USD' },
    ]);
  });

  test('rejects insufficient funds, self-transfer and unknown wallets', async () => {
    const sender = await register();
    const recipient = await register();
    await topUp(sender, '10.00');
    expect((await transfer(sender, { toWalletNumber: recipient.wallet.wallet_number, amount: '10.01' })).status).toBe(400);
    expect((await transfer(sender, { toWalletNumber: sender.wallet.wallet_number, amount: '1.00' })).status).toBe(400);
    expect((await transfer(sender, { toWalletNumber: 'PAYNX-000000', amount: '1.00' })).status).toBe(404);
    expect((await transfer(sender, { toWalletNumber: 'BAD', amount: '1.00' })).status).toBe(400);
    expect(await balance(sender)).toBe('10.00');
  });

  test('rejects transfers from a wallet the caller does not own', async () => {
    const victim = await register();
    const attacker = await register();
    await topUp(victim, '10.00');
    const res = await api('post', '/api/v1/transfers').set(attacker.auth).send({
      fromWalletId: victim.wallet.id,
      toWalletNumber: attacker.wallet.wallet_number,
      amount: '5.00',
    });
    expect(res.status).toBe(403);
    expect(await balance(victim)).toBe('10.00');
  });

  test('blocks transfers involving frozen wallets', async () => {
    const sender = await register();
    const recipient = await register();
    await topUp(sender, '10.00');
    await pool.query("UPDATE wallets SET status = 'frozen' WHERE id = $1", [recipient.wallet.id]);
    expect((await transfer(sender, { toWalletNumber: recipient.wallet.wallet_number, amount: '1.00' })).status).toBe(409);
  });

  test('concurrent opposite transfers neither deadlock nor lose money', async () => {
    const a = await register();
    const b = await register();
    await topUp(a, '100.00');
    await topUp(b, '100.00');
    const requests = [];
    for (let i = 0; i < 10; i += 1) {
      requests.push(transfer(a, { toWalletNumber: b.wallet.wallet_number, amount: '1.00' }));
      requests.push(transfer(b, { toWalletNumber: a.wallet.wallet_number, amount: '2.00' }));
    }
    const results = await Promise.all(requests);
    expect(results.every((r) => r.status === 201)).toBe(true);
    expect(await balance(a)).toBe('110.00');
    expect(await balance(b)).toBe('90.00');
  });

  test('concurrent withdrawals cannot overdraw a wallet', async () => {
    const user = await register();
    await topUp(user, '10.00');
    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        api('post', `/api/v1/wallets/${user.wallet.id}/withdraw`).set(user.auth).send({ amount: '3.00' })),
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(3);
    expect(await balance(user)).toBe('1.00');
  });
});
