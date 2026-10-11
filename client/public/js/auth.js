/**
 * payNEXT Authentication State Manager
 * Handles localStorage token management, user session caching, and auth guards.
 */

const Auth = {
  TOKEN_KEY: 'paynext_token',
  USER_KEY: 'paynext_user',

  /**
   * Get the current JWT token from localStorage
   * @returns {string|null}
   */
  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  /**
   * Get the cached user profile
   * @returns {object|null}
   */
  getUser() {
    try {
      const data = localStorage.getItem(this.USER_KEY);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error('Failed to parse cached user:', e);
      return null;
    }
  },

  /**
   * Store token and user profile in localStorage
   * @param {string} token
   * @param {object} user
   */
  setSession(token, user) {
    if (token) {
      localStorage.setItem(this.TOKEN_KEY, token);
    }
    if (user) {
      localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    }
    window.dispatchEvent(new CustomEvent('auth:change', { detail: { isAuthenticated: true, user } }));
  },

  /**
   * Clear session from localStorage
   */
  clearSession() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    window.dispatchEvent(new CustomEvent('auth:change', { detail: { isAuthenticated: false, user: null } }));
  },

  /**
   * Check if user is currently authenticated
   * @returns {boolean}
   */
  isAuthenticated() {
    return !!this.getToken();
  },

  /**
   * Log out current user and redirect to login
   */
  logout() {
    this.clearSession();
    window.location.hash = '#/login';
  },

  /**
   * Parse error message from API response (supports standard string error or express-validator errors array)
   * @param {object} res
   * @returns {string}
   */
  formatError(res) {
    if (!res) return 'An unexpected error occurred.';
    if (res.error) return res.error;
    if (res.message && typeof res.message === 'string') return res.message;
    if (Array.isArray(res.errors) && res.errors.length > 0) {
      return res.errors.map(err => err.msg || err.message || JSON.stringify(err)).join(', ');
    }
    return 'Operation failed. Please try again.';
  }
};

window.Auth = Auth;
