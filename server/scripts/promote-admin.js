#!/usr/bin/env node
/**
 * Grant the admin role to an existing user.
 *
 *   npm run admin:promote -- user@example.com            (local)
 *
 *   docker compose exec api node scripts/promote-admin.js user@example.com   (server)
 * The change is recorded in the audit log with no actor (a system action).
 */
const pool = require('../src/config/db');

async function main() {
  const email = (process.argv[2] || '').trim().toLowerCase();
  if (!email) {
    console.error('Usage: npm run admin:promote -- <email>');
    process.exitCode = 1;
    return;
  }
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const r = await client.query(
      "UPDATE users SET role = 'admin' WHERE email = $1 AND role <> 'admin' RETURNING id, email",
      [email],
    );
    if (!r.rowCount) {
      await client.query('ROLLBACK');
      console.error(`No non-admin user found with email ${email}`);
      process.exitCode = 1;
      return;
    }
    await client.query(
      `INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, metadata)
       VALUES (NULL, 'role_change', 'user', $1, $2)`,
      [r.rows[0].id, JSON.stringify({ to: 'admin', via: 'promote-admin script' })],
    );
    await client.query("UPDATE refresh_tokens SET revoked_at = NOW(), revoked_reason = 'role_change' WHERE user_id = $1 AND revoked_at IS NULL", [r.rows[0].id]);
    await client.query('COMMIT');
    console.log(`${email} is now an admin. They must sign in again.`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
