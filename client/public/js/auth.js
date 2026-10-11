// Relative URL: Caddy routes /api/* to the Node backend, so this works
// locally and in production without CORS or hardcoded hosts.
const API_BASE_URL = "/api/v1";

async function apiRequest(endpoint, options = {}) {
  const token = Auth.getToken();

  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...options.headers,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    if (response.status === 401) {
      Auth.clearToken();
    }

    // Validation failures come back as { success: false, errors: [{ msg }] }.
    // Other errors may be { error: "text" } or { message: "text" }.
    const validation = Array.isArray(payload?.errors)
      ? payload.errors.map((e) => e.msg).join(" ")
      : "";
    const err = payload?.error;
    const message =
      validation ||
      (typeof err === "string" ? err : err?.message) ||
      payload?.message ||
      `Request failed (${response.status})`;

    throw new Error(message);
  }

  // The backend wraps successful responses as { data: ... }.
  // Unwrap once here so every caller gets the data directly.
  return payload && "data" in payload ? payload.data : payload;
}
