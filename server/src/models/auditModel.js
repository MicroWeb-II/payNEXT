const pool = require('../config/db');

/**
 * Append-only audit log writer.
 * All money movements, auth events, and admin actions should call this.
 */
async function log({ actorUserId, action, entityType, entityId, metadata, ip, userAgent }) {
  try {
    await pool.query(
      `INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, metadata, ip, user_agent)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        actorUserId || null,
        action,
        entityType || null,
        entityId || null,
        JSON.stringify(metadata || {}),
        ip || null,
        userAgent || null,
      ],
    );
  } catch (err) {
    // Audit logging must never crash the main request flow.
    console.error('[audit] Failed to write audit log:', err.message);
  }
}

module.exports = { log };
