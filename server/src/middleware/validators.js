const { param, body, query } = require("express-validator");

const uuidParam = (name = "id") =>
  param(name)
    .trim()
    .isUUID()
    .withMessage(`${name} must be a valid UUID`);

const amount = (name = "amount") =>
  body(name)
    .custom((value) => {
      const text = String(value);
      return /^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(text) && /[1-9]/.test(text);
    })
    .withMessage(`${name} must be positive with at most 2 decimal places`);

const walletId = (name) =>
  body(name)
    .trim()
    .isUUID()
    .withMessage(`${name} must be a valid UUID`);

const currency = body("currency")
  .optional()
  .trim()
  .isIn(["USD", "BDT"])
  .withMessage("Invalid currency");

const note = body("note")
  .optional()
  .trim()
  .isLength({ max: 500 })
  .withMessage("Note must be at most 500 characters");

const description = body("description")
  .optional()
  .trim()
  .isLength({ max: 500 })
  .withMessage("Description must be at most 500 characters");

module.exports = {
  uuidParam,
  amount,
  walletId,
  currency,
  note,
  description,
  body,
  query,
};