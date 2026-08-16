const express = require("express");
const router = express.Router();
const moneyController = require("../controllers/moneyController");
const { requireAuth } = require("../middleware/auth");

// Note: top-up and withdraw are on the wallet router, but sendMoney is here
router.post("/", requireAuth, moneyController.sendMoney);

module.exports = router;