process.env.NODE_ENV = "test";
process.env.JWT_SECRET ||= "paynext-test-secret-at-least-32-characters";
process.env.RATE_LIMIT_AUTH_MAX ||= "3";