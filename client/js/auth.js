
const Auth = {
  getToken() {
    return localStorage.getItem("token");
  },

  saveToken(token) {
    localStorage.setItem("token", token);
  },

  clearToken() {
    localStorage.removeItem("token");
  },

  isLoggedIn() {
    return Boolean(this.getToken());
  },

  async login(email, password) {
    const data = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    if (!data?.token) {
      throw new Error("The server did not return a login token.");
    }

    this.saveToken(data.token);
    return data;
  },

  async register(name, email, password) {
    const data = await apiRequest("/auth/register", {
      method: "POST",
      body: JSON.stringify({ name, email, password }),
    });

    // Some APIs automatically log in new users.
    // Others require the user to log in separately.
    if (data?.token) {
      this.saveToken(data.token);
    }

    return data;
  },

  logout() {
    this.clearToken();
    window.location.hash = "#/login";
  },

  async getCurrentUser() {
    return apiRequest("/auth/me");
  },
};
