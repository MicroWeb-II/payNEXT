const express = require('express');
const merchantController = require('../controllers/merchantController');
const { requireAuth, requireRole } = require('../middleware/auth');
const { moneyLimiter, readLimiter, writeLimiter } = require('../middleware/rateLimiter');
const idempotency = require('../middleware/idempotency');
const validate = require('../middleware/validate');
const v = require('../middleware/validators');

const router = express.Router();
router.use(requireAuth);

const merchantName = v.text('name', { min: 1, max: 255, optional: false });
const MERCHANT_STATUSES = ['active', 'suspended'];

// `/pay` is declared before `/:id` routes so it is never captured as an id.
router.post(
  '/pay',
  ...moneyLimiter,
  [v.uuidBody('merchantId'), v.uuidBody('fromWalletId', { optional: true }), v.amount('amount')],
  validate,
  idempotency,
  merchantController.payMerchant,
);

router.get('/', ...readLimiter, merchantController.getAllMerchants);
router.get('/:id', ...readLimiter, v.uuidParam('id'), validate, merchantController.getMerchantById);

// Merchant administration is restricted to admins.
router.post('/', requireRole('admin'), ...writeLimiter, merchantName, validate, merchantController.createMerchant);
router.put(
  '/:id',
  requireRole('admin'),
  ...writeLimiter,
  [
    v.uuidParam('id'),
    merchantName,
    v.body('status').isIn(MERCHANT_STATUSES).withMessage(`status must be one of: ${MERCHANT_STATUSES.join(', ')}`),
  ],
  validate,
  merchantController.updateMerchant,
);
router.delete('/:id', requireRole('admin'), ...writeLimiter, v.uuidParam('id'), validate, merchantController.deleteMerchant);

module.exports = router;
