const express = require('express');
const router = express.Router();

const moneyController = require('../controllers/moneyController');
const { requireAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');

const { walletId, amount, body } = require('../middleware/validators');

router.post(
    '/',
    requireAuth,
    [
        walletId('fromWalletId'),

        amount('amount'),

        body('toWalletNumber')
            .trim()
            .matches(/^PAYNX-[0-9]{6}$/)
            .withMessage('Invalid wallet number'),

        body('note')
            .optional()
            .trim()
            .isLength({ max: 500 })
            .withMessage('Note is too long'),
    ],
    validate,
    moneyController.sendMoney,
);

module.exports = router;
