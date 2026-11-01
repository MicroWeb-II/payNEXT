const logger = require('../observability/logger');

/**
 * Final error handler. Client errors carry their message; anything else is
 * logged with the request ID and returned as a generic 500 so internals never
 * leak to callers.
 */
// eslint-disable-next-line no-unused-vars
module.exports = (err, req, res, next) => {
  let status = Number.isInteger(err.status) ? err.status : 500;
  let message = err.message;

  if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON request body';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    message = 'Request body is too large';
  }

  const log = req.log || logger;
  if (status >= 500) {
    log.error({ err, requestId: req.id }, 'Unhandled error');
  } else {
    log.debug({ err: { message: err.message, status } }, 'Client error');
  }

  if (res.headersSent) return undefined;
  return res.status(status).json({
    success: false,
    error: status >= 500 ? 'Internal server error' : message,
    requestId: req.id,
  });
};
