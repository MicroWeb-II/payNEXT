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
  ],
  validate,
  transactionController.getHistory
);

module.exports = router;