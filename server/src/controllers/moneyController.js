const walletService = require('../services/walletService');
const audit = require('../models/auditModel');

const topUp = async (req, res, next) => {
  try {
    const data = await walletService.topUp({
      walletId: req.params.id,
      userId: req.user.sub,
      amount: req.body.amount,
      provider: req.validated.provider || 'mock',
      description: req.validated.description,
      auditContext: audit.contextFrom(req),
    });
    return res.status(201).json({ success: true, message: 'Top-up successful', data });
  } catch (error) {
    return next(error);
  }
};

const withdraw = async (req, res, next) => {
  try {
    const data = await walletService.withdraw({
      walletId: req.params.id,
      userId: req.user.sub,
      amount: req.body.amount,
      provider: req.validated.provider || 'mock',
      description: req.validated.description,
      auditContext: audit.contextFrom(req),
    });
    return res.status(201).json({ success: true, message: 'Withdrawal successful', data });
  } catch (error) {
    return next(error);
  }
};

const sendMoney = async (req, res, next) => {
  try {
    const data = await walletService.transfer({
      fromWalletId: req.validated.fromWalletId,
      toWalletNumber: req.validated.toWalletNumber,
      amount: req.body.amount,
      note: req.validated.note,
      userId: req.user.sub,
      auditContext: audit.contextFrom(req),
    });
    return res.status(201).json({ success: true, message: 'Transfer successful', data });
  } catch (error) {
    return next(error);
  }
};

module.exports = { topUp, withdraw, sendMoney };
