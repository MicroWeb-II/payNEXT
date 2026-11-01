/**
 * payNEXT API layer: the only place that performs HTTP requests.
 *
 * - Relative base URL: Caddy routes /api/* to the Node API on the same origin.
 * - Adds the Bearer token, and on a 401 refreshes the session once and retries.
 * - Adds an Idempotency-Key to money-movement POSTs. The key is reused if the
 *   same request is retried after a network failure, so a retry can never
 *   move money twice.
 * - Unwraps { data } on success; throws an Error with `status` on failure.
 */
const API_BASE_URL = (typeof window !== "undefined" && window.API_BASE_URL) || "/api/v1";

const MONEY_MOVEMENT_PATTERNS = [
  /^\/wallets\/[^/]+\/(?:top-up|withdraw)$/,
  /^\/transfers$/,
  /^\/merchants\/pay$/,
  /^\/payment-requests\/[^/]+\/approve$/,
];

function isMoneyMovement(method, endpoint) {
  return method === "POST" && MONEY_MOVEMENT_PATTERNS.some((pattern) => pattern.test(endpoint));
}

function newIdempotencyKey() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

function idempotencyStorageKey(endpoint, body) {
  return `paynext_idem:${endpoint}:${body || ""}`;
}

function errorMessage(payload, status) {
  if (payload && Array.isArray(payload.errors) && payload.errors.length) {
    return payload.errors.map((e) => e.msg || e.message).filter(Boolean).join(" ");
  }
  if (payload && typeof payload.error === "string") return payload.error;
  if (payload && typeof payload.message === "string") return payload.message;
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  if (status >= 500) return "The server ran into a problem. Please try again.";
  return `Request failed (${status})`;
}

async function apiRequest(endpoint, options = {}) {
  const { skipAuthRefresh = false, silent = false, _retried = false, ...fetchOptions } = options;
  const method = (fetchOptions.method || "GET").toUpperCase();
  const headers = {
    Accept: "application/json",
    ...(fetchOptions.body ? { "Content-Type": "application/json" } : {}),
    ...fetchOptions.headers,
  };

  const token = typeof Auth !== "undefined" ? Auth.getToken() : null;
  if (token) headers.Authorization = `Bearer ${token}`;

  let idemStorageKey = null;
  if (isMoneyMovement(method, endpoint) && !headers["Idempotency-Key"]) {
    idemStorageKey = idempotencyStorageKey(endpoint, fetchOptions.body);
    let key = null;
    try {
      key = sessionStorage.getItem(idemStorageKey);
    } catch {
      key = null;
    }
    if (!key) {
      key = newIdempotencyKey();
      try {
        sessionStorage.setItem(idemStorageKey, key);
      } catch {
        /* ignore */
      }
    }
    headers["Idempotency-Key"] = key;
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...fetchOptions,
      method,
      headers,
      credentials: "same-origin",
    });
  } catch {
    // Network failure: keep the idempotency key so a retry is safe.
    const message = "Unable to reach payNEXT. Please check your connection and try again.";
    if (!silent && typeof showToast === "function") showToast(message, "error");
    const error = new Error(message);
    error.status = 0;
    throw error;
  }

  // The server has decided this request; a new attempt should get a new key.
  // A 409 "still processing" keeps the key so the retry is matched to it.
  if (idemStorageKey && response.status !== 409) {
    try {
      sessionStorage.removeItem(idemStorageKey);
    } catch {
      /* ignore */
    }
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json") ? await response.json().catch(() => null) : null;

  if (response.status === 401 && !skipAuthRefresh && !_retried && typeof Auth !== "undefined") {
    const refreshed = await Auth.refresh();
    if (refreshed) return apiRequest(endpoint, { ...options, _retried: true });
    if (window.location.hash !== "#/login") window.location.hash = "#/login";
  }

  if (!response.ok) {
    const error = new Error(errorMessage(payload, response.status));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }

  return payload && Object.prototype.hasOwnProperty.call(payload, "data") ? payload.data : payload;
}

window.apiRequest = apiRequest;
