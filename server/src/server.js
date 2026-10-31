require("dotenv").config();
const app = require("./app");
const pool = require("./config/db");
const migrate = require("./migrate");

const port = process.env.PORT || 3000;

migrate()
  .then(() => {
    app.listen(port, () => console.log(`payNEXT API listening on port ${port}`));
  })
  .catch(async (error) => {
    console.error("Database migration failed:", error);
    await pool.end();
    process.exitCode = 1;
  });
