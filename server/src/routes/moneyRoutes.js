const express = require('express');
const moneyController = require('../controllers/moneyController');
const { requireAuth } = require('../middleware/auth');
const { moneyLimiter } = require('../middleware/rateLimiter');
const idempotency = require('../middleware/idempotency');
const validate = require('../middleware/validate');
const v = require('../middleware/validators');

const router = express.Router();

router.post(
  '/',
  requireAuth,
  ...moneyLimiter,
  [v.walletId('fromWalletId'), v.walletNumber('toWalletNumber'), v.amount('amount'), v.note],
  validate,
  idempotency,
  moneyController.sendMoney,
);

module.exports = router;
