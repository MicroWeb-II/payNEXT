/**
 * Balance-changing operations. Each runs in one database transaction that
 * locks the wallets involved (in id order), changes balances with NUMERIC SQL
 * arithmetic, appends ledger rows and writes the audit entry, so either all of
 * it happens or none of it does.
 */
const crypto = require('crypto');
const audit = require('../models/auditModel');
const merchantModel = require('../models/merchantModel');
const paymentRequestModel = require('../models/paymentRequestModel');
const walletModel = require('../models/walletModel');
const { moneyMovementsTotal } = require('../observability/metrics');
const {
  ApiError,
  withTransaction,
  normalizeAmount,
  lockWallet,
  lockWallets,
  assertUsableWallet,
  credit,
  debit,
  logTx,
  gatewayLog,
} = require('./moneyService');

function recordMetric(type) {
  moneyMovementsTotal.inc({ type });
}

async function gatewayMovement(type, { walletId, userId, amount, provider = 'mock', description, auditContext }) {
  const value = normalizeAmount(amount);
  const result = await withTransaction(async (client) => {
    const wallet = assertUsableWallet(await lockWallet(client, walletId), { userId });

    const balance = type === 'top_up' ? await credit(client, wallet.id, value) : await debit(client, wallet.id, value);
    if (balance === undefined) throw new ApiError('Insufficient balance', 400);

    const gateway = await gatewayLog(client, {
      walletId: wallet.id,
      provider,
      providerRef: `MOCK-${crypto.randomUUID()}`,
      type,
      amount: value,
      currency: wallet.currency,
      status: 'completed',
    });
    const transaction = await logTx(client, {
      walletId: wallet.id,
      type,
      amount: value,
      balanceAfter: balance,
      referenceId: gateway.id,
      description: description || `${type === 'top_up' ? 'Top-up' : 'Withdrawal'} via ${provider}`,
    });
    await audit.log({
      ...auditContext,
      action: type === 'top_up' ? 'wallet_top_up' : 'wallet_withdraw',
      entityType: 'wallet',
      entityId: wallet.id,
      metadata: { amount: value, currency: wallet.currency, provider, transactionId: transaction.id },
    }, client);

    return { newBalance: balance, currency: wallet.currency, transaction, gateway };
  });
  recordMetric(type);
  return result;
}

const topUp = (params) => gatewayMovement('top_up', params);
const withdraw = (params) => gatewayMovement('withdrawal', params);

async function transfer({ fromWalletId, toWalletNumber, amount, note, userId, auditContext }) {
  const value = normalizeAmount(amount);
  const result = await withTransaction(async (client) => {
    const target = await walletModel.findByNumber(toWalletNumber, client);
    if (!target) throw new ApiError('Receiver wallet not found', 404);
    if (target.id === fromWalletId) throw new ApiError('Cannot send money to the same wallet', 400);

    const locked = await lockWallets(client, [fromWalletId, target.id]);
    const from = assertUsableWallet(locked.get(fromWalletId), { userId, label: 'Sender wallet' });
    const to = assertUsableWallet(locked.get(target.id), { label: 'Receiver wallet' });
    if (from.currency !== to.currency) throw new ApiError('Currency mismatch between wallets', 400);

    const fromBalance = await debit(client, from.id, value);
    if (fromBalance === undefined) throw new ApiError('Insufficient balance', 400);
    const toBalance = await credit(client, to.id, value);

    const tr = await client.query(
      `INSERT INTO transfers (from_wallet_id, to_wallet_id, amount, currency, note)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [from.id, to.id, value, from.currency, note || null],
    );
    const transferRow = tr.rows[0];

    await logTx(client, {
      walletId: from.id,
      type: 'transfer_out',
      amount: value,
      balanceAfter: fromBalance,
      referenceId: transferRow.id,
      description: note || `Sent to ${to.wallet_number}`,
    });
    await logTx(client, {
      walletId: to.id,
      type: 'transfer_in',
      amount: value,
      balanceAfter: toBalance,
      referenceId: transferRow.id,
      description: note || `Received from ${from.wallet_number}`,
    });
    await audit.log({
      ...auditContext,
      action: 'wallet_transfer',
      entityType: 'transfer',
      entityId: transferRow.id,
      metadata: { amount: value, currency: from.currency, fromWalletId: from.id, toWalletId: to.id },
    }, client);

    // The receiver's balance is private to the receiver.
    return { transfer: transferRow, fromBalance };
  });
  recordMetric('transfer');
  return result;
}

async function resolvePayerWallet(client, userId, walletId) {
  if (walletId) return lockWallet(client, walletId);
  const wallets = await walletModel.listByUser(userId, client);
  const primary = wallets.find((w) => w.status === 'active') || wallets[0];
  return primary ? lockWallet(client, primary.id) : undefined;
}

async function payMerchant({ merchantId, amount, fromWalletId, userId, auditContext }) {
  const value = normalizeAmount(amount);
  const result = await withTransaction(async (client) => {
    const merchant = await merchantModel.findById(merchantId, { db: client });
    if (!merchant || merchant.status === 'deleted') throw new ApiError('Merchant not found', 404);
    if (merchant.status !== 'active') throw new ApiError('Merchant is not accepting payments', 409);

    const wallet = assertUsableWallet(await resolvePayerWallet(client, userId, fromWalletId), { userId });
    const newBalance = await debit(client, wallet.id, value);
    if (newBalance === undefined) throw new ApiError('Insufficient balance to pay merchant', 400);

    const paymentLog = await merchantModel.logPayment(client, {
      merchantId: merchant.id,
      walletId: wallet.id,
      amount: value,
      currency: wallet.currency,
    });
    await logTx(client, {
      walletId: wallet.id,
      type: 'merchant_payment',
      amount: value,
      balanceAfter: newBalance,
      referenceId: paymentLog.id,
      description: `Payment to ${merchant.name}`,
    });
    await audit.log({
      ...auditContext,
      action: 'merchant_payment',
      entityType: 'merchant_payment',
      entityId: paymentLog.id,
      metadata: { amount: value, currency: wallet.currency, merchantId: merchant.id, walletId: wallet.id },
    }, client);

    return { paymentLog, newBalance };
  });
  recordMetric('merchant_payment');
  return result;
}

async function approvePaymentRequest({ requestId, fromWalletId, user, auditContext }) {
  const result = await withTransaction(async (client) => {
    const request = await paymentRequestModel.findByIdForUpdate(client, requestId);
    if (!request || request.payer_email !== user.email) throw new ApiError('Payment request not found', 404);
    if (request.status !== 'pending') throw new ApiError(`Payment request is already ${request.status}`, 409);

    const amount = normalizeAmount(request.amount);
    const locked = await lockWallets(client, [fromWalletId, request.requester_wallet_id]);
    const payerWallet = assertUsableWallet(locked.get(fromWalletId), { userId: user.sub, label: 'Payer wallet' });
    const requesterWallet = assertUsableWallet(locked.get(request.requester_wallet_id), { label: 'Requester wallet' });
    if (payerWallet.id === requesterWallet.id) throw new ApiError('Cannot pay your own request', 400);
    if (payerWallet.currency !== request.currency) throw new ApiError('Currency mismatch with the request', 400);

    const payerBalance = await debit(client, payerWallet.id, amount);
    if (payerBalance === undefined) throw new ApiError('Insufficient balance', 400);
    const requesterBalance = await credit(client, requesterWallet.id, amount);

    await logTx(client, {
      walletId: payerWallet.id,
      type: 'request_out',
      amount,
      balanceAfter: payerBalance,
      referenceId: request.id,
      description: request.note || `Paid request from ${requesterWallet.wallet_number}`,
    });
    await logTx(client, {
      walletId: requesterWallet.id,
      type: 'request_in',
      amount,
      balanceAfter: requesterBalance,
      referenceId: request.id,
      description: request.note || `Request paid by ${payerWallet.wallet_number}`,
    });
    const paid = await paymentRequestModel.markPaid(client, request.id, payerWallet.id);
    await audit.log({
      ...auditContext,
      action: 'payment_request_paid',
      entityType: 'payment_request',
      entityId: request.id,
      metadata: { amount, currency: request.currency, payerWalletId: payerWallet.id },
    }, client);

    return { paymentRequest: paid, newBalance: payerBalance };
  });
  recordMetric('payment_request');
  return result;
}

async function adminAdjust({ walletId, direction, amount, reason, auditContext }) {
  const value = normalizeAmount(amount);
  if (!['credit', 'debit'].includes(direction)) throw new ApiError('direction must be credit or debit', 400);
  const result = await withTransaction(async (client) => {
    const wallet = await lockWallet(client, walletId);
    if (!wallet) throw new ApiError('Wallet not found', 404);
    if (wallet.status === 'closed') throw new ApiError('Wallet is closed', 409);

    const balance = direction === 'credit' ? await credit(client, wallet.id, value) : await debit(client, wallet.id, value);
    if (balance === undefined) throw new ApiError('Insufficient balance for this debit adjustment', 400);

    const transaction = await logTx(client, {
      walletId: wallet.id,
      type: direction === 'credit' ? 'adjustment_credit' : 'adjustment_debit',
      amount: value,
      balanceAfter: balance,
      description: `Admin adjustment: ${reason}`,
    });
    await audit.log({
      ...auditContext,
      action: 'admin_adjustment',
      entityType: 'wallet',
      entityId: wallet.id,
      metadata: { direction, amount: value, currency: wallet.currency, reason, transactionId: transaction.id },
    }, client);
    return { newBalance: balance, transaction };
  });
  recordMetric(`adjustment_${direction}`);
  return result;
}

async function setWalletStatus({ walletId, status, reason, auditContext }) {
  return withTransaction(async (client) => {
    const wallet = await lockWallet(client, walletId);
    if (!wallet) throw new ApiError('Wallet not found', 404);
    if (wallet.status === 'closed') throw new ApiError('Wallet is closed', 409);
    if (wallet.status === status) throw new ApiError(`Wallet is already ${status}`, 409);

    const updated = await walletModel.setStatus(client, wallet.id, status);
    await audit.log({
      ...auditContext,
      action: status === 'frozen' ? 'wallet_freeze' : 'wallet_unfreeze',
      entityType: 'wallet',
      entityId: wallet.id,
      metadata: { from: wallet.status, to: status, reason },
    }, client);
    return updated;
  });
}

module.exports = {
  topUp,
  withdraw,
  transfer,
  payMerchant,
  approvePaymentRequest,
  adminAdjust,
  setWalletStatus,
};
