// api/src/routes/index.js (Master Router)
const express = require("express");
const router = express.Router();

const authRoutes = require("./authRoutes");
const walletRoutes = require("./walletRoutes");
const moneyRoutes = require("./moneyRoutes");
const requestRoutes = require("./requestRoutes");

router.get("/health", (req, res) =>
  res.json({
    success: true,
    service: "paynext-api",
    time: new Date().toISOString(),
  }),
);

// Mount team routes
router.use("/auth", authRoutes);
router.use("/wallets", walletRoutes);
router.use("/transfers", moneyRoutes);
router.use("/payment-requests", requestRoutes);

module.exports = router;
