const walletModel = require("../models/walletModel");
const transactionModel = require("../models/transactionModel");

async function loadOwnWallet(req) {
  const wallet = await walletModel.findById(req.params.id);
  if (!wallet) return { error: "Wallet not found", status: 404 };
  if (wallet.user_id !== req.user.sub)
    return { error: "Not your wallet", status: 403 };
  return { wallet };
}

const createWallet = async (req, res, next) => {
  try {
    const wallet = await walletModel.create(
      req.user.sub,
      req.body.currency || "USD",
    );
    res
      .status(201)
      .json({ success: true, message: "Wallet created", data: wallet });
  } catch (e) {
    next(e);
  }
};

const myWallets = async (req, res, next) => {
  try {
    const wallets = await walletModel.listByUser(req.user.sub);
    res.json({ success: true, count: wallets.length, data: wallets });
  } catch (e) {
    next(e);
  }
};

const getWallet = async (req, res, next) => {
  try {
    const { wallet, error, status } = await loadOwnWallet(req);
    if (error) return res.status(status).json({ success: false, error });
    res.json({ success: true, data: wallet });
  } catch (e) {
    next(e);
  }
};

const getBalance = async (req, res, next) => {
  try {
    const { wallet, error, status } = await loadOwnWallet(req);
    if (error) return res.status(status).json({ success: false, error });
    res.json({
      success: true,
      data: {
        walletId: wallet.id,
        walletNumber: wallet.wallet_number,
        currency: wallet.currency,
        balance: wallet.balance,
      },
    });
  } catch (e) {
    next(e);
  }
};

const getTransactions = async (req, res, next) => {
  try {
    const { wallet, error, status } = await loadOwnWallet(req);
    if (error) return res.status(status).json({ success: false, error });

    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const offset = Number(req.query.offset) || 0;

    const rows = await transactionModel.listByWallet(wallet.id, limit, offset);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (e) {
    next(e);
  }
};

module.exports = {
  createWallet,
  myWallets,
  getWallet,
  getBalance,
  getTransactions,
};
