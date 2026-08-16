const {
  ApiError,
  withTransaction,
  lockWallet,
  setBalance,
  logTx,
  gatewayLog,
} = require("../services/moneyService");

const topUp = async (req, res, next) => {
  try {
    const amount = Number(req.body.amount);
    if (!amount || amount <= 0) throw new ApiError("amount must be greater than 0", 400);

    const data = await withTransaction(async (client) => {
      const wallet = await lockWallet(client, req.params.id);
      if (!wallet) throw new ApiError("Wallet not found", 404);
      if (wallet.user_id !== req.user.sub) throw new ApiError("Not your wallet", 403);
      if (wallet.status !== "active") throw new ApiError("Wallet is not active", 400);

      const provider = req.body.provider || "mock";
      const gw = await gatewayLog(client, {
        walletId: wallet.id,
        provider,
        providerRef: "MOCK-" + Date.now(),
        type: "top_up",
        amount,
        currency: wallet.currency,
        status: "completed",
      });

      const newBalance = Number(wallet.balance) + amount;
      await setBalance(client, wallet, newBalance);
      const tx = await logTx(client, {
        walletId: wallet.id,
        type: "top_up",
        amount,
        balanceAfter: newBalance,
        referenceId: gw.id,
        description: req.body.description || `Top-up via ${provider}`,
      });

      return { newBalance: newBalance.toFixed(2), transaction: tx, gateway: gw };
    });

    res.status(201).json({ success: true, message: "Top-up successful", data });
  } catch (e) {
    next(e);
  }
};

const withdraw = async (req, res, next) => {
  try {
    const amount = Number(req.body.amount);
    if (!amount || amount <= 0) throw new ApiError("amount must be greater than 0", 400);

    const data = await withTransaction(async (client) => {
      const wallet = await lockWallet(client, req.params.id);
      if (!wallet) throw new ApiError("Wallet not found", 404);
      if (wallet.user_id !== req.user.sub) throw new ApiError("Not your wallet", 403);
      if (wallet.status !== "active") throw new ApiError("Wallet is not active", 400);
      if (Number(wallet.balance) < amount) throw new ApiError("Insufficient balance", 400);

      const provider = req.body.provider || "mock";
      const gw = await gatewayLog(client, {
        walletId: wallet.id,
        provider,
        providerRef: "MOCK-" + Date.now(),
        type: "withdrawal",
        amount,
        currency: wallet.currency,
        status: "completed",
      });

      const newBalance = Number(wallet.balance) - amount;
      await setBalance(client, wallet, newBalance);
      const tx = await logTx(client, {
        walletId: wallet.id,
        type: "withdrawal",
        amount,
        balanceAfter: newBalance,
        referenceId: gw.id,
        description: req.body.description || `Withdrawal via ${provider}`,
      });

      return { newBalance: newBalance.toFixed(2), transaction: tx, gateway: gw };
    });

    res.status(201).json({ success: true, message: "Withdrawal successful", data });
  } catch (e) {
    next(e);
  }
};

const sendMoney = async (req, res, next) => {
  try {
    const amount = Number(req.body.amount);
    const { fromWalletId, toWalletNumber, note } = req.body;
    if (!amount || amount <= 0) throw new ApiError("amount must be greater than 0", 400);
    if (!fromWalletId || !toWalletNumber)
      throw new ApiError("fromWalletId and toWalletNumber are required", 400);

    const data = await withTransaction(async (client) => {
      const from = await lockWallet(client, fromWalletId);
      if (!from) throw new ApiError("Sender wallet not found", 404);
      if (from.user_id !== req.user.sub) throw new ApiError("Not your wallet", 403);

      const toRes = await client.query(
        "SELECT * FROM wallets WHERE wallet_number = $1",
        [toWalletNumber]
      );
      const to = toRes.rows[0];
      if (!to) throw new ApiError("Receiver wallet not found", 404);
      if (to.id === from.id) throw new ApiError("Cannot send to the same wallet", 400);
      if (from.status !== "active" || to.status !== "active")
        throw new ApiError("Wallet is not active", 400);
      if (from.currency !== to.currency) throw new ApiError("Currency mismatch", 400);
      if (Number(from.balance) < amount) throw new ApiError("Insufficient balance", 400);

      const lockedTo = await lockWallet(client, to.id);

      const tr = await client.query(
        `INSERT INTO transfers (from_wallet_id, to_wallet_id, amount, currency, note)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [from.id, to.id, amount, from.currency, note || null]
      );
      const transfer = tr.rows[0];

      const fromBalance = Number(from.balance) - amount;
      const toBalance = Number(lockedTo.balance) + amount;
      await setBalance(client, from, fromBalance);
      await setBalance(client, lockedTo, toBalance);

      await logTx(client, {
        walletId: from.id, type: "transfer_out", amount,
        balanceAfter: fromBalance, referenceId: transfer.id,
        description: note || `Sent to ${to.wallet_number}`,
      });
      await logTx(client, {
        walletId: to.id, type: "transfer_in", amount,
        balanceAfter: toBalance, referenceId: transfer.id,
        description: note || `Received from ${from.wallet_number}`,
      });

      return { transfer, fromBalance: fromBalance.toFixed(2), toBalance: toBalance.toFixed(2) };
    });

    res.status(201).json({ success: true, message: "Transfer successful", data });
  } catch (e) {
    next(e);
  }
};

module.exports = { topUp, withdraw, sendMoney };
