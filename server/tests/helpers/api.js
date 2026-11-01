const request = require('supertest');
const app = require('../../src/app');
const pool = require('../../src/config/db');

let ipSequence = 0;
let userSequence = 0;

/** A supertest request from a distinct client IP so per-IP limits don't interfere. */
function api(method, url, ip) {
  ipSequence += 1;
  const address = ip || `203.0.113.${(ipSequence % 250) + 1}`;
  return request(app)[method](url).set('X-Forwarded-For', address);
}

function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

function uniqueEmail(prefix = 'user') {
  userSequence += 1;
  return `${prefix}${userSequence}.${Date.now()}@example.com`;
}

async function register(overrides = {}) {
  const body = {
    email: uniqueEmail(),
    password: 'Password123',
    fullName: 'Test User',
    ...overrides,
  };
  const response = await api('post', '/api/v1/auth/register').send(body);
  if (response.status !== 201) {
    throw new Error(`register failed: ${response.status} ${JSON.stringify(response.body)}`);
  }
  const cookie = response.headers['set-cookie'];
  return { ...response.body.data, password: body.password, cookie, auth: bearer(response.body.data.token) };
}

async function registerAdmin() {
  const admin = await register({ fullName: 'Admin User' });
  await pool.query("UPDATE users SET role = 'admin' WHERE id = $1", [admin.user.id]);
  return admin;
}

async function topUp(user, amount, walletId = user.wallet.id) {
  const response = await api('post', `/api/v1/wallets/${walletId}/top-up`).set(user.auth).send({ amount });
  if (response.status !== 201) throw new Error(`top-up failed: ${response.status} ${JSON.stringify(response.body)}`);
  return response.body.data;
}

async function balance(user, walletId = user.wallet.id) {
  const response = await api('get', `/api/v1/wallets/${walletId}/balance`).set(user.auth);
  return response.body.data.balance;
}

module.exports = { app, api, bearer, uniqueEmail, register, registerAdmin, topUp, balance };
