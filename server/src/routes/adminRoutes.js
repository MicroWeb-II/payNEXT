const express = require('express');
const admin = require('../controllers/adminController');
const { requireAuth, requireRole } = require('../middleware/auth');
const { moneyLimiter, readLimiter, writeLimiter } = require('../middleware/rateLimiter');
const idempotency = require('../middleware/idempotency');
const validate = require('../middleware/validate');
const v = require('../middleware/validators');

const router = express.Router();
router.use(requireAuth, requireRole('admin'));

router.get('/users', ...readLimiter, v.pagination, validate, admin.listUsers);
router.patch(
  '/users/:id/role',
  ...writeLimiter,
  [v.uuidParam('id'), v.body('role').isIn(['user', 'admin']).withMessage('role must be user or admin')],
  validate,
  admin.changeRole,
);
router.post('/wallets/:id/freeze', ...writeLimiter, [v.uuidParam('id'), v.reason()], validate, admin.freezeWallet);
router.post('/wallets/:id/unfreeze', ...writeLimiter, [v.uuidParam('id'), v.reason()], validate, admin.unfreezeWallet);
router.post(
  '/wallets/:id/adjustments',
  ...moneyLimiter,
  [
    v.uuidParam('id'),
    v.body('direction').isIn(['credit', 'debit']).withMessage('direction must be credit or debit'),
    v.amount('amount'),
    v.reason(),
  ],
  validate,
  idempotency,
  admin.adjustBalance,
);
router.get(
  '/audit-log',
  ...readLimiter,
  [...v.pagination, v.query('action').optional().isString().isLength({ max: 100 })],
  validate,
  admin.auditLog,
);

module.exports = router;
