const { api, register, uniqueEmail, bearer } = require('../helpers/api');
const { pool, resetDatabase } = require('../helpers/db');
const { resetAll } = require('../../src/middleware/rateLimiter');

function refreshCookie(setCookie) {
  const header = (setCookie || []).find((c) => c.startsWith('paynext_rt='));
  return header ? header.split(';')[0] : null;
}

beforeEach(async () => {
  await resetDatabase();
  await resetAll();
});

afterAll(() => pool.end());

describe('registration', () => {
  test('creates a user with a USD wallet, an access token and an httpOnly refresh cookie', async () => {
    const email = uniqueEmail('reg');
    const res = await api('post', '/api/v1/auth/register').send({
      email: `  ${email.toUpperCase()} `,
      password: 'Password123',
      fullName: 'Reg User',
      phone: '+880 1700-000000',
    });
    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.user).not.toHaveProperty('password_hash');
    expect(res.body.data.wallet.wallet_number).toMatch(/^PAYNX-\d{6}$/);
    expect(res.body.data.wallet.currency).toBe('USD');
    expect(res.body.data.expiresIn).toBe(900);

    const cookie = res.headers['set-cookie'].find((c) => c.startsWith('paynext_rt='));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).toMatch(/Path=\/api\/v1\/auth/);

    const stored = await pool.query('SELECT password_hash FROM users WHERE email = $1', [email]);
    expect(stored.rows[0].password_hash).toMatch(/^\$2[aby]\$12\$/);

    const audit = await pool.query("SELECT * FROM audit_log WHERE action = 'register'");
    expect(audit.rows).toHaveLength(1);
  });

  test('rejects duplicate email with 409', async () => {
    const user = await register();
    const res = await api('post', '/api/v1/auth/register').send({
      email: user.user.email.toUpperCase(),
      password: 'Password123',
      fullName: 'Dup',
    });
    expect(res.status).toBe(409);
  });

  test.each([
    ['short', 'Pass1'],
    ['no digit', 'Passwordonly'],
    ['no letter', '1234567890'],
  ])('enforces password policy (%s)', async (_label, password) => {
    const res = await api('post', '/api/v1/auth/register').send({ email: uniqueEmail(), password, fullName: 'X' });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain(password);
  });

  test('validates email, name and phone', async () => {
    const bad = await api('post', '/api/v1/auth/register').send({
      email: 'not-an-email',
      password: 'Password123',
      fullName: '',
      phone: 'abc',
    });
    expect(bad.status).toBe(400);
    expect(bad.body.errors.map((e) => e.field).sort()).toEqual(['email', 'fullName', 'phone']);
  });

  test('stores names as given rather than HTML-escaped', async () => {
    const user = await register({ fullName: "Ann O'Brien & Co" });
    expect(user.user.full_name).toBe("Ann O'Brien & Co");
  });
});

describe('login and session', () => {
  test('logs in, returns fresh data from /me and rejects invalid credentials', async () => {
    const user = await register();
    const wrong = await api('post', '/api/v1/auth/login').send({ email: user.user.email, password: 'Wrong12345' });
    expect(wrong.status).toBe(401);
    const unknown = await api('post', '/api/v1/auth/login').send({ email: uniqueEmail(), password: 'Wrong12345' });
    expect(unknown.status).toBe(401);
    expect(unknown.body.error).toBe(wrong.body.error);

    const ok = await api('post', '/api/v1/auth/login').send({ email: user.user.email, password: user.password });
    expect(ok.status).toBe(200);
    expect(ok.body.data.user).not.toHaveProperty('password_hash');

    await pool.query("UPDATE users SET full_name = 'Renamed' WHERE id = $1", [user.user.id]);
    const me = await api('get', '/api/v1/auth/me').set(bearer(ok.body.data.token));
    expect(me.status).toBe(200);
    expect(me.body.data.full_name).toBe('Renamed');

    const actions = await pool.query('SELECT action FROM audit_log ORDER BY created_at');
    expect(actions.rows.map((r) => r.action)).toEqual(
      expect.arrayContaining(['register', 'login_failure', 'login_failure', 'login_success']),
    );
  });

  test('signs in accounts stored with the legacy normalised email', async () => {
    const user = await register({ email: uniqueEmail('legacy') });
    await pool.query("UPDATE users SET email = 'johndoe@gmail.com' WHERE id = $1", [user.user.id]);
    const res = await api('post', '/api/v1/auth/login').send({ email: 'John.Doe@gmail.com', password: user.password });
    expect(res.status).toBe(200);
  });

  test('rejects missing, malformed and tampered tokens', async () => {
    expect((await api('get', '/api/v1/auth/me')).status).toBe(401);
    expect((await api('get', '/api/v1/auth/me').set({ Authorization: 'Bearer nope' })).status).toBe(401);
    const user = await register();
    const tampered = `${user.token.slice(0, -2)}xx`;
    expect((await api('get', '/api/v1/auth/me').set(bearer(tampered))).status).toBe(401);
  });

  test('suspended users are rejected immediately, even with a valid token', async () => {
    const user = await register();
    await pool.query("UPDATE users SET status = 'suspended' WHERE id = $1", [user.user.id]);
    expect((await api('get', '/api/v1/auth/me').set(user.auth)).status).toBe(403);
    const login = await api('post', '/api/v1/auth/login').send({ email: user.user.email, password: user.password });
    expect(login.status).toBe(403);
  });
});

describe('refresh token rotation', () => {
  test('rotates the refresh token and issues a new access token', async () => {
    const user = await register();
    const first = refreshCookie(user.cookie);
    const res = await api('post', '/api/v1/auth/refresh').set('Cookie', first);
    expect(res.status).toBe(200);
    expect(res.body.data.token).toEqual(expect.any(String));
    const second = refreshCookie(res.headers['set-cookie']);
    expect(second).not.toEqual(first);

    const me = await api('get', '/api/v1/auth/me').set(bearer(res.body.data.token));
    expect(me.status).toBe(200);
  });

  test('replaying a rotated token revokes the whole session family', async () => {
    const user = await register();
    const first = refreshCookie(user.cookie);
    const rotated = await api('post', '/api/v1/auth/refresh').set('Cookie', first);
    const second = refreshCookie(rotated.headers['set-cookie']);

    const replay = await api('post', '/api/v1/auth/refresh').set('Cookie', first);
    expect(replay.status).toBe(401);
    // The legitimate successor is now revoked too.
    expect((await api('post', '/api/v1/auth/refresh').set('Cookie', second)).status).toBe(401);
    const audit = await pool.query("SELECT 1 FROM audit_log WHERE action = 'refresh_token_reuse'");
    expect(audit.rowCount).toBe(1);
  });

  test('logout revokes the session and clears the cookie', async () => {
    const user = await register();
    const cookie = refreshCookie(user.cookie);
    const res = await api('post', '/api/v1/auth/logout').set('Cookie', cookie);
    expect(res.status).toBe(200);
    expect(res.headers['set-cookie'].join(';')).toMatch(/paynext_rt=;/);
    expect((await api('post', '/api/v1/auth/refresh').set('Cookie', cookie)).status).toBe(401);
  });

  test('refresh without a cookie or with an expired token fails', async () => {
    expect((await api('post', '/api/v1/auth/refresh')).status).toBe(401);
    const user = await register();
    await pool.query("UPDATE refresh_tokens SET expires_at = NOW() - INTERVAL '1 minute'");
    expect((await api('post', '/api/v1/auth/refresh').set('Cookie', refreshCookie(user.cookie))).status).toBe(401);
  });
});
