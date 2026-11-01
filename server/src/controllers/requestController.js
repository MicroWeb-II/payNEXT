const walletModel = require('../models/walletModel');
const paymentRequestModel = require('../models/paymentRequestModel');
const audit = require('../models/auditModel');
const walletService = require('../services/walletService');
const { normalizeAmount, assertUsableWallet } = require('../services/moneyService');
const { ApiError } = require('../lib/errors');

function isParticipant(request, user) {
  return request.requester_user_id === user.sub || request.payer_email === user.email;
}

const createRequest = async (req, res, next) => {
  try {
    const amount = normalizeAmount(req.body.amount);
    const { requesterWalletId, payerEmail, note } = req.validated;
    if (payerEmail === req.user.email) throw new ApiError('You cannot request money from yourself', 400);

    const wallet = assertUsableWallet(await walletModel.findById(requesterWalletId), { userId: req.user.sub });
    const request = await paymentRequestModel.create({
      requesterWalletId: wallet.id,
      payerEmail,
      amount,
      currency: wallet.currency,
      note: note || null,
    });
    await audit.log({
      ...audit.contextFrom(req),
      action: 'payment_request_create',
      entityType: 'payment_request',
      entityId: request.id,
      metadata: { amount, currency: wallet.currency },
    });
    return res.status(201).json({ success: true, message: 'Payment request sent', data: request });
  } catch (error) {
    return next(error);
  }
};

const myRequests = async (req, res, next) => {
  try {
    const rows = await paymentRequestModel.listForUser(req.user.sub, req.user.email);
    return res.json({ success: true, count: rows.length, data: rows });
  } catch (error) {
    return next(error);
  }
};

const getRequestById = async (req, res, next) => {
  try {
    const request = await paymentRequestModel.findById(req.params.id);
    // Only the requester and the payer may see a request.
    if (!request || !isParticipant(request, req.user)) throw new ApiError('Payment request not found', 404);
    return res.json({ success: true, data: request });
  } catch (error) {
    return next(error);
  }
};

const updateRequest = async (req, res, next) => {
  try {
    const amount = normalizeAmount(req.body.amount);
    const updated = await paymentRequestModel.updateByRequester(req.params.id, req.user.sub, {
      amount,
      note: req.validated.note ?? null,
    });
    if (!updated) throw new ApiError('Pending request not found for you', 404);
    await audit.log({
      ...audit.contextFrom(req),
      action: 'payment_request_update',
      entityType: 'payment_request',
      entityId: updated.id,
      metadata: { amount },
    });
    return res.json({ success: true, message: 'Payment request updated', data: updated });
  } catch (error) {
    return next(error);
  }
};

const cancelRequest = async (req, res, next) => {
  try {
    const cancelled = await paymentRequestModel.cancelByRequester(req.params.id, req.user.sub);
    if (!cancelled) throw new ApiError('Pending request not found for you', 404);
    await audit.log({
      ...audit.contextFrom(req),
      action: 'payment_request_cancel',
      entityType: 'payment_request',
      entityId: cancelled.id,
    });
    return res.json({ success: true, message: 'Payment request cancelled', data: cancelled });
  } catch (error) {
    return next(error);
  }
};

const approveRequest = async (req, res, next) => {
  try {
    const data = await walletService.approvePaymentRequest({
      requestId: req.params.id,
      fromWalletId: req.validated.fromWalletId,
      user: req.user,
      auditContext: audit.contextFrom(req),
    });
    return res.json({ success: true, message: 'Payment request paid', data });
  } catch (error) {
    return next(error);
  }
};

const declineRequest = async (req, res, next) => {
  try {
    const declined = await paymentRequestModel.decline(req.params.id, req.user.email);
    if (!declined) throw new ApiError('Pending request not found for you', 404);
    await audit.log({
      ...audit.contextFrom(req),
      action: 'payment_request_decline',
      entityType: 'payment_request',
      entityId: declined.id,
    });
    return res.json({ success: true, message: 'Request declined', data: declined });
  } catch (error) {
    return next(error);
  }
};

module.exports = {
  createRequest,
  myRequests,
  getRequestById,
  updateRequest,
  cancelRequest,
  // Kept for route compatibility: DELETE now cancels instead of erasing history.
  deleteRequest: cancelRequest,
  approveRequest,
  declineRequest,
};
