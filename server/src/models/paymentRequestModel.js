const pool = require('../config/db');

const SELECT_WITH_WALLET = `
  SELECT pr.*, w.wallet_number AS requester_wallet_number, w.user_id AS requester_user_id
  FROM payment_requests pr
  JOIN wallets w ON w.id = pr.requester_wallet_id`;

async function create({ requesterWalletId, payerEmail, amount, currency, note }) {
  const r = await pool.query(
    `INSERT INTO payment_requests (requester_wallet_id, payer_email, amount, currency, note)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [requesterWalletId, payerEmail, amount, currency, note],
  );
  return r.rows[0];
}

/** Requests the user created (as requester) or must pay (as payer). */
async function listForUser(userId, email) {
  const r = await pool.query(
    `${SELECT_WITH_WALLET}
     WHERE w.user_id = $1 OR pr.payer_email = $2
     ORDER BY pr.created_at DESC
     LIMIT 200`,
    [userId, email],
  );
  return r.rows;
}

async function findById(id) {
  const r = await pool.query(`${SELECT_WITH_WALLET} WHERE pr.id = $1`, [id]);
  return r.rows[0];
}

/** Row-locks the request for the duration of the caller's transaction. */
async function findByIdForUpdate(client, id) {
  const r = await client.query('SELECT * FROM payment_requests WHERE id = $1 FOR UPDATE', [id]);
  return r.rows[0];
}

async function markPaid(client, id, payerWalletId) {
  const r = await client.query(
    `UPDATE payment_requests SET status = 'paid', payer_wallet_id = $2
     WHERE id = $1 AND status = 'pending' RETURNING *`,
    [id, payerWalletId],
  );
  return r.rows[0];
}

async function decline(id, payerEmail) {
  const r = await pool.query(
    `UPDATE payment_requests SET status = 'declined'
     WHERE id = $1 AND payer_email = $2 AND status = 'pending' RETURNING *`,
    [id, payerEmail],
  );
  return r.rows[0];
}

/** Only the requester may edit their own pending request. */
async function updateByRequester(id, requesterUserId, { amount, note }) {
  const r = await pool.query(
    `UPDATE payment_requests pr SET amount = $3, note = $4
     FROM wallets w
     WHERE pr.id = $1 AND w.id = pr.requester_wallet_id AND w.user_id = $2 AND pr.status = 'pending'
     RETURNING pr.*`,
    [id, requesterUserId, amount, note],
  );
  return r.rows[0];
}

/** Only the requester may cancel; the row is kept for history. */
async function cancelByRequester(id, requesterUserId) {
  const r = await pool.query(
    `UPDATE payment_requests pr SET status = 'cancelled'
     FROM wallets w
     WHERE pr.id = $1 AND w.id = pr.requester_wallet_id AND w.user_id = $2 AND pr.status = 'pending'
     RETURNING pr.*`,
    [id, requesterUserId],
  );
  return r.rows[0];
}

module.exports = {
  create,
  listForUser,
  findById,
  findByIdForUpdate,
  markPaid,
  decline,
  updateByRequester,
  cancelByRequester,
};
