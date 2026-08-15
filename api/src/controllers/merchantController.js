const merchantModel = require("../models/merchantModel");
const walletModel = require("../models/walletModel");
const { ApiError, withTransaction, lockWallet, setBalance, logTx } = require("../services/moneyService");

const createMerchant = async (req, res, next) => {
  try {
    if (!req.body.name) throw new ApiError("Merchant name is required", 400);
    const merchant = await merchantModel.create({ name: req.body.name });
    res.status(201).json({ success: true, message: "Merchant created", data: merchant });
  } catch (e) {
    next(e);
  }
};

const getAllMerchants = async (req, res, next) => {
  try {
    const merchants = await merchantModel.findAll();
    res.json({ success: true, count: merchants.length, data: merchants });
  } catch (e) {
    next(e);
  }
};

const getMerchantById = async (req, res, next) => {
  try {
    const merchant = await merchantModel.findById(req.params.id);
    if (!merchant) throw new ApiError("Merchant not found", 404);
    res.json({ success: true, data: merchant });
  } catch (e) {
    next(e);
  }
};

const updateMerchant = async (req, res, next) => {
  try {
    const { name, status } = req.body;
    if (!name || !status) throw new ApiError("Name and status are required", 400);
    const merchant = await merchantModel.update(req.params.id, name, status);
    if (!merchant) throw new ApiError("Merchant not found", 404);
    res.json({ success: true, message: "Merchant updated", data: merchant });
  } catch (e) {
    next(e);
  }
};

const deleteMerchant = async (req, res, next) => {
  try {
    const merchant = await merchantModel.remove(req.params.id);
    if (!merchant) throw new ApiError("Merchant not found", 404);
    res.json({ success: true, message: "Merchant deleted", data: merchant });
  } catch (e) {
    next(e);
  }
};

const payMerchant = async (req, res, next) => {
  try {
    const { merchantId, amount } = req.body;
    if (!merchantId || !amount || amount <= 0) {
      throw new ApiError("Valid merchantId and amount > 0 are required", 400);
    }

    const data = await withTransaction(async (client) => {
      // 1. Verify merchant exists
      const merchant = await merchantModel.findById(merchantId);
      if (!merchant) throw new ApiError("Merchant not found", 404);
      if (merchant.status !== 'active') throw new ApiError("Merchant is not active", 400);

      // 2. Lock the user's wallet
      const wallets = await walletModel.listByUser(req.user.sub);
      if (!wallets || wallets.length === 0) throw new ApiError("No wallet found", 404);
      
      const userWallet = await lockWallet(client, wallets[0].id);
      const paymentAmount = Number(amount);

      if (Number(userWallet.balance) < paymentAmount) {
        throw new ApiError("Insufficient balance to pay merchant", 400);
      }

      // 3. Deduct balance
      const newBalance = Number(userWallet.balance) - paymentAmount;
      await setBalance(client, userWallet, newBalance);

      // 4. Log in master ledger
      await logTx(client, {
        walletId: userWallet.id,
        type: 'transfer_out',
        amount: paymentAmount,
        balanceAfter: newBalance,
        description: `Payment to merchant: ${merchant.name}`
      });

      // 5. Log in merchant payments table
      const paymentLog = await merchantModel.logPayment(
        client, merchant.id, userWallet.id, paymentAmount, userWallet.currency
      );

      return { paymentLog, newBalance };
    });

    res.json({ success: true, message: "Payment successful", data });
  } catch (e) {
    next(e);
  }
};

module.exports = { createMerchant, getAllMerchants, getMerchantById, updateMerchant, deleteMerchant, payMerchant };
