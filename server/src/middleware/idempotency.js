const idempotencyStore = require('../services/idempotencyStore');

const KEY_PATTERN = /^[\x21-\x7E]{8,255}$/;

/**
 * Idempotency for POST money-movement endpoints.
 *
 * Must run after `requireAuth` (keys are scoped per user). When the
 * `Idempotency-Key` header is present the first response is stored and
 * replayed for identical retries; 5xx responses release the key so a retry
 * can succeed. Mount with `idempotency.required` to reject requests that omit
 * the header.
 */
function createIdempotencyMiddleware({ required = false } = {}) {
  return async function idempotency(req, res, next) {
    const key = req.get('Idempotency-Key');
    if (!key) {
      if (required) {
        return res.status(400).json({ success: false, error: 'Idempotency-Key header is required' });
      }
      return next();
    }
    if (!KEY_PATTERN.test(key)) {
      return res.status(400).json({
        success: false,
        error: 'Idempotency-Key must be 8-255 printable ASCII characters',
      });
    }

    const userId = req.user.sub;
    const endpoint = `${req.baseUrl}${req.path}`;
    const requestHash = idempotencyStore.createRequestHash(req);

    let claim;
    try {
      claim = await idempotencyStore.begin(userId, key, endpoint, requestHash);
    } catch (error) {
      return next(error);
    }

    if (claim.state === 'conflict') {
      return res.status(409).json({ success: false, error: 'Idempotency-Key was already used with a different request' });
    }
    if (claim.state === 'processing') {
      res.set('Retry-After', '1');
      return res.status(409).json({ success: false, error: 'A request with this Idempotency-Key is still being processed' });
    }
    if (claim.state === 'replay') {
      return res.status(claim.status).set('Idempotent-Replayed', 'true').json(claim.body);
    }

    const sendJson = res.json.bind(res);
    res.json = (body) => {
      res.json = sendJson;
      const persist = res.statusCode >= 500
        ? idempotencyStore.remove(userId, key, endpoint)
        : idempotencyStore.complete(userId, key, endpoint, res.statusCode, body);
      persist
        .catch((error) => req.log?.error({ err: error }, 'Failed to persist idempotent response'))
        .finally(() => sendJson(body));
      return res;
    };
    return next();
  };
}

const idempotency = createIdempotencyMiddleware();
idempotency.required = createIdempotencyMiddleware({ required: true });
idempotency.create = createIdempotencyMiddleware;

module.exports = idempotency;
