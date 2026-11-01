const express = require('express');
const requestController = require('../controllers/requestController');
const { requireAuth } = require('../middleware/auth');
const { moneyLimiter, readLimiter, writeLimiter } = require('../middleware/rateLimiter');
const idempotency = require('../middleware/idempotency');
const validate = require('../middleware/validate');
const v = require('../middleware/validators');

const router = express.Router();
router.use(requireAuth);

router.post(
  '/',
  ...writeLimiter,
  [v.walletId('requesterWalletId'), v.email('payerEmail'), v.amount('amount'), v.note],
  validate,
  idempotency,
  requestController.createRequest,
);
router.get('/', ...readLimiter, requestController.myRequests);
router.get('/:id', ...readLimiter, v.uuidParam('id'), validate, requestController.getRequestById);
router.put(
  '/:id',
  ...writeLimiter,
  [v.uuidParam('id'), v.amount('amount'), v.note],
  validate,
  requestController.updateRequest,
);
router.delete('/:id', ...writeLimiter, v.uuidParam('id'), validate, requestController.cancelRequest);
router.post(
  '/:id/approve',
  ...moneyLimiter,
  [v.uuidParam('id'), v.walletId('fromWalletId')],
  validate,
  idempotency,
  requestController.approveRequest,
);
router.post('/:id/decline', ...writeLimiter, v.uuidParam('id'), validate, requestController.declineRequest);

module.exports = router;
