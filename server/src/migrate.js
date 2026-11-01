const path = require('path');
const { runner } = require('node-pg-migrate');
const pool = require('./config/db');
const logger = require('./observability/logger');

/**
 * Apply pending versioned migrations. node-pg-migrate takes an advisory lock,
 * so concurrent API replicas starting together cannot race each other.
 */
async function migrate() {
  const client = await pool.connect();
  try {
    return await runner({
      dbClient: client,
      dir: path.resolve(__dirname, '../migrations'),
      direction: 'up',
      migrationsTable: 'pgmigrations',
      log: (message) => logger.info({ component: 'migrations' }, message),
    });
  } finally {
    client.release();
  }
}

if (require.main === module) {
  migrate()
    .then(() => pool.end())
    .catch(async (error) => {
      logger.fatal({ err: error }, 'Database migration failed');
      await pool.end();
      process.exitCode = 1;
    });
}

module.exports = migrate;
