const pino = require('pino');
const config = require('../config/env');

/**
 * Structured JSON logger. Sensitive fields are redacted at the serializer so
 * they never reach log storage, even if a developer logs a whole request.
 */
const logger = pino({
  level: config.logLevel,
  base: { service: 'paynext-api', env: config.nodeEnv },
  timestamp: pino.stdTimeFunctions.isoTime,
  messageKey: 'message',
  formatters: {
    level: (label) => ({ level: label }),
  },
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.password_hash',
      '*.token',
      '*.refreshToken',
    ],
    censor: '[REDACTED]',
  },
});

module.exports = logger;
