/**
 * payNEXT Centralized API Layer
 * Relative URL: Caddy/Nginx reverse proxy routes /api/* to the Node backend.
 */

const API_BASE_URL =
  (typeof window !== "undefined" && window.API_BASE_URL) || "/api/v1";

async function apiRequest(endpoint, options = {}) {
  const token =
    typeof Auth !== "undefined" && typeof Auth.getToken === "function"
      ? Auth.getToken()
      : null;

  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...options.headers,
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${endpoint}`, {
      ...options,
      headers,
    });
  } catch (networkError) {
    const errorMsg = "Unable to connect to payNEXT server. Please check your network.";
    if (typeof showToast === "function") {
      showToast(errorMsg, "error");
    }
    throw new Error(errorMsg);
  }

  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json()
    : null;

  if (!response.ok) {
    if (response.status === 401 && typeof Auth !== "undefined" && typeof Auth.clearToken === "function") {
      Auth.clearToken();
    }

    // Validation failures come back as { success: false, errors: [{ msg }] }.
    // Other errors may be { error: "text" } or { message: "text" }.
    const validation = Array.isArray(payload?.errors)
      ? payload.errors.map((e) => e.msg || e.message).join(" ")
      : "";
    const err = payload?.error;
    const message =
      validation ||
      (typeof err === "string" ? err : err?.message) ||
      payload?.message ||
      `Request failed (${response.status})`;

    const error = new Error(message);
    error.status = response.status;
    error.payload = payload;

    throw error;
  }

  // The backend wraps successful responses as { data: ... }.
  // Unwrap once here so every caller gets the data directly.
  return payload && "data" in payload ? payload.data : payload;
}

window.apiRequest = apiRequest;
