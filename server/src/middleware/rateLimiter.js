/**
 * Rate limiting.
 *
 * Money movement and reads are limited both per client IP and per
 * authenticated user: a shared IP (campus NAT) cannot exhaust one user's
 * quota, and rotating IPs cannot bypass a user's quota. Login is limited per
 * IP + email (brute force against one account) and per IP overall.
 *
 * The default in-memory store is per process. Running more than one API
 * replica requires a shared store (e.g. Redis); see docs/runbooks.
 */
const { rateLimit, ipKeyGenerator, MemoryStore } = require('express-rate-limit');
const config = require('../config/env');

const { windowMs } = config.rateLimit;
const stores = [];

function limiter({ max, prefix, keyGenerator, message }) {
  const store = new MemoryStore();
  stores.push(store);
  return rateLimit({
    store,
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    keyGenerator: (req) => `${prefix}:${keyGenerator(req)}`,
    message: { success: false, error: message },
  });
}

const byIp = (req) => ipKeyGenerator(req.ip || '');
const byUser = (req) => req.user?.sub || `anon:${byIp(req)}`;
const byIpAndEmail = (req) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  return `${byIp(req)}|${email}`;
};

const AUTH_MESSAGE = 'Too many authentication attempts, please try again later.';

const loginLimiter = limiter({
  max: config.rateLimit.authMax,
  prefix: 'login',
  keyGenerator: byIpAndEmail,
  message: AUTH_MESSAGE,
});

const authIpLimiter = limiter({
  max: config.rateLimit.authMax * 5,
  prefix: 'auth-ip',
  keyGenerator: byIp,
  message: AUTH_MESSAGE,
});

const registerLimiter = limiter({
  max: config.rateLimit.authMax,
  prefix: 'register',
  keyGenerator: byIp,
  message: AUTH_MESSAGE,
});

const refreshLimiter = limiter({
  max: config.rateLimit.readMax,
  prefix: 'refresh',
  keyGenerator: byIp,
  message: AUTH_MESSAGE,
});

function pair(prefix, max, message) {
  return [
    limiter({ max, prefix: `${prefix}-ip`, keyGenerator: byIp, message }),
    limiter({ max, prefix: `${prefix}-user`, keyGenerator: byUser, message }),
  ];
}

/** Top-up, withdraw, transfer, merchant pay, request approval, adjustments. */
const moneyLimiter = pair('money', config.rateLimit.moneyMax, 'Too many money movement requests, please slow down.');
/** Non-money writes: payment requests, merchants, wallets, admin changes. */
const writeLimiter = pair('write', config.rateLimit.writeMax, 'Too many requests, please slow down.');
/** Reads: balances, history, lists. */
const readLimiter = pair('read', config.rateLimit.readMax, 'Too many requests, please try again later.');

/** Test helper: clear every limiter's counters. */
async function resetAll() {
  await Promise.all(stores.map((store) => store.resetAll()));
}

module.exports = {
  loginLimiter: [authIpLimiter, loginLimiter],
  registerLimiter: [authIpLimiter, registerLimiter],
  refreshLimiter,
  moneyLimiter,
  writeLimiter,
  readLimiter,
  // Backwards-compatible name used by older imports.
  authLimiter: loginLimiter,
  resetAll,
};
