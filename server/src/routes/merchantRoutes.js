const express = require('express');
const router = express.Router();

const merchantController = require('../controllers/merchantController');
const { requireAuth } = require('../middleware/auth');
const validate = require('../middleware/validate');

const { uuidParam, amount, body } = require('../middleware/validators');

router.post(
    '/',
    requireAuth,
    body('name')
        .trim()
        .notEmpty()
        .isLength({ max: 255 })
        .withMessage('Merchant name is invalid'),
    validate,
    merchantController.createMerchant,
);

router.get('/', requireAuth, merchantController.getAllMerchants);

router.get(
    '/:id',
    requireAuth,
    uuidParam('id'),
    validate,
    merchantController.getMerchantById,
);

router.put(
    '/:id',
    requireAuth,
    [
        uuidParam('id'),

        body('name')
            .trim()
            .notEmpty()
            .isLength({ max: 255 })
            .withMessage('Merchant name is invalid'),

        body('status')
            .trim()
            .isIn(['active', 'suspended', 'deleted'])
            .withMessage('Invalid merchant status'),
    ],
    validate,
    merchantController.updateMerchant,
);

router.delete(
    '/:id',
    requireAuth,
    uuidParam('id'),
    validate,
    merchantController.deleteMerchant,
);

router.post(
    '/pay',
    requireAuth,
    [
        body('merchantId')
            .trim()
            .isUUID()
            .withMessage('merchantId must be a valid UUID'),

        amount('amount'),
    ],
    validate,
    merchantController.payMerchant,
);

module.exports = router;
