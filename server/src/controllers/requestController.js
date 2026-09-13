const walletModel = require("../models/walletModel");
const paymentRequestModel = require("../models/paymentRequestModel");
const {
  ApiError,
  withTransaction,
  lockWallet,
  setBalance,
  logTx,
} = require("../services/moneyService");

const createRequest = async (req, res, next) => {
  try {
    const amount = Number(req.body.amount);
    const { requesterWalletId, payerEmail, note } = req.body;
    if (!amount || amount <= 0)
      throw new ApiError("amount must be greater than 0", 400);
    if (!requesterWalletId || !payerEmail)
      throw new ApiError("requesterWalletId and payerEmail are required", 400);

    const wallet = await walletModel.findById(requesterWalletId);
    if (!wallet) throw new ApiError("Wallet not found", 404);
    if (wallet.user_id !== req.user.sub)
      throw new ApiError("Not your wallet", 403);

    const request = await paymentRequestModel.create({
      requesterWalletId: wallet.id,
      payerEmail: payerEmail.toLowerCase(),
      amount,
      currency: wallet.currency,
      note: note || null,
    });

    res
      .status(201)
      .json({ success: true, message: "Payment request sent", data: request });
  } catch (e) {
    next(e);
  }
};

const myRequests = async (req, res, next) => {
  try {
    const rows = await paymentRequestModel.listForUser(
      req.user.sub,
      req.user.email,
    );
    res.json({ success: true, count: rows.length, data: rows });
  } catch (e) {
    next(e);
  }
};

const approveRequest = async (req, res, next) => {
  try {
    const { fromWalletId } = req.body;
    if (!fromWalletId) throw new ApiError("fromWalletId is required", 400);

    const data = await withTransaction(async (client) => {
      const request = await paymentRequestModel.findByIdForUpdate(
        client,
        req.params.id,
      );
      if (!request) throw new ApiError("Payment request not found", 404);
      if (request.status !== "pending")
        throw new ApiError("Request is not pending", 400);
      if (request.payer_email !== req.user.email)
        throw new ApiError("Only the payer can approve this request", 403);

      const payerWallet = await lockWallet(client, fromWalletId);
      if (!payerWallet) throw new ApiError("Payer wallet not found", 404);
      if (payerWallet.user_id !== req.user.sub)
        throw new ApiError("Not your wallet", 403);

      const amount = Number(request.amount);
      if (Number(payerWallet.balance) < amount)
        throw new ApiError("Insufficient balance", 400);

      const requesterWallet = await lockWallet(
        client,
        request.requester_wallet_id,
      );

      const payerBalance = Number(payerWallet.balance) - amount;
      const requesterBalance = Number(requesterWallet.balance) + amount;
      await setBalance(client, payerWallet, payerBalance);
      await setBalance(client, requesterWallet, requesterBalance);

      await logTx(client, {
        walletId: payerWallet.id,
        type: "request_out",
        amount,
        balanceAfter: payerBalance,
        referenceId: request.id,
        description: request.note || "Paid request",
      });
      await logTx(client, {
        walletId: requesterWallet.id,
        type: "request_in",
        amount,
        balanceAfter: requesterBalance,
        referenceId: request.id,
        description: request.note || "Request paid",
      });

      const paid = await paymentRequestModel.markPaid(
        client,
        request.id,
        payerWallet.id,
      );
      return { paymentRequest: paid };
    });

    res.json({ success: true, message: "Payment request paid", data });
  } catch (e) {
    next(e);
  }
};

const declineRequest = async (req, res, next) => {
  try {
    const declined = await paymentRequestModel.decline(
      req.params.id,
      req.user.email,
    );
    if (!declined)
      return res
        .status(404)
        .json({ success: false, error: "Pending request not found for you" });
    res.json({ success: true, message: "Request declined", data: declined });
  } catch (e) {
    next(e);
  }
};
const getRequestById = async (req, res, next) => {
  try {
    const request = await paymentRequestModel.findById(req.params.id);
    if (!request) throw new ApiError("Payment request not found", 404);
    res.json({ success: true, data: request });
  } catch (e) {
    next(e);
  }
};

const updateRequest = async (req, res, next) => {
  try {
    const { amount, note } = req.body;
    if (!amount || amount <= 0) throw new ApiError("Amount must be > 0", 400);

    const updated = await paymentRequestModel.update(req.params.id, amount, note, req.user.email);
    if (!updated) throw new ApiError("Pending request not found for you", 404);

    res.json({ success: true, message: "Payment request updated", data: updated });
  } catch (e) {
    next(e);
  }
};

const deleteRequest = async (req, res, next) => {
  try {
    const deleted = await paymentRequestModel.remove(req.params.id, req.user.email);
    if (!deleted) throw new ApiError("Pending request not found for you", 404);

    res.json({ success: true, message: "Payment request deleted", data: deleted });
  } catch (e) {
    next(e);
  }
};

module.exports = { createRequest, myRequests, approveRequest, declineRequest, getRequestById, updateRequest, deleteRequest };
