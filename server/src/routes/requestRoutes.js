const express = require('express');
const router = express.Router();

const requestController = require('../controllers/requestController');
const { requireAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { moneyLimiter } = require('../middleware/rateLimiter');
const { readLimiter } = require('../middleware/rateLimiter');
const idempotency = require('../middleware/idempotency');

const {
    uuidParam,
    walletId,
    amount,
    body,
} = require('../middleware/validators');

router.post(
    '/',
    requireAuth,
    idempotency,
    [
        walletId('requesterWalletId'),

        body('payerEmail')
            .trim()
            .normalizeEmail()
            .isEmail()
            .withMessage('Invalid payer email'),

        amount('amount'),

        body('note')
            .optional()
            .trim()
            .isLength({ max: 500 })
            .withMessage('Note is too long'),
    ],
    validate,
    requestController.createRequest,
);

router.get('/', requireAuth, ...readLimiter, requestController.myRequests);

router.get(
    '/:id',
    requireAuth,
    ...readLimiter,
    uuidParam('id'),
    validate,
    requestController.getRequestById,
);

router.put(
    '/:id',
    requireAuth,
    idempotency,
    [
        uuidParam('id'),
        amount('amount'),

        body('note')
            .optional()
            .trim()
            .isLength({ max: 500 })
            .withMessage('Note is too long'),
    ],
    validate,
    requestController.updateRequest,
);

router.delete(
    '/:id',
    requireAuth,
    uuidParam('id'),
    validate,
    requestController.deleteRequest,
);

router.post(
    '/:id/approve',
    requireAuth,
    ...moneyLimiter,
    idempotency,
    [
        uuidParam('id'),

        body('fromWalletId')
            .trim()
            .isUUID()
            .withMessage('fromWalletId must be a valid UUID'),
    ],
    validate,
    requestController.approveRequest,
);

router.post(
    '/:id/decline',
    requireAuth,
    ...moneyLimiter,
    uuidParam('id'),
    validate,
    requestController.declineRequest,
);

module.exports = router;
