const walletModel = require('../models/walletModel');
const transactionModel = require('../models/transactionModel');
const audit = require('../models/auditModel');
const { ApiError } = require('../lib/errors');

async function loadOwnWallet(req) {
  const wallet = await walletModel.findById(req.params.id);
  // 404 for both "missing" and "someone else's" so wallet IDs cannot be probed.
  if (!wallet || wallet.user_id !== req.user.sub) throw new ApiError('Wallet not found', 404);
  return wallet;
}

const createWallet = async (req, res, next) => {
  try {
    const currency = req.validated.currency || 'USD';
    const existing = await walletModel.listByUser(req.user.sub);
    if (existing.some((w) => w.currency === currency && w.status !== 'closed')) {
      throw new ApiError(`You already have a ${currency} wallet`, 409);
    }
    const wallet = await walletModel.create(req.user.sub, currency);
    await audit.log({
      ...audit.contextFrom(req),
      action: 'wallet_create',
      entityType: 'wallet',
      entityId: wallet.id,
      metadata: { currency },
    });
    return res.status(201).json({ success: true, message: 'Wallet created', data: wallet });
  } catch (error) {
    return next(error);
  }
};

const myWallets = async (req, res, next) => {
  try {
    const wallets = await walletModel.listByUser(req.user.sub);
    return res.json({ success: true, count: wallets.length, data: wallets });
  } catch (error) {
    return next(error);
  }
};

const getWallet = async (req, res, next) => {
  try {
    return res.json({ success: true, data: await loadOwnWallet(req) });
  } catch (error) {
    return next(error);
  }
};

const getBalance = async (req, res, next) => {
  try {
    const wallet = await loadOwnWallet(req);
    return res.json({
      success: true,
      data: {
        walletId: wallet.id,
        walletNumber: wallet.wallet_number,
        currency: wallet.currency,
        balance: wallet.balance,
        status: wallet.status,
      },
    });
  } catch (error) {
    return next(error);
  }
};

const getTransactions = async (req, res, next) => {
  try {
    const wallet = await loadOwnWallet(req);
    const limit = req.validated.limit || 20;
    const offset = req.validated.offset || 0;
    const type = req.validated.type || null;
    const [rows, total] = await Promise.all([
      transactionModel.listByWallet(wallet.id, { limit, offset, type }),
      transactionModel.countByWallet(wallet.id, type),
    ]);
    return res.json({ success: true, count: rows.length, total, limit, offset, data: rows });
  } catch (error) {
    return next(error);
  }
};

module.exports = { createWallet, myWallets, getWallet, getBalance, getTransactions, loadOwnWallet };
