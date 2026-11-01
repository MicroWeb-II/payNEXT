const { randomUUID } = require('crypto');
const logger = require('../observability/logger');
const { observeRequest } = require('../observability/metrics');

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._-]{8,64}$/;

/**
 * Normalised route template for logs and metrics. Using the matched Express
 * pattern (e.g. /api/v1/wallets/:id) keeps metric label cardinality bounded.
 */
function routeTemplate(req) {
  if (req.route && req.route.path) return `${req.baseUrl || ''}${req.route.path}`;
  return 'unmatched';
}

/**
 * Assigns a request ID, exposes a request-scoped logger on `req.log`, and
 * emits one structured access log line plus metrics when the response ends.
 */
function requestContext(req, res, next) {
  const incoming = req.get('X-Request-Id');
  req.id = incoming && REQUEST_ID_PATTERN.test(incoming) ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  req.log = logger.child({ requestId: req.id });

  const startedAt = process.hrtime.bigint();
  let logged = false;

  const finish = () => {
    if (logged) return;
    logged = true;
    const durationSeconds = Number(process.hrtime.bigint() - startedAt) / 1e9;
    const route = routeTemplate(req);
    const status = res.headersSent ? res.statusCode : 499;

    observeRequest({ method: req.method, route, status, durationSeconds });

    if (req.originalUrl === '/metrics') return;
    const entry = {
      requestId: req.id,
      userId: req.user?.sub || null,
      method: req.method,
      endpoint: route,
      path: req.originalUrl.split('?')[0],
      statusCode: status,
      latencyMs: Math.round(durationSeconds * 1000 * 100) / 100,
      ip: req.ip,
    };
    const level = status >= 500 ? 'error' : status >= 400 ? 'warn' : 'info';
    logger[level](entry, 'request completed');
  };

  res.on('finish', finish);
  res.on('close', finish);
  next();
}

module.exports = requestContext;
module.exports.routeTemplate = routeTemplate;
