const pool = require('../config/db');
const logger = require('../observability/logger');

const INSERT_SQL = `
  INSERT INTO audit_log (actor_user_id, action, entity_type, entity_id, metadata, ip, user_agent, request_id)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`;

function params({ actorUserId, action, entityType, entityId, metadata, ip, userAgent, requestId }) {
  return [
    actorUserId || null,
    action,
    entityType || null,
    entityId || null,
    JSON.stringify(metadata || {}),
    ip ? String(ip).slice(0, 45) : null,
    userAgent ? String(userAgent).slice(0, 512) : null,
    requestId || null,
  ];
}

/** Request-derived audit fields: who, from where, and which request. */
function contextFrom(req) {
  return {
    actorUserId: req.user?.sub || null,
    ip: req.ip,
    userAgent: req.get ? req.get('user-agent') : req.headers?.['user-agent'],
    requestId: req.id,
  };
}

/**
 * Append an entry to the audit log.
 *
 * Pass a transaction `client` for money movements: the entry is then written
 * atomically with the ledger change, and a failure rolls the movement back.
 * Without a client the write is best-effort and never breaks the request.
 */
async function log(entry, client) {
  if (client) {
    await client.query(INSERT_SQL, params(entry));
    return;
  }
  try {
    await pool.query(INSERT_SQL, params(entry));
  } catch (error) {
    logger.error({ err: error, action: entry.action }, 'Failed to write audit log entry');
  }
}

async function list({ limit, offset, action }) {
  const r = await pool.query(
    `SELECT id, actor_user_id, action, entity_type, entity_id, metadata, ip, user_agent, request_id, created_at
     FROM audit_log
     WHERE ($3::text IS NULL OR action = $3)
     ORDER BY created_at DESC
     LIMIT $1 OFFSET $2`,
    [limit, offset, action || null],
  );
  return r.rows;
}

module.exports = { log, list, contextFrom };
