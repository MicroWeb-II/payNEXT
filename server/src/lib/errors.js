/** Error type for expected, client-facing failures. */
class ApiError extends Error {
  constructor(message, status = 400, code) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    if (code) this.code = code;
    this.expose = true;
  }
}

module.exports = { ApiError };
