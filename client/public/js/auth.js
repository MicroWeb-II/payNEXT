/**
 * payNEXT authentication state.
 *
 * - The short-lived access token is kept in sessionStorage (per tab, cleared
 *   when the tab closes) and sent as a Bearer token by api.js.
 * - The long-lived refresh token lives in an httpOnly, SameSite=Strict cookie
 *   that JavaScript cannot read. Auth.refresh() exchanges it for a new access
 *   token; the server rotates the cookie on every use.
 * - All HTTP goes through the single API layer in api.js (window.apiRequest).
 */
const Auth = {
  TOKEN_KEY: "paynext_token",
  USER_KEY: "paynext_user",
  SESSION_HINT_KEY: "paynext_has_session",
  _refreshing: null,

  getToken() {
    try {
      return sessionStorage.getItem(this.TOKEN_KEY);
    } catch {
      return null;
    }
  },

  getUser() {
    try {
      const raw = sessionStorage.getItem(this.USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  isAuthenticated() {
    return Boolean(this.getToken());
  },

  _emit() {
    window.dispatchEvent(
      new CustomEvent("auth:change", {
        detail: { isAuthenticated: this.isAuthenticated(), user: this.getUser() },
      })
    );
  },

  _store(token, user) {
    try {
      if (token) sessionStorage.setItem(this.TOKEN_KEY, token);
      if (user) sessionStorage.setItem(this.USER_KEY, JSON.stringify(user));
      // Non-sensitive hint that a refresh cookie probably exists, so a new tab
      // knows to try restoring the session.
      localStorage.setItem(this.SESSION_HINT_KEY, "1");
    } catch {
      /* storage unavailable (private mode): the session lasts for this page */
    }
    this._emit();
  },

  clearSession() {
    try {
      sessionStorage.removeItem(this.TOKEN_KEY);
      sessionStorage.removeItem(this.USER_KEY);
      localStorage.removeItem(this.SESSION_HINT_KEY);
    } catch {
      /* ignore */
    }
    this._emit();
  },

  async login(email, password) {
    const data = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
      skipAuthRefresh: true,
    });
    if (!data || !data.token) throw new Error("Login succeeded but no token was returned.");
    this._store(data.token, data.user);
    return data;
  },

  async register(name, email, password, phone) {
    const body = { fullName: name, email, password };
    if (phone) body.phone = phone;
    const data = await apiRequest("/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
      skipAuthRefresh: true,
    });
    if (data && data.token) this._store(data.token, data.user);
    return data;
  },

  /** Fresh profile from the server (never the cached copy). */
  async fetchMe() {
    const user = await apiRequest("/auth/me");
    if (user) this._store(null, user);
    return user;
  },

  /**
   * Exchange the refresh cookie for a new access token. Concurrent callers
   * share one request so the rotated cookie is never presented twice.
   * Resolves to true when a new access token was obtained.
   */
  refresh() {
    if (!this._refreshing) {
      this._refreshing = apiRequest("/auth/refresh", { method: "POST", skipAuthRefresh: true, silent: true })
        .then((data) => {
          if (!data || !data.token) throw new Error("No token");
          this._store(data.token, data.user);
          return true;
        })
        .catch(() => {
          this.clearSession();
          return false;
        })
        .finally(() => {
          this._refreshing = null;
        });
    }
    return this._refreshing;
  },

  /** On page load: reuse this tab's token, or silently restore via the refresh cookie. */
  async restoreSession() {
    if (this.isAuthenticated()) return true;
    let hinted = false;
    try {
      hinted = localStorage.getItem(this.SESSION_HINT_KEY) === "1";
    } catch {
      hinted = false;
    }
    return hinted ? this.refresh() : false;
  },

  async logout() {
    try {
      await apiRequest("/auth/logout", { method: "POST", skipAuthRefresh: true, silent: true });
    } catch {
      /* the local session is cleared regardless */
    }
    this.clearSession();
    window.location.hash = "#/login";
  },
};

window.Auth = Auth;
