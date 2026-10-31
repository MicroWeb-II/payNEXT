require('dotenv').config();

// JWT_SECRET startup guard — fail fast before binding any port
const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret || Buffer.byteLength(jwtSecret, 'utf8') < 32) {
  console.error(
    'FATAL: JWT_SECRET must be set and at least 32 characters long.\n' +
    'Set it in your .env file or environment. Refusing to start.',
  );
  process.exit(1);
}

const app = require('./app');
const pool = require('./config/db');
const migrate = require('./migrate');
const port = process.env.PORT || 3000;

migrate()
  .then(() => app.listen(port, () => console.log(`payNEXT API listening on port ${port}`)))
  .catch(async (error) => {
    console.error('FATAL: database migration failed:', error.message);
    await pool.end();
    process.exitCode = 1;
  });
