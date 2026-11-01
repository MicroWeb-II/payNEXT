const { api, register, registerAdmin, topUp, balance } = require('../helpers/api');
const { pool, resetDatabase } = require('../helpers/db');
const { resetAll } = require('../../src/middleware/rateLimiter');

beforeEach(async () => {
  await resetDatabase();
  await resetAll();
});

afterAll(() => pool.end());

test('admin endpoints are forbidden to regular users', async () => {
  const user = await register();
  for (const [method, url] of [
    ['get', '/api/v1/admin/users'],
    ['get', '/api/v1/admin/audit-log'],
    ['get', '/api/v1/auth/users'],
  ]) {
    expect((await api(method, url).set(user.auth)).status).toBe(403);
  }
});

test('role change takes effect immediately and is audited', async () => {
  const admin = await registerAdmin();
  const user = await register();
  const res = await api('patch', `/api/v1/admin/users/${user.user.id}/role`).set(admin.auth).send({ role: 'admin' });
  expect(res.status).toBe(200);
  expect(res.body.data.role).toBe('admin');
  // The old token carries role=user, but authorization reads the database.
  expect((await api('get', '/api/v1/admin/users').set(user.auth)).status).toBe(200);
  expect((await api('patch', `/api/v1/admin/users/${admin.user.id}/role`).set(admin.auth).send({ role: 'user' })).status).toBe(400);

  const audit = await pool.query("SELECT actor_user_id, metadata FROM audit_log WHERE action = 'role_change'");
  expect(audit.rows[0]).toMatchObject({ actor_user_id: admin.user.id, metadata: { from: 'user', to: 'admin' } });
  const revoked = await pool.query('SELECT COUNT(*)::int AS n FROM refresh_tokens WHERE user_id = $1 AND revoked_at IS NULL', [user.user.id]);
  expect(revoked.rows[0].n).toBe(0);
});

test('freezing a wallet blocks money movement until it is unfrozen', async () => {
  const admin = await registerAdmin();
  const user = await register();
  await topUp(user, '10.00');

  const frozen = await api('post', `/api/v1/admin/wallets/${user.wallet.id}/freeze`).set(admin.auth).send({ reason: 'Fraud review' });
  expect(frozen.status).toBe(200);
  expect(frozen.body.data.status).toBe('frozen');
  expect((await api('post', `/api/v1/wallets/${user.wallet.id}/withdraw`).set(user.auth).send({ amount: '1.00' })).status).toBe(409);
  expect((await api('post', `/api/v1/admin/wallets/${user.wallet.id}/freeze`).set(admin.auth).send({ reason: 'Again' })).status).toBe(409);

  await api('post', `/api/v1/admin/wallets/${user.wallet.id}/unfreeze`).set(admin.auth).send({ reason: 'Cleared' });
  expect((await api('post', `/api/v1/wallets/${user.wallet.id}/withdraw`).set(user.auth).send({ amount: '1.00' })).status).toBe(201);

  const actions = await pool.query("SELECT action FROM audit_log WHERE action LIKE 'wallet_%freeze' ORDER BY created_at");
  expect(actions.rows.map((r) => r.action)).toEqual(['wallet_freeze', 'wallet_unfreeze']);
});

test('admin adjustments change the balance, hit the ledger and require a reason', async () => {
  const admin = await registerAdmin();
  const user = await register();
  const url = `/api/v1/admin/wallets/${user.wallet.id}/adjustments`;

  expect((await api('post', url).set(admin.auth).send({ direction: 'credit', amount: '5.00' })).status).toBe(400);
  const credit = await api('post', url).set(admin.auth).send({ direction: 'credit', amount: '5.00', reason: 'Goodwill credit' });
  expect(credit.status).toBe(201);
  expect(await balance(user)).toBe('5.00');
  expect((await api('post', url).set(admin.auth).send({ direction: 'debit', amount: '9.00', reason: 'Correction' })).status).toBe(400);
  await api('post', url).set(admin.auth).send({ direction: 'debit', amount: '2.00', reason: 'Correction' });
  expect(await balance(user)).toBe('3.00');

  const ledger = await pool.query('SELECT type FROM transactions WHERE wallet_id = $1 ORDER BY created_at', [user.wallet.id]);
  expect(ledger.rows.map((r) => r.type)).toEqual(['adjustment_credit', 'adjustment_debit']);
  const audit = await api('get', '/api/v1/admin/audit-log?action=admin_adjustment').set(admin.auth);
  expect(audit.body.count).toBe(2);
});

test('the audit log is append-only at the database level', async () => {
  await register();
  await expect(pool.query("UPDATE audit_log SET action = 'tampered'")).rejects.toThrow(/append-only/);
  await expect(pool.query('DELETE FROM audit_log')).rejects.toThrow(/append-only/);
  await expect(pool.query('TRUNCATE audit_log')).rejects.toThrow(/append-only/);
});
