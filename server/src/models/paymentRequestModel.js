const pool = require("../config/db");

async function create({
  requesterWalletId,
  payerEmail,
  amount,
  currency,
  note,
}) {
  const r = await pool.query(
    `INSERT INTO payment_requests (requester_wallet_id, payer_email, amount, currency, note)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [requesterWalletId, payerEmail, amount, currency, note],
  );
  return r.rows[0];
}

async function listForUser(userId, email) {
  const r = await pool.query(
    `SELECT pr.*, w.wallet_number AS requester_wallet_number
     FROM payment_requests pr
     JOIN wallets w ON w.id = pr.requester_wallet_id
     WHERE w.user_id = $1 OR pr.payer_email = $2
     ORDER BY pr.created_at DESC`,
    [userId, email],
  );
  return r.rows;
}

async function decline(id, payerEmail) {
  const r = await pool.query(
    `UPDATE payment_requests
     SET status = 'declined', updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND payer_email = $2 AND status = 'pending' RETURNING *`,
    [id, payerEmail],
  );
  return r.rows[0];
}

// Used inside a DB transaction (client), not standalone
async function findByIdForUpdate(client, id) {
  const r = await client.query(
    "SELECT * FROM payment_requests WHERE id = $1 FOR UPDATE",
    [id],
  );
  return r.rows[0];
}

async function markPaid(client, id, payerWalletId) {
  const r = await client.query(
    `UPDATE payment_requests
     SET status = 'paid', payer_wallet_id = $1, updated_at = CURRENT_TIMESTAMP
     WHERE id = $2 RETURNING *`,
    [payerWalletId, id],
  );
  return r.rows[0];
}


async function findById(id) {
  const r = await pool.query("SELECT * FROM payment_requests WHERE id = $1", [id]);
  return r.rows[0];
}

async function update(id, amount, note, email) {
  const r = await pool.query(
    `UPDATE payment_requests
     SET amount = $1, note = $2, updated_at = CURRENT_TIMESTAMP
     WHERE id = $3 AND payer_email = $4 AND status = 'pending' RETURNING *`,
    [amount, note, id, email]
  );
  return r.rows[0];
}

async function remove(id, email) {
  const r = await pool.query(
    `DELETE FROM payment_requests
     WHERE id = $1 AND payer_email = $2 AND status = 'pending' RETURNING *`,
    [id, email]
  );
  return r.rows[0];
}

module.exports = { create, listForUser, decline, findByIdForUpdate, markPaid, findById, update, remove };
