module.exports = async () => {
  const pool = require("../src/config/db");
  const migrate = require("../src/migrate");
  await migrate();
  await pool.end();
};