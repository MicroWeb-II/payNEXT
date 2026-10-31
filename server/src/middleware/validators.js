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
    .isFloat({ gt: 0, max: 1_000_000 })
    .withMessage(`${name} must be greater than 0 and at most 1,000,000`)
    .custom((val) => {
      const str = String(val);
      const parts = str.split('.');
      if (parts[1] && parts[1].length > 2) {
        throw new Error(`${name} must have at most 2 decimal places`);
      }
      return true;
    });

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
