const express = require("express");
const router = express.Router();
const merchantController = require("../controllers/merchantController");
const { requireAuth } = require("../middleware/auth");

// CRUD Routes for Merchants
router.post("/", requireAuth, merchantController.createMerchant);
router.get("/", requireAuth, merchantController.getAllMerchants);
router.get("/:id", requireAuth, merchantController.getMerchantById);
router.put("/:id", requireAuth, merchantController.updateMerchant);
router.delete("/:id", requireAuth, merchantController.deleteMerchant);

// Action Route
router.post("/pay", requireAuth, merchantController.payMerchant);

module.exports = router;
