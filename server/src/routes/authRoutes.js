const express = require("express");
const router = express.Router();
const authLimiter = require("../middleware/rateLimiter");
const { login, register, me } = require("../controllers/authController");

router.post("/login", authLimiter, login);
router.post("/register", authLimiter, register);

module.exports = router;
