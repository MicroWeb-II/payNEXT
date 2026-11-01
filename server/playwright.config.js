const { defineConfig } = require('@playwright/test');

const apiEnv = {
  NODE_ENV: 'test',
  LOG_LEVEL: process.env.LOG_LEVEL || 'warn',
  JWT_SECRET: process.env.JWT_SECRET || 'paynext-e2e-secret-at-least-32-characters',
  RATE_LIMIT_AUTH_MAX: '100',
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_PORT: process.env.DB_PORT || '5432',
  DB_USER: process.env.DB_USER || 'paynext_test',
  DB_PASSWORD: process.env.DB_PASSWORD || 'paynext_test',
  DB_NAME: process.env.DB_NAME || 'paynext_test',
};

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
    trace: 'retain-on-failure',
    // Optional: point at a pre-installed Chromium instead of `npx playwright install`.
    launchOptions: process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {},
  },
  webServer: [
    {
      command: 'node src/server.js',
      url: 'http://127.0.0.1:3000/api/v1/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      env: apiEnv,
    },
    {
      command: 'node tests/e2e/staticServer.js',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],
});
