const config = require('./config/env');
const logger = require('./observability/logger');

try {
  config.assertProductionReady();
} catch (error) {
  logger.fatal({ err: error }, 'Refusing to start: invalid configuration');
  process.exit(1);
}

const app = require('./app');
const pool = require('./config/db');
const migrate = require('./migrate');
const idempotencyStore = require('./services/idempotencyStore');
const refreshTokenService = require('./services/refreshTokenService');

const HOUSEKEEPING_INTERVAL_MS = 60 * 60 * 1000;

async function housekeeping() {
  try {
    const [keys, tokens] = await Promise.all([
      idempotencyStore.purgeExpired(),
      refreshTokenService.purgeExpired(),
    ]);
    if (keys || tokens) logger.info({ idempotencyKeys: keys, refreshTokens: tokens }, 'Purged expired records');
  } catch (error) {
    logger.warn({ err: error }, 'Housekeeping run failed');
  }
}

async function start() {
  await migrate();

  const server = app.listen(config.port, () => {
    logger.info({ port: config.port, env: config.nodeEnv }, 'payNEXT API listening');
  });
  // Keep-alive sockets must outlive Caddy's idle timeout to avoid 502 races.
  server.keepAliveTimeout = 65000;
  server.headersTimeout = 66000;

  const timer = setInterval(housekeeping, HOUSEKEEPING_INTERVAL_MS);
  timer.unref();
  housekeeping();

  let shuttingDown = false;
  const shutdown = (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'Shutdown requested: draining in-flight requests');
    clearInterval(timer);

    const forceExit = setTimeout(() => {
      logger.error({ timeoutMs: config.shutdownTimeoutMs }, 'Graceful shutdown timed out; forcing exit');
      process.exit(1);
    }, config.shutdownTimeoutMs);
    forceExit.unref();

    // Stop accepting new connections; the callback fires once in-flight
    // requests have completed. Idle keep-alive sockets are closed immediately.
    server.close(async (closeError) => {
      try {
        await pool.end();
        logger.info('HTTP server closed and database pool drained');
        process.exit(closeError ? 1 : 0);
      } catch (error) {
        logger.error({ err: error }, 'Error while closing database pool');
        process.exit(1);
      }
    });
    if (typeof server.closeIdleConnections === 'function') server.closeIdleConnections();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
  return server;
}

process.on('unhandledRejection', (reason) => {
  logger.error({ err: reason }, 'Unhandled promise rejection');
});

start().catch(async (error) => {
  logger.fatal({ err: error }, 'Startup failed');
  await pool.end().catch(() => {});
  process.exit(1);
});
