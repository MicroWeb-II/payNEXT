const transactionModel = require('../models/transactionModel');
const walletModel = require('../models/walletModel');
const { ApiError } = require('../lib/errors');

/**
 * Transaction history for one of the caller's wallets (the primary wallet
 * unless `walletId` is given), newest first, with limit/offset pagination and
 * an optional `type` filter.
 */
const getHistory = async (req, res, next) => {
  try {
    const { limit = 20, offset = 0, type = null, walletId } = req.validated;
    const wallets = await walletModel.listByUser(req.user.sub);
    const wallet = walletId ? wallets.find((w) => w.id === walletId) : wallets[0];
    if (!wallet) throw new ApiError('Wallet not found', 404);

    const [rows, total] = await Promise.all([
      transactionModel.listByWallet(wallet.id, { limit, offset, type }),
      transactionModel.countByWallet(wallet.id, type),
    ]);
    return res.json({ success: true, count: rows.length, total, limit, offset, walletId: wallet.id, data: rows });
  } catch (error) {
    return next(error);
  }
};

module.exports = { getHistory };
