const express = require("express");
const router = express.Router();
const { body, validationResult } = require("express-validator");

const authLimiter = require("../middleware/rateLimiter");
const { login, register, me } = require("../controllers/authController");

// Helper middleware to check for validation errors
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    // If there are errors, return a 400 Bad Request with the details
    return res.status(400).json({ success: false, errors: errors.array() });
  }
  next();
};

// LOGIN ROUTE with sanitization
router.post(
  "/login",
  authLimiter,
  [
    body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Invalid email format"),
    body("password").trim().notEmpty().withMessage("Password is required"),
  ],
  validate,
  login,
);

// REGISTER ROUTE with sanitization
router.post(
  "/register",
  authLimiter,
  [
    body("email")
      .isEmail()
      .normalizeEmail()
      .withMessage("Invalid email format"),
    body("password")
      .trim()
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
    body("fullName")
      .trim()
      .escape()
      .notEmpty()
      .withMessage("Full name is required"),
    body("phone").optional().trim().escape(),
  ],
  validate,
  register,
);

module.exports = router;
