const express = require('express');
const auth = require('../controllers/authController');
const { requireAuth, requireRole } = require('../middleware/auth');
const { loginLimiter, registerLimiter, refreshLimiter, readLimiter } = require('../middleware/rateLimiter');
const validate = require('../middleware/validate');
const v = require('../middleware/validators');

const router = express.Router();

router.post('/register', ...registerLimiter, [v.email(), v.newPassword(), v.fullName, v.phone], validate, auth.register);
router.post('/login', ...loginLimiter, [v.email(), v.loginPassword], validate, auth.login);
router.post('/refresh', refreshLimiter, auth.refresh);
router.post('/logout', refreshLimiter, auth.logout);
router.get('/me', requireAuth, ...readLimiter, auth.me);
router.get('/users', requireAuth, requireRole('admin'), ...readLimiter, v.pagination, validate, auth.getAllUsers);

module.exports = router;
