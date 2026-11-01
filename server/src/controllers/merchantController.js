const merchantModel = require('../models/merchantModel');
const audit = require('../models/auditModel');
const walletService = require('../services/walletService');
const { ApiError } = require('../lib/errors');

const isAdmin = (req) => req.user?.role === 'admin';

const createMerchant = async (req, res, next) => {
  try {
    const merchant = await merchantModel.create({ name: req.validated.name });
    await audit.log({
      ...audit.contextFrom(req),
      action: 'merchant_create',
      entityType: 'merchant',
      entityId: merchant.id,
      metadata: { name: merchant.name },
    });
    return res.status(201).json({ success: true, message: 'Merchant created', data: merchant });
  } catch (error) {
    return next(error);
  }
};

const getAllMerchants = async (req, res, next) => {
  try {
    const merchants = await merchantModel.findAll({ includeSecret: isAdmin(req), includeDeleted: isAdmin(req) });
    return res.json({ success: true, count: merchants.length, data: merchants });
  } catch (error) {
    return next(error);
  }
};

const getMerchantById = async (req, res, next) => {
  try {
    const merchant = await merchantModel.findById(req.params.id, { includeSecret: isAdmin(req) });
    if (!merchant || (merchant.status === 'deleted' && !isAdmin(req))) throw new ApiError('Merchant not found', 404);
    return res.json({ success: true, data: merchant });
  } catch (error) {
    return next(error);
  }
};

const updateMerchant = async (req, res, next) => {
  try {
    const { name, status } = req.validated;
    const merchant = await merchantModel.update(req.params.id, { name, status });
    if (!merchant) throw new ApiError('Merchant not found', 404);
    await audit.log({
      ...audit.contextFrom(req),
      action: 'merchant_update',
      entityType: 'merchant',
      entityId: merchant.id,
      metadata: { name, status },
    });
    return res.json({ success: true, message: 'Merchant updated', data: merchant });
  } catch (error) {
    return next(error);
  }
};

const deleteMerchant = async (req, res, next) => {
  try {
    const merchant = await merchantModel.softDelete(req.params.id);
    if (!merchant) throw new ApiError('Merchant not found', 404);
    await audit.log({
      ...audit.contextFrom(req),
      action: 'merchant_delete',
      entityType: 'merchant',
      entityId: merchant.id,
    });
    return res.json({ success: true, message: 'Merchant deleted', data: merchant });
  } catch (error) {
    return next(error);
  }
};

const payMerchant = async (req, res, next) => {
  try {
    const data = await walletService.payMerchant({
      merchantId: req.validated.merchantId,
      fromWalletId: req.validated.fromWalletId,
      amount: req.body.amount,
      userId: req.user.sub,
      auditContext: audit.contextFrom(req),
    });
    return res.json({ success: true, message: 'Payment successful', data });
  } catch (error) {
    return next(error);
  }
};

module.exports = { createMerchant, getAllMerchants, getMerchantById, updateMerchant, deleteMerchant, payMerchant };
