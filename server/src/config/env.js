/**
 * Centralised, validated runtime configuration.
 *
 * Every environment variable the API reads is parsed here exactly once so the
 * rest of the codebase never touches `process.env` directly. `assertProductionReady()`
 * is called by the server entry point and fails fast on unsafe configuration.
 */
require('dotenv').config();

const MIN_JWT_SECRET_BYTES = 32;

function int(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isFinite(value)) {
    throw new Error(`Environment variable ${name} must be an integer (received "${raw}")`);
  }
  return value;
}

function bool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
}

function list(name) {
  return (process.env[name] || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const isTest = nodeEnv === 'test';

const DEV_ORIGINS = ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:4173'];

const config = {
  nodeEnv,
  isProduction,
  isTest,
  port: int('PORT', 3000),
  logLevel: process.env.LOG_LEVEL || (isTest ? 'silent' : 'info'),
  trustProxy: int('TRUST_PROXY_HOPS', 1),
  shutdownTimeoutMs: int('SHUTDOWN_TIMEOUT_MS', 10000),

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: int('DB_PORT', 5432),
    user: process.env.DB_USER || 'paynext',
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'paynext_db',
    ssl: bool('DB_SSL', (process.env.DB_HOST || '').endsWith('.neon.tech')),
    sslRejectUnauthorized: bool('DB_SSL_REJECT_UNAUTHORIZED', true),
    poolMax: int('DB_POOL_MAX', 10),
    idleTimeoutMs: int('DB_IDLE_TIMEOUT_MS', 30000),
    connectionTimeoutMs: int('DB_CONNECTION_TIMEOUT_MS', 5000),
    statementTimeoutMs: int('DB_STATEMENT_TIMEOUT_MS', 15000),
  },

  auth: {
    jwtSecret: process.env.JWT_SECRET,
    jwtIssuer: process.env.JWT_ISSUER || 'paynext-api',
    jwtAudience: process.env.JWT_AUDIENCE || 'paynext-client',
    accessTokenTtlSeconds: int('ACCESS_TOKEN_TTL_SECONDS', 15 * 60),
    refreshTokenTtlDays: int('REFRESH_TOKEN_TTL_DAYS', 7),
    bcryptCost: Math.max(12, int('BCRYPT_COST', 12)),
    cookieSecure: bool('COOKIE_SECURE', isProduction),
  },

  cors: {
    // Production is closed unless origins are explicitly configured.
    allowedOrigins: list('ALLOWED_ORIGINS').length
      ? list('ALLOWED_ORIGINS')
      : isProduction
        ? []
        : DEV_ORIGINS,
  },

  rateLimit: {
    windowMs: int('RATE_LIMIT_WINDOW_MS', 15 * 60 * 1000),
    authMax: int('RATE_LIMIT_AUTH_MAX', isProduction ? 10 : 100),
    moneyMax: int('RATE_LIMIT_MONEY_MAX', isProduction ? 20 : 200),
    writeMax: int('RATE_LIMIT_WRITE_MAX', isProduction ? 60 : 600),
    readMax: int('RATE_LIMIT_READ_MAX', isProduction ? 100 : 1000),
  },

  idempotency: {
    ttlHours: int('IDEMPOTENCY_TTL_HOURS', 24),
  },

  money: {
    maxAmountCents: BigInt(int('MAX_TRANSACTION_AMOUNT', 1000000)) * 100n,
    supportedCurrencies: ['USD', 'BDT'],
  },

  metrics: {
    enabled: bool('METRICS_ENABLED', true),
    token: process.env.METRICS_TOKEN || '',
  },
};

/**
 * Throw when configuration is unsafe to run with. Kept separate from module
 * load so unit tests can import the config without a full environment.
 */
function assertProductionReady(cfg = config) {
  const problems = [];
  if (!cfg.auth.jwtSecret || Buffer.byteLength(cfg.auth.jwtSecret, 'utf8') < MIN_JWT_SECRET_BYTES) {
    problems.push(`JWT_SECRET must be set and at least ${MIN_JWT_SECRET_BYTES} bytes long`);
  }
  if (cfg.isProduction && !cfg.db.password) {
    problems.push('DB_PASSWORD must be set in production');
  }
  if (problems.length) {
    const error = new Error(`Invalid configuration:\n  - ${problems.join('\n  - ')}`);
    error.code = 'ECONFIG';
    throw error;
  }
}

module.exports = config;
module.exports.assertProductionReady = assertProductionReady;
module.exports.MIN_JWT_SECRET_BYTES = MIN_JWT_SECRET_BYTES;
