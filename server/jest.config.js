module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  setupFiles: ['<rootDir>/tests/jest.setup.js'],
  globalSetup: '<rootDir>/tests/globalSetup.js',
  maxWorkers: 1,
  testTimeout: 30000,
  // server.js and migrate.js are process entry points exercised by the e2e run.
  collectCoverageFrom: ['src/**/*.js', '!src/server.js', '!src/migrate.js'],
  coverageReporters: ['text-summary', 'text', 'lcov'],
  // Phase 1 exit criterion: at least 70% coverage on services.
  coverageThreshold: {
    global: { statements: 80, branches: 70, functions: 80, lines: 80 },
    './src/services/': { statements: 85, branches: 75, functions: 85, lines: 85 },
  },
};
