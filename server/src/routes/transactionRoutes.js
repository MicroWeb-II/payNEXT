const express = require("express");
const router = express.Router();

const transactionController = require("../controllers/transactionController");
const { requireAuth } = require("../middleware/auth");
const validate = require("../middleware/validate");
const { query } = require("../middleware/validators");

router.get(
  "/",
  requireAuth,
  [
    query("limit")
      .optional()
      .isInt({ min: 1, max: 100 })
      .toInt()
      .withMessage("Limit must be between 1 and 100"),

    query("offset")
      .optional()
      .isInt({ min: 0 })
      .toInt()
      .withMessage("Offset must be a non-negative integer"),
    query("type")
      .optional()
      .isIn(["top_up", "withdrawal", "transfer_in", "transfer_out", "request_in", "request_out"])
      .withMessage("Invalid transaction type"),
  ],
  validate,
  transactionController.getHistory
);

module.exports = router;