const idempotencyStore = require("../services/idempotencyStore");

async function idempotency(req, res, next) {
  const key = req.get("Idempotency-Key");
  if (!key) return next();
  if (key.length > 255 || !/^[\x21-\x7E]+$/.test(key)) {
    return res.status(400).json({ success: false, error: "A valid Idempotency-Key header is required" });
  }

  const endpoint = `${req.baseUrl}${req.path}`;
  const requestHash = idempotencyStore.createRequestHash(req);
  try {
    const result = await idempotencyStore.begin(req.user.sub, key, endpoint, requestHash);
    if (result.state === "conflict") {
      return res.status(409).json({ success: false, error: "Idempotency key used with a different request" });
    }
    if (result.state === "processing") {
      return res.status(409).json({ success: false, error: "Request with this idempotency key is still processing" });
    }
    if (result.state === "replay") {
      return res.status(result.status).set("Idempotent-Replayed", "true").json(result.body);
    }
  } catch (error) {
    return next(error);
  }

  const sendJson = res.json.bind(res);
  res.json = (body) => {
    const status = res.statusCode;
    const persist = status >= 500
      ? idempotencyStore.remove(req.user.sub, key, endpoint)
      : idempotencyStore.complete(req.user.sub, key, endpoint, status, body);
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
