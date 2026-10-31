const pool = require('../config/db');

const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000;

async function idempotency(req, res, next) {
  const key = req.get('Idempotency-Key');
  if (!key || key.length > 255 || !/^[\x21-\x7E]+$/.test(key)) {
    return res.status(400).json({ success: false, error: 'A valid Idempotency-Key header is required' });
  }
  const userId = req.user?.sub;
  if (!userId) return res.status(401).json({ success: false, error: 'Authentication required' });
  const endpoint = `${req.baseUrl}${req.path}`;

  try {
    const inserted = await pool.query(
      `INSERT INTO idempotency_keys (idempotency_key, user_id, endpoint, response_status, response_body, created_at)
       VALUES ($1, $2, $3, NULL, NULL, NOW())
       ON CONFLICT (idempotency_key, user_id, endpoint) DO NOTHING
       RETURNING id`,
      [key, userId, endpoint],
    );

    if (!inserted.rowCount) {
      const existing = await pool.query(
        `SELECT response_status, response_body, created_at FROM idempotency_keys
         WHERE idempotency_key = $1 AND user_id = $2 AND endpoint = $3 FOR UPDATE`,
        [key, userId, endpoint],
      );
      const record = existing.rows[0];
      if (Date.now() - new Date(record.created_at).getTime() <= IDEMPOTENCY_TTL_MS) {
        if (record.response_status == null) {
          return res.status(409).json({ success: false, error: 'A request with this Idempotency-Key is in progress' });
        }
        return res.status(record.response_status).set('Idempotent-Replayed', 'true').json(record.response_body);
      }
      const reset = await pool.query(
        `UPDATE idempotency_keys SET response_status = NULL, response_body = NULL, created_at = NOW()
         WHERE idempotency_key = $1 AND user_id = $2 AND endpoint = $3
           AND created_at <= NOW() - INTERVAL '24 hours' RETURNING id`,
        [key, userId, endpoint],
      );
      if (!reset.rowCount) {
        return res.status(409).json({ success: false, error: 'A request with this Idempotency-Key is in progress' });
      }
    }

    const originalJson = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode >= 500) {
        pool.query('DELETE FROM idempotency_keys WHERE idempotency_key=$1 AND user_id=$2 AND endpoint=$3 AND response_status IS NULL', [key, userId, endpoint]).catch(() => {});
        return originalJson(body);
      }
      pool.query(
        `UPDATE idempotency_keys SET response_status=$4, response_body=$5, created_at=NOW()
         WHERE idempotency_key=$1 AND user_id=$2 AND endpoint=$3`,
        [key, userId, endpoint, res.statusCode, JSON.stringify(body)],
      ).then(() => originalJson(body)).catch((err) => {
        console.error('[idempotency] Failed to store response:', err.message);
        originalJson(body);
      });
      return res;
    };
    return next();
  } catch (err) {
    console.error('[idempotency] Database error:', err.message);
    return res.status(503).json({ success: false, error: 'Idempotency service unavailable' });
  }
}

module.exports = idempotency;
