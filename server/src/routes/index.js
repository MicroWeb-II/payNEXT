const express = require('express');
const { checkReadiness } = require('../config/db');

const router = express.Router();

/** Readiness probe: the API is up and can reach PostgreSQL. */
router.get('/health', async (req, res) => {
  try {
    await checkReadiness();
    res.json({ success: true, service: 'paynext-api', database: 'ok', time: new Date().toISOString() });
  } catch (error) {
    req.log?.warn({ err: error }, 'Readiness check failed');
    res.status(503).json({ success: false, service: 'paynext-api', database: 'unavailable' });
  }
});

router.use('/auth', require('./authRoutes'));
router.use('/wallets', require('./walletRoutes'));
router.use('/transfers', require('./moneyRoutes'));
router.use('/payment-requests', require('./requestRoutes'));
router.use('/history', require('./transactionRoutes'));
router.use('/merchants', require('./merchantRoutes'));
router.use('/admin', require('./adminRoutes'));

module.exports = router;
