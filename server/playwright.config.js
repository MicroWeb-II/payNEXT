const { defineConfig } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
  },
  webServer: [
    {
      command: "node src/server.js",
      url: "http://127.0.0.1:3000/api/v1/health",
      reuseExistingServer: !process.env.CI,
      timeout: 120000,
      env: { NODE_ENV: "test", RATE_LIMIT_AUTH_MAX: "100", JWT_SECRET: "paynext-e2e-secret-at-least-32-characters" },
    },
    {
      command: "node tests/e2e/staticServer.js",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: !process.env.CI,
      timeout: 30000,
    },
  ],
});