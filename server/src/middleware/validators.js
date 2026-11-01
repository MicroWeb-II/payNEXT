/**
 * Reusable express-validator chains. Every route composes these so the same
 * input always gets the same rules. Money controllers re-validate amounts via
 * moneyService.normalizeAmount; middleware is never the only check.
 */
const { param, body, query } = require('express-validator');
const config = require('../config/env');

const TRANSACTION_TYPES = [
  'top_up',
  'withdrawal',
  'transfer_in',
  'transfer_out',
  'request_in',
  'request_out',
  'merchant_payment',
  'adjustment_credit',
  'adjustment_debit',
];
const PAYMENT_PROVIDERS = ['mock', 'bank_transfer', 'card'];
const WALLET_NUMBER_PATTERN = /^PAYNX-[0-9]{6}$/;
const AMOUNT_PATTERN = /^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/;
const PASSWORD_PATTERN = /^(?=.*[A-Za-z])(?=.*\d).+$/;
const PASSWORD_MIN = 8;
const PASSWORD_MAX_BYTES = 72; // bcrypt ignores input beyond 72 bytes
// Printable text without control characters.
const SAFE_TEXT = /^[^\p{Cc}]*$/u;

function isValidAmount(value) {
  if (typeof value !== 'string' && typeof value !== 'number') return false;
  const text = String(value).trim();
  if (!AMOUNT_PATTERN.test(text) || !/[1-9]/.test(text)) return false;
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0')) <= config.money.maxAmountCents;
}

const maxAmountLabel = () => (config.money.maxAmountCents / 100n).toLocaleString('en-US');

const uuidParam = (name = 'id') => param(name).trim().isUUID().withMessage(`${name} must be a valid UUID`);

const uuidBody = (name, { optional = false } = {}) => {
  const chain = body(name);
  return (optional ? chain.optional() : chain)
    .isString()
    .withMessage(`${name} must be a valid UUID`)
    .bail()
    .trim()
    .isUUID()
    .withMessage(`${name} must be a valid UUID`);
};

const walletId = (name) => uuidBody(name);

const amount = (name = 'amount') =>
  body(name)
    .custom(isValidAmount)
    .withMessage(() => `${name} must be positive, at most ${maxAmountLabel()}, with at most 2 decimal places`);

const currency = body('currency')
  .optional()
  .isString()
  .bail()
  .trim()
  .toUpperCase()
  .isIn(config.money.supportedCurrencies)
  .withMessage(`currency must be one of: ${config.money.supportedCurrencies.join(', ')}`);

const email = (name = 'email') =>
  body(name)
    .isString()
    .withMessage(`${name} must be a valid email address`)
    .bail()
    .trim()
    .toLowerCase()
    .isLength({ max: 254 })
    .withMessage(`${name} must be at most 254 characters`)
    .bail()
    .isEmail()
    .withMessage(`${name} must be a valid email address`);

const newPassword = (name = 'password') =>
  body(name)
    .isString()
    .withMessage('Password is required')
    .bail()
    .isLength({ min: PASSWORD_MIN })
    .withMessage(`Password must be at least ${PASSWORD_MIN} characters`)
    .bail()
    .custom((value) => Buffer.byteLength(value, 'utf8') <= PASSWORD_MAX_BYTES)
    .withMessage(`Password must be at most ${PASSWORD_MAX_BYTES} bytes`)
    .bail()
    .matches(PASSWORD_PATTERN)
    .withMessage('Password must contain at least one letter and one number');

const loginPassword = body('password')
  .isString()
  .withMessage('Password is required')
  .bail()
  .isLength({ min: 1, max: 256 })
  .withMessage('Password is required');

const text = (name, { max, min = 0, optional = true }) => {
  const chain = optional ? body(name).optional({ values: 'null' }) : body(name);
  return chain
    .isString()
    .withMessage(`${name} must be text`)
    .bail()
    .trim()
    .isLength({ min, max })
    .withMessage(min ? `${name} must be ${min}-${max} characters` : `${name} must be at most ${max} characters`)
    .bail()
    .matches(SAFE_TEXT)
    .withMessage(`${name} contains invalid characters`);
};

const fullName = text('fullName', { min: 1, max: 100, optional: false });

const phone = body('phone')
  .optional({ values: 'falsy' })
  .isString()
  .bail()
  .trim()
  .matches(/^\+?[0-9 ()-]{7,20}$/)
  .withMessage('phone must be 7-20 digits and may include + ( ) - and spaces');

const note = text('note', { max: 500 });
const description = text('description', { max: 500 });
const reason = (optional = false) => text('reason', { min: 3, max: 500, optional });

const provider = body('provider')
  .optional()
  .isString()
  .bail()
  .trim()
  .isIn(PAYMENT_PROVIDERS)
  .withMessage(`provider must be one of: ${PAYMENT_PROVIDERS.join(', ')}`);

const walletNumber = (name) =>
  body(name)
    .isString()
    .withMessage('Invalid wallet number')
    .bail()
    .trim()
    .toUpperCase()
    .matches(WALLET_NUMBER_PATTERN)
    .withMessage('Wallet number must look like PAYNX-123456');

const pagination = [
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100').toInt(),
  query('offset').optional().isInt({ min: 0, max: 100000 }).withMessage('offset must be a non-negative integer').toInt(),
];

const transactionType = query('type')
  .optional()
  .isIn(TRANSACTION_TYPES)
  .withMessage(`type must be one of: ${TRANSACTION_TYPES.join(', ')}`);

module.exports = {
  TRANSACTION_TYPES,
  PAYMENT_PROVIDERS,
  WALLET_NUMBER_PATTERN,
  PASSWORD_PATTERN,
  isValidAmount,
  uuidParam,
  uuidBody,
  walletId,
  amount,
  currency,
  email,
  newPassword,
  loginPassword,
  text,
  fullName,
  phone,
  note,
  description,
  reason,
  provider,
  walletNumber,
  pagination,
  transactionType,
  body,
  query,
  param,
};
