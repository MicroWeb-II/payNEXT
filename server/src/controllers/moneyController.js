const {
  ApiError,
  normalizeAmount,
  withTransaction,
  lockWallet,
  adjustBalance,
  logTx,
  gatewayLog,
} = require('../services/moneyService');
const audit = require('../models/auditModel');

const topUp = async (req, res, next) => {
  try {
    const amount = normalizeAmount(req.body.amount);

    const data = await withTransaction(async (client) => {
      const wallet = await lockWallet(client, req.params.id);
      if (!wallet) throw new ApiError('Wallet not found', 404);
      if (wallet.user_id !== req.user.sub) throw new ApiError('Not your wallet', 403);
      if (wallet.status !== 'active') throw new ApiError('Wallet is not active', 400);

      const provider = req.body.provider || 'mock';
      const gw = await gatewayLog(client, {
        walletId: wallet.id,
        provider,
        providerRef: 'MOCK-' + Date.now(),
        type: 'top_up',
        amount,
        currency: wallet.currency,
        status: 'completed',
      });

      const newBalance = await adjustBalance(client, wallet, amount, "credit");
      const tx = await logTx(client, {
        walletId: wallet.id,
        type: 'top_up',
        amount,
        balanceAfter: newBalance,
        referenceId: gw.id,
        description: req.body.description || `Top-up via ${provider}`,
      });

      return { newBalance, transaction: tx, gateway: gw };
    });

    await audit.log({
      actorUserId: req.user.sub,
      action: 'wallet_top_up',
      entityType: 'wallet',
      entityId: req.params.id,
      metadata: { amount, provider: req.body.provider || 'mock' },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json({ success: true, message: 'Top-up successful', data });
  } catch (e) {
    next(e);
  }
};

const withdraw = async (req, res, next) => {
  try {
    const amount = normalizeAmount(req.body.amount);

    const data = await withTransaction(async (client) => {
      const wallet = await lockWallet(client, req.params.id);
      if (!wallet) throw new ApiError("Wallet not found", 404);
      if (wallet.user_id !== req.user.sub) throw new ApiError("Not your wallet", 403);
      if (wallet.status !== "active") throw new ApiError("Wallet is not active", 400);
      const provider = req.body.provider || "mock";
      const gw = await gatewayLog(client, {
        walletId: wallet.id,
        provider,
        providerRef: 'MOCK-' + Date.now(),
        type: 'withdrawal',
        amount,
        currency: wallet.currency,
        status: 'completed',
      });

      const newBalance = await adjustBalance(client, wallet, amount, "debit");
      if (newBalance === undefined) throw new ApiError("Insufficient balance", 400);
      const tx = await logTx(client, {
        walletId: wallet.id,
        type: 'withdrawal',
        amount,
        balanceAfter: newBalance,
        referenceId: gw.id,
        description: req.body.description || `Withdrawal via ${provider}`,
      });

      return { newBalance, transaction: tx, gateway: gw };
    });

    await audit.log({
      actorUserId: req.user.sub,
      action: 'wallet_withdraw',
      entityType: 'wallet',
      entityId: req.params.id,
      metadata: { amount, provider: req.body.provider || 'mock' },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json({ success: true, message: 'Withdrawal successful', data });
  } catch (e) {
    next(e);
  }
};

const sendMoney = async (req, res, next) => {
  try {
    const amount = normalizeAmount(req.body.amount);
    const { fromWalletId, toWalletNumber, note } = req.body;
    if (!fromWalletId || !toWalletNumber)
      throw new ApiError('fromWalletId and toWalletNumber are required', 400);

    const data = await withTransaction(async (client) => {
      const from = await lockWallet(client, fromWalletId);
      if (!from) throw new ApiError('Sender wallet not found', 404);
      if (from.user_id !== req.user.sub) throw new ApiError('Not your wallet', 403);

      const toRes = await client.query(
        'SELECT * FROM wallets WHERE wallet_number = $1',
        [toWalletNumber],
      );
      const to = toRes.rows[0];
      if (!to) throw new ApiError("Receiver wallet not found", 404);
      if (to.id === from.id) throw new ApiError("Cannot send to the same wallet", 400);
      if (from.status !== "active" || to.status !== "active")
        throw new ApiError("Wallet is not active", 400);
      if (from.currency !== to.currency) throw new ApiError("Currency mismatch", 400);
      const lockedTo = await lockWallet(client, to.id);

      const tr = await client.query(
        `INSERT INTO transfers (from_wallet_id, to_wallet_id, amount, currency, note)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [from.id, to.id, amount, from.currency, note || null],
      );
      const transfer = tr.rows[0];

      const fromBalance = await adjustBalance(client, from, amount, "debit");
      if (fromBalance === undefined) throw new ApiError("Insufficient balance", 400);
      const toBalance = await adjustBalance(client, lockedTo, amount, "credit");

      await logTx(client, {
        walletId: from.id, type: 'transfer_out', amount,
        balanceAfter: fromBalance, referenceId: transfer.id,
        description: note || `Sent to ${to.wallet_number}`,
      });
      await logTx(client, {
        walletId: to.id, type: 'transfer_in', amount,
        balanceAfter: toBalance, referenceId: transfer.id,
        description: note || `Received from ${from.wallet_number}`,
      });

      return { transfer, fromBalance, toBalance };
    });

    await audit.log({
      actorUserId: req.user.sub,
      action: 'wallet_transfer',
      entityType: 'transfer',
      entityId: data.transfer.id,
      metadata: { amount, fromWalletId, toWalletNumber, note: note || null },
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    });

    res.status(201).json({ success: true, message: 'Transfer successful', data });
  } catch (e) {
    next(e);
  }
};

module.exports = { topUp, withdraw, sendMoney };
