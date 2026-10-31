const rateLimit = require('express-rate-limit');

const isProd = process.env.NODE_ENV === 'production';

/**
 * authLimiter — login / register endpoints
 * 10 req / 15 min in production; configurable via RATE_LIMIT_AUTH_MAX.
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.RATE_LIMIT_AUTH_MAX
    ? Number(process.env.RATE_LIMIT_AUTH_MAX)
    : isProd ? 10 : 100,
  message: { success: false, error: 'Too many authentication attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * moneyLimiter — all money-movement endpoints (top-up, withdraw, transfer, merchant/pay)
 * Stricter: 20 req / 15 min per IP in production; configurable via RATE_LIMIT_MONEY_MAX.
 */
const moneyIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.RATE_LIMIT_MONEY_MAX
    ? Number(process.env.RATE_LIMIT_MONEY_MAX)
    : isProd ? 20 : 200,
  message: { success: false, error: 'Too many requests, please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// Separate buckets ensure that sharing an IP cannot consume a user's quota,
// and rotating IPs cannot bypass the authenticated user's quota.
const moneyUserLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.RATE_LIMIT_MONEY_MAX ? Number(process.env.RATE_LIMIT_MONEY_MAX) : isProd ? 20 : 200,
  keyGenerator: (req) => req.user?.sub || 'anonymous',
  message: { success: false, error: 'Too many requests, please slow down.' },
  standardHeaders: true,
  legacyHeaders: false,
});
const moneyLimiter = [moneyIpLimiter, moneyUserLimiter];

/**
 * readLimiter — read-only endpoints (transaction history, wallet balance, etc.)
 * Looser: 100 req / 15 min in production; configurable via RATE_LIMIT_READ_MAX.
 */
const readIpLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.RATE_LIMIT_READ_MAX
    ? Number(process.env.RATE_LIMIT_READ_MAX)
    : isProd ? 100 : 1000,
  message: { success: false, error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const readUserLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: process.env.RATE_LIMIT_READ_MAX ? Number(process.env.RATE_LIMIT_READ_MAX) : isProd ? 100 : 1000,
  keyGenerator: (req) => req.user?.sub || 'anonymous',
  message: { success: false, error: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
const readLimiter = [readIpLimiter, readUserLimiter];

module.exports = { authLimiter, moneyLimiter, readLimiter };
