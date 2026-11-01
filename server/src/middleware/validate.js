const { validationResult, matchedData } = require('express-validator');

/**
 * Reject the request with 400 if any validator failed. Error entries carry the
 * field and message only, never the submitted value (it may be a password).
 */
function validate(req, res, next) {
  const result = validationResult(req);
  if (!result.isEmpty()) {
    const errors = result.array({ onlyFirstError: true }).map((error) => ({
      field: error.path,
      location: error.location,
      msg: error.msg,
    }));
    return res.status(400).json({ success: false, error: errors[0].msg, errors });
  }
  req.validated = matchedData(req, { includeOptionals: false });
  return next();
}

module.exports = validate;
