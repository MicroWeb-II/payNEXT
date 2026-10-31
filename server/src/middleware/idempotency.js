const idempotencyStore = require("../services/idempotencyStore");

async function idempotency(req, res, next) {
  const key = req.get("Idempotency-Key");
  if (!key) return next();
  if (key.length > 255) {
    return res.status(400).json({ success: false, error: "Idempotency-Key is too long" });
  }

  const requestHash = idempotencyStore.createRequestHash(req);
  try {
    const result = await idempotencyStore.begin(req.user.sub, key, requestHash);
    if (result.state === "conflict") {
      return res.status(409).json({ success: false, error: "Idempotency key used with a different request" });
    }
    if (result.state === "processing") {
      return res.status(409).json({ success: false, error: "Request with this idempotency key is still processing" });
    }
    if (result.state === "replay") {
      return res.status(result.status).json(result.body);
    }
  } catch (error) {
    return next(error);
  }

  const sendJson = res.json.bind(res);
  res.json = (body) => {
    const status = res.statusCode;
    const persist = status >= 500
      ? idempotencyStore.remove(req.user.sub, key)
      : idempotencyStore.complete(req.user.sub, key, status, body);
    return persist
      .then(() => sendJson(body))
      .catch((error) => {
        res.json = sendJson;
        next(error);
      });
  };
  return next();
}

module.exports = idempotency;