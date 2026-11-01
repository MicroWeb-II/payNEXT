const { assertProductionReady, MIN_JWT_SECRET_BYTES } = require('../../src/config/env');

const base = {
  isProduction: false,
  auth: { jwtSecret: 's'.repeat(MIN_JWT_SECRET_BYTES) },
  db: { password: 'pw' },
  metrics: { enabled: true, token: '' },
};

test('accepts a 32-byte JWT secret', () => {
  expect(() => assertProductionReady(base)).not.toThrow();
});

test.each([undefined, '', 'short', 's'.repeat(MIN_JWT_SECRET_BYTES - 1)])('rejects JWT secret %p', (jwtSecret) => {
  expect(() => assertProductionReady({ ...base, auth: { jwtSecret } })).toThrow(/JWT_SECRET/);
});

test('requires a database password in production', () => {
  expect(() => assertProductionReady({ ...base, isProduction: true, db: { password: undefined } })).toThrow(/DB_PASSWORD/);
});

test('rejects malformed integer settings at load time', () => {
  jest.isolateModules(() => {
    process.env.DB_POOL_MAX = 'many';
    try {
      expect(() => require('../../src/config/env')).toThrow(/DB_POOL_MAX/);
    } finally {
      delete process.env.DB_POOL_MAX;
    }
  });
});

test('production CORS is closed unless origins are configured', () => {
  jest.isolateModules(() => {
    const previous = { NODE_ENV: process.env.NODE_ENV, ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS };
    process.env.NODE_ENV = 'production';
    delete process.env.ALLOWED_ORIGINS;
    try {
      const config = require('../../src/config/env');
      expect(config.cors.allowedOrigins).toEqual([]);
      expect(config.cors.allowedOrigins).not.toContain('http://localhost:3000');
      expect(config.auth.cookieSecure).toBe(true);
    } finally {
      process.env.NODE_ENV = previous.NODE_ENV;
      if (previous.ALLOWED_ORIGINS !== undefined) process.env.ALLOWED_ORIGINS = previous.ALLOWED_ORIGINS;
    }
  });
});
