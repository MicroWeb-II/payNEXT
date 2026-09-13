require("dotenv").config();
const app = require("./app");
const pool = require("./config/db");

// Auto-migrate database for the live Azure server
pool.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS role VARCHAR(20) NOT NULL DEFAULT 'user'")
  .then(() => console.log("✅ Database migrated successfully (role column exists)."))
  .catch(err => console.error("⚠️ Migration skipped or failed:", err.message));

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`payNEXT API listening on port ${port}`));
