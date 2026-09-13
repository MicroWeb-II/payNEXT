const { param, body, query } = require("express-validator");

const uuidParam = (name = "id") =>
  param(name)
    .trim()
    .isUUID()
    .withMessage(`${name} must be a valid UUID`);

const amount = (name = "amount") =>
  body(name)
    .isFloat({ gt: 0 })
    .withMessage(`${name} must be greater than 0`);

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