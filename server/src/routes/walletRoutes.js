const express = require('express');
const router = express.Router();

const walletController = require('../controllers/walletController');
const moneyController = require('../controllers/moneyController');
const { requireAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');

const {
    uuidParam,
    amount,
    currency,
    body,
    query,
} = require('../middleware/validators');

router.post(
    '/',
    requireAuth,
    currency,
    validate,
    walletController.createWallet,
);

router.get('/', requireAuth, walletController.myWallets);

router.get(
    '/:id',
    requireAuth,
    uuidParam('id'),
    validate,
    walletController.getWallet,
);

router.get(
    '/:id/balance',
    requireAuth,
    uuidParam('id'),
    validate,
    walletController.getBalance,
);

router.get(
    '/:id/transactions',
    requireAuth,
    [
        uuidParam('id'),
        query('limit')
            .optional()
            .isInt({ min: 1, max: 100 })
            .toInt()
            .withMessage('Limit must be between 1 and 100'),

        query('offset')
            .optional()
            .isInt({ min: 0 })
            .toInt()
            .withMessage('Offset must be a non-negative integer'),
    ],
    validate,
    walletController.getTransactions,
);

router.post(
    '/:id/top-up',
    requireAuth,
    [
        uuidParam('id'),
        amount('amount'),

        body('provider')
            .optional()
            .trim()
            .isLength({ min: 1, max: 50 })
            .matches(/^[a-zA-Z0-9_-]+$/)
            .withMessage('Invalid payment provider'),

        body('description')
            .optional()
            .trim()
            .isLength({ max: 500 })
            .withMessage('Description is too long'),
    ],
    validate,
    moneyController.topUp,
);

router.post(
    '/:id/withdraw',
    requireAuth,
    [
        uuidParam('id'),
        amount('amount'),

        body('provider')
            .optional()
            .trim()
            .isLength({ min: 1, max: 50 })
            .matches(/^[a-zA-Z0-9_-]+$/)
            .withMessage('Invalid payment provider'),

        body('description')
            .optional()
            .trim()
            .isLength({ max: 500 })
            .withMessage('Description is too long'),
    ],
    validate,
    moneyController.withdraw,
);

module.exports = router;
