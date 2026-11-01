const express = require('express');
const walletController = require('../controllers/walletController');
const moneyController = require('../controllers/moneyController');
const { requireAuth } = require('../middleware/auth');
const { moneyLimiter, readLimiter, writeLimiter } = require('../middleware/rateLimiter');
const idempotency = require('../middleware/idempotency');
const validate = require('../middleware/validate');
const v = require('../middleware/validators');

const router = express.Router();
router.use(requireAuth);

router.post('/', ...writeLimiter, v.currency, validate, walletController.createWallet);
router.get('/', ...readLimiter, walletController.myWallets);
router.get('/:id', ...readLimiter, v.uuidParam('id'), validate, walletController.getWallet);
router.get('/:id/balance', ...readLimiter, v.uuidParam('id'), validate, walletController.getBalance);
router.get(
  '/:id/transactions',
  ...readLimiter,
  [v.uuidParam('id'), ...v.pagination, v.transactionType],
  validate,
  walletController.getTransactions,
);

const gatewayValidators = [v.uuidParam('id'), v.amount('amount'), v.provider, v.description];

router.post('/:id/top-up', ...moneyLimiter, gatewayValidators, validate, idempotency, moneyController.topUp);
router.post('/:id/withdraw', ...moneyLimiter, gatewayValidators, validate, idempotency, moneyController.withdraw);

module.exports = router;
