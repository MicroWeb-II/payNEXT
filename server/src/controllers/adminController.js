const audit = require('../models/auditModel');
const userModel = require('../models/userModel');
const refreshTokens = require('../services/refreshTokenService');
const walletService = require('../services/walletService');
const { withTransaction } = require('../services/moneyService');
const { ApiError } = require('../lib/errors');

const listUsers = async (req, res, next) => {
  try {
    const users = await userModel.findAll({ limit: req.validated.limit || 50, offset: req.validated.offset || 0 });
    return res.json({ success: true, count: users.length, data: users });
  } catch (error) {
    return next(error);
  }
};

const changeRole = async (req, res, next) => {
  try {
    const { role } = req.validated;
    if (req.params.id === req.user.sub) throw new ApiError('You cannot change your own role', 400);

    const updated = await withTransaction(async (client) => {
      const user = await userModel.lockById(client, req.params.id);
      if (!user) throw new ApiError('User not found', 404);
      if (user.role === role) throw new ApiError(`User already has role ${role}`, 409);
      const changed = await userModel.updateRole(client, user.id, role);
      // Force re-authentication so the new role is reflected everywhere.
      await refreshTokens.revokeAllForUser(user.id, 'role_change', client);
      await audit.log({
        ...audit.contextFrom(req),
        action: 'role_change',
        entityType: 'user',
        entityId: user.id,
        metadata: { from: user.role, to: role },
      }, client);
      return changed;
    });
    return res.json({ success: true, message: 'Role updated', data: updated });
  } catch (error) {
    return next(error);
  }
};

const freezeWallet = async (req, res, next) => {
  try {
    const wallet = await walletService.setWalletStatus({
      walletId: req.params.id,
      status: 'frozen',
      reason: req.validated.reason,
      auditContext: audit.contextFrom(req),
    });
    return res.json({ success: true, message: 'Wallet frozen', data: wallet });
  } catch (error) {
    return next(error);
  }
};

const unfreezeWallet = async (req, res, next) => {
  try {
    const wallet = await walletService.setWalletStatus({
      walletId: req.params.id,
      status: 'active',
      reason: req.validated.reason,
      auditContext: audit.contextFrom(req),
    });
    return res.json({ success: true, message: 'Wallet unfrozen', data: wallet });
  } catch (error) {
    return next(error);
  }
};

const adjustBalance = async (req, res, next) => {
  try {
    const data = await walletService.adminAdjust({
      walletId: req.params.id,
      direction: req.validated.direction,
      amount: req.body.amount,
      reason: req.validated.reason,
      auditContext: audit.contextFrom(req),
    });
    return res.status(201).json({ success: true, message: 'Balance adjusted', data });
  } catch (error) {
    return next(error);
  }
};

const auditLog = async (req, res, next) => {
  try {
    const rows = await audit.list({
      limit: req.validated.limit || 50,
      offset: req.validated.offset || 0,
      action: req.validated.action,
    });
    return res.json({ success: true, count: rows.length, data: rows });
  } catch (error) {
    return next(error);
  }
};

module.exports = { listUsers, changeRole, freezeWallet, unfreezeWallet, adjustBalance, auditLog };
