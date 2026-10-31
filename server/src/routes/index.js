// api/src/routes/index.js (Master Router)
const express = require("express");
const router = express.Router();

const authRoutes = require("./authRoutes");
const walletRoutes = require("./walletRoutes");
const moneyRoutes = require("./moneyRoutes");
const requestRoutes = require("./requestRoutes");
const transactionRoutes = require("./transactionRoutes");
const merchantRoutes = require("./merchantRoutes");
const pool = require("../config/db");

router.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      success: true,
      service: "paynext-api",
      time: new Date().toISOString(),
    });
  } catch (error) {
    res.status(503).json({ success: false, service: "paynext-api" });
  }
});

// Mount team routes
router.use("/auth", authRoutes);
router.use("/wallets", walletRoutes);
router.use("/transfers", moneyRoutes);
router.use("/payment-requests", requestRoutes);

// Mount your new routes
router.use("/history", transactionRoutes);
router.use("/merchants", merchantRoutes);

module.exports = router;
