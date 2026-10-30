/**
 * payNEXT Authentication State Manager
 * Handles localStorage token management, user session caching, and auth guards.
 */

const Auth = {
  TOKEN_KEY: "paynext_token",
  USER_KEY: "paynext_user",

  /**
   * Get the current JWT token from localStorage
   * @returns {string|null}
   */
  getToken() {
    return localStorage.getItem(this.TOKEN_KEY);
  },

  /**
   * Save JWT token to localStorage
   * @param {string|null} token
   */
  saveToken(token) {
    if (token) {
      localStorage.setItem(this.TOKEN_KEY, token);
    } else {
      localStorage.removeItem(this.TOKEN_KEY);
    }
  },

  /**
   * Clear JWT token and cached user session
   */
  clearToken() {
    localStorage.removeItem(this.TOKEN_KEY);
    localStorage.removeItem(this.USER_KEY);
    localStorage.removeItem("paynext_wallet");
    window.dispatchEvent(
      new CustomEvent("auth:change", {
        detail: { isAuthenticated: false, user: null },
      })
    );
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
      console.error("Failed to parse cached user:", e);
      return null;
    }
  },

  /**
   * Save user profile to localStorage
   * @param {object|null} user
   */
  saveUser(user) {
    if (user) {
      localStorage.setItem(this.USER_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(this.USER_KEY);
    }
  },

  /**
   * Store token and user in session
   * @param {string} token
   * @param {object} user
   */
  setSession(token, user) {
    this.saveToken(token);
    this.saveUser(user);
    window.dispatchEvent(
      new CustomEvent("auth:change", {
        detail: { isAuthenticated: true, user },
      })
    );
  },

  /**
   * Check if user is currently authenticated
   * @returns {boolean}
   */
  isAuthenticated() {
    return Boolean(this.getToken());
  },

  /**
   * Alias for isAuthenticated()
   * @returns {boolean}
   */
  isLoggedIn() {
    return this.isAuthenticated();
  },

  /**
   * Log in user with email and password
   * @param {string} email
   * @param {string} password
   * @returns {Promise<object>}
   */
  async login(email, password) {
    const data = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    if (!data?.token) {
      throw new Error("Login succeeded but no token was returned.");
    }

    this.setSession(data.token, data.user);
    return data;
  },

  /**
   * Register new user
   * @param {string} name
   * @param {string} email
   * @param {string} password
   * @param {string} [phone]
   * @returns {Promise<object>}
   */
  async register(name, email, password, phone) {
    const body = {
      fullName: name,
      email,
      password,
    };
    if (phone) {
      body.phone = phone;
    }

    const data = await apiRequest("/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (data?.token) {
      this.setSession(data.token, data.user);
    }

    return data;
  },

  /**
   * Fetch current authenticated user from backend API
   * @returns {Promise<object>}
   */
  async fetchMe() {
    const user = await apiRequest("/auth/me");
    if (user) {
      this.saveUser(user);
      window.dispatchEvent(
        new CustomEvent("auth:change", {
          detail: { isAuthenticated: true, user },
        })
      );
    }
    return user;
  },

  /**
   * Log out current user and redirect to login
   */
  logout() {
    this.clearToken();
    window.location.hash = "#/login";
  },
};

window.Auth = Auth;
