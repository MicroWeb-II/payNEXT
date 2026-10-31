const express = require('express');
const router = express.Router();
const { body, validationResult } = require('express-validator');
const { authLimiter } = require('../middleware/rateLimiter');
const { register, login, me, getAllUsers } = require('../controllers/authController');
const { requireAuth, requireRole } = require('../middleware/auth');

// Helper middleware to check for validation errors
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

// LOGIN ROUTE
router.post(
  '/login',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('Invalid email format'),
    body('password').isString().notEmpty().withMessage('Password is required'),
  ],
  validate,
  login,
);

// REGISTER ROUTE
router.post(
  '/register',
  authLimiter,
  [
    body('email').isEmail().normalizeEmail().withMessage('Invalid email format'),
    body('password')
      .isString()
      .isLength({ min: 8 })
      .withMessage('Password must be at least 8 characters')
      .matches(/^(?=.*[a-zA-Z])(?=.*[0-9])/)
      .withMessage('Password must contain at least one letter and one number'),
    body('fullName')
      .trim()
      .escape()
      .notEmpty()
      .isLength({ max: 100 })
      .withMessage('Full name is required and must be at most 100 characters'),
    body('phone').optional().trim().escape(),
  ],
  validate,
  register,
);

router.get('/me', requireAuth, me);
router.get('/users', requireAuth, requireRole('admin'), getAllUsers);

module.exports = router;
