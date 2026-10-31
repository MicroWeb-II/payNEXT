const path = require("path");
const { runner } = require("node-pg-migrate");
const pool = require("./config/db");

async function migrate() {
  const client = await pool.connect();
  try {
    return await runner({
      dbClient: client,
      dir: path.resolve(__dirname, "../migrations"),
      direction: "up",
      migrationsTable: "pgmigrations",
    });
  } finally {
    client.release();
  }
}

if (require.main === module) {
  migrate()
    .then(() => pool.end())
    .catch(async (error) => {
      console.error("Database migration failed:", error);
      await pool.end();
      process.exitCode = 1;
    });
}

module.exports = migrate;