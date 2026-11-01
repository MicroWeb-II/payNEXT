const express = require('express');
const transactionController = require('../controllers/transactionController');
const { requireAuth } = require('../middleware/auth');
const { readLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const v = require('../middleware/validators');

const router = express.Router();

router.get(
  '/',
  requireAuth,
  ...readLimiter,
  [...v.pagination, v.transactionType, v.query('walletId').optional().isUUID().withMessage('walletId must be a valid UUID')],
  validate,
  transactionController.getHistory,
);

module.exports = router;
