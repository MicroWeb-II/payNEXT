const express = require("express");
const router = express.Router();
const transactionController = require("../controllers/transactionController");
const { requireAuth } = require("../middleware/auth");

router.get("/", requireAuth, transactionController.getHistory);

module.exports = router;
