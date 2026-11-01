/**
 * Rotating refresh tokens with reuse detection.
 *
 * Only a SHA-256 hash of each token is stored. Every refresh revokes the
 * presented token and issues a successor in the same family. Presenting a
 * token that was already rotated means it was copied, so the whole family
 * (that login session) is revoked.
 */
const crypto = require('crypto');
const pool = require('../config/db');
const config = require('../config/env');
const { ApiError } = require('../lib/errors');

const TOKEN_BYTES = 32;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function expiresAt() {
  return new Date(Date.now() + config.auth.refreshTokenTtlDays * 24 * 60 * 60 * 1000);
}

async function issue(userId, { familyId = crypto.randomUUID(), ip, userAgent } = {}, db = pool) {
  const token = crypto.randomBytes(TOKEN_BYTES).toString('base64url');
  const r = await db.query(
    `INSERT INTO refresh_tokens (user_id, family_id, token_hash, expires_at, ip, user_agent)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, family_id, expires_at`,
    [userId, familyId, hashToken(token), expiresAt(), ip || null, userAgent ? String(userAgent).slice(0, 512) : null],
  );
  return { token, id: r.rows[0].id, familyId: r.rows[0].family_id, expiresAt: r.rows[0].expires_at };
}

async function revokeFamily(familyId, reason, db = pool) {
  await db.query(
    `UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = $2
     WHERE family_id = $1 AND revoked_at IS NULL`,
    [familyId, reason],
  );
}

async function revokeAllForUser(userId, reason, db = pool) {
  const r = await db.query(
    `UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = $2
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId, reason],
  );
  return r.rowCount;
}

/**
 * Exchange a refresh token for a new one. Runs in the caller's transaction so
 * the old token's revocation and the new token's insertion are atomic.
 * Resolves to { userId, token, familyId, expiresAt }. When an already-rotated
 * token is replayed the family is revoked and { reuseDetected: true } is
 * returned instead of throwing, so the caller can COMMIT the revocation before
 * rejecting the request. Other invalid tokens throw a 401 ApiError.
 */
async function rotate(client, presentedToken, { ip, userAgent } = {}) {
  if (!presentedToken || typeof presentedToken !== 'string' || presentedToken.length > 128) {
    throw new ApiError('Refresh token is missing or invalid', 401);
  }
  const r = await client.query(
    'SELECT * FROM refresh_tokens WHERE token_hash = $1 FOR UPDATE',
    [hashToken(presentedToken)],
  );
  const record = r.rows[0];
  if (!record) throw new ApiError('Refresh token is missing or invalid', 401);

  if (record.revoked_at) {
    if (record.revoked_reason === 'rotated') {
      await revokeFamily(record.family_id, 'reuse_detected', client);
      return { reuseDetected: true, userId: record.user_id, familyId: record.family_id };
    }
    throw new ApiError('Session has been revoked', 401);
  }
  if (new Date(record.expires_at).getTime() <= Date.now()) {
    throw new ApiError('Session has expired', 401);
  }

  const next = await issue(record.user_id, { familyId: record.family_id, ip, userAgent }, client);
  await client.query(
    `UPDATE refresh_tokens SET revoked_at = CURRENT_TIMESTAMP, revoked_reason = 'rotated', replaced_by = $2
     WHERE id = $1`,
    [record.id, next.id],
  );
  return { userId: record.user_id, ...next, previous: record };
}

/** Revoke the session a refresh token belongs to (logout). */
async function revokeByToken(presentedToken) {
  if (!presentedToken || typeof presentedToken !== 'string' || presentedToken.length > 128) return null;
  const r = await pool.query('SELECT family_id, user_id FROM refresh_tokens WHERE token_hash = $1', [
    hashToken(presentedToken),
  ]);
  const record = r.rows[0];
  if (!record) return null;
  await revokeFamily(record.family_id, 'logout');
  return record;
}

async function purgeExpired() {
  const r = await pool.query("DELETE FROM refresh_tokens WHERE expires_at < NOW() - INTERVAL '1 day'");
  return r.rowCount;
}

module.exports = {
  hashToken,
  issue,
  rotate,
  revokeFamily,
  revokeAllForUser,
  revokeByToken,
  purgeExpired,
};
