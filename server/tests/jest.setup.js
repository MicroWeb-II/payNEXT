process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ||= 'paynext-test-secret-at-least-32-characters';
process.env.LOG_LEVEL ||= 'silent';
process.env.RATE_LIMIT_AUTH_MAX ||= '1000';
process.env.RATE_LIMIT_MONEY_MAX ||= '1000';
process.env.RATE_LIMIT_WRITE_MAX ||= '1000';
process.env.RATE_LIMIT_READ_MAX ||= '5000';
process.env.BCRYPT_COST ||= '12';
