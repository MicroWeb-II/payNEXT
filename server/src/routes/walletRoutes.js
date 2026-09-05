const express = require("express");
const router = express.Router();
const walletController = require("../controllers/walletController");
const moneyController = require("../controllers/moneyController");
const { requireAuth, requireRole } = require("../middleware/auth");

router.post("/", requireAuth, walletController.createWallet);
router.get("/", requireAuth, walletController.myWallets);
router.get("/:id", requireAuth, walletController.getWallet);
router.get("/:id/balance", requireAuth, walletController.getBalance);
router.get("/:id/transactions", requireAuth, walletController.getTransactions);

router.post("/:id/top-up", requireAuth, requireRole("admin"), moneyController.topUp);
router.post("/:id/withdraw", requireAuth, moneyController.withdraw);

module.exports = router;
