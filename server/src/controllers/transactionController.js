const transactionModel = require("../models/transactionModel");
const walletModel = require("../models/walletModel");

const getHistory = async (req, res, next) => {
  try {
    const { limit = 10, offset = 0 } = req.query;
    
    // Find the user's wallet to get transactions
    const wallets = await walletModel.listByUser(req.user.sub);
    if (!wallets || wallets.length === 0) {
      return res.status(404).json({ success: false, error: "Wallet not found for this user" });
    }
    const wallet = wallets[0]; // Get the primary wallet

    const transactions = await transactionModel.listByWallet(wallet.id, limit, offset);
    
    res.json({ success: true, count: transactions.length, data: transactions });
  } catch (e) {
    next(e);
  }
};

module.exports = { getHistory };
