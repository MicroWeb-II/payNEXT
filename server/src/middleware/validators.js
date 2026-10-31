const { param, body, query } = require('express-validator');

const uuidParam = (name = 'id') =>
  param(name)
    .trim()
    .isUUID()
    .withMessage(`${name} must be a valid UUID`);

/**
 * Amount validator: positive, max 2 decimal places, max $1,000,000
 */
const amount = (name = 'amount') =>
  body(name)
    .custom((value) => {
      const text = String(value);
      if (!/^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/.test(text) || !/[1-9]/.test(text)) return false;
      const [whole, fraction = ""] = text.split(".");
      return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0")) <= 100000000n;
    })
    .withMessage(`${name} must be positive, at most 1,000,000, and have at most 2 decimal places`);

const walletId = (name) =>
  body(name)
    .trim()
    .isUUID()
    .withMessage(`${name} must be a valid UUID`);

/**
 * Currency validator: ISO 4217 uppercase 3-letter code, restricted to supported values
 */
const currency = body('currency')
  .optional()
  .trim()
  .toUpperCase()
  .isIn(['USD', 'BDT'])
  .withMessage('Invalid currency — supported: USD, BDT');

const note = body('note')
  .optional()
  .trim()
  .isLength({ max: 500 })
  .withMessage('Note must be at most 500 characters');

const description = body('description')
  .optional()
  .trim()
  .isLength({ max: 500 })
  .withMessage('Description must be at most 500 characters');

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
