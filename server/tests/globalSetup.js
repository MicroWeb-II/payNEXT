module.exports = async () => {
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL ||= 'silent';
  const pool = require('../src/config/db');
  const migrate = require('../src/migrate');
  try {
    await migrate();
  } finally {
    await pool.end();
  }
};
