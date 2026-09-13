const express = require('express');
const router = express.Router();

const requestController = require('../controllers/requestController');
const { requireAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');

const {
    uuidParam,
    walletId,
    amount,
    body,
} = require('../middleware/validators');

router.post(
    '/',
    requireAuth,
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

router.get('/', requireAuth, requestController.myRequests);

router.get(
    '/:id',
    requireAuth,
    uuidParam('id'),
    validate,
    requestController.getRequestById,
);

router.put(
    '/:id',
    requireAuth,
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
    uuidParam('id'),
    validate,
    requestController.declineRequest,
);

module.exports = router;
