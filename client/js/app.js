const Auth = {
  getToken() {
    return localStorage.getItem("token");
  },

  saveToken(token) {
    localStorage.setItem("token", token);
  },

  getUser() {
    try {
      return JSON.parse(localStorage.getItem("user"));
    } catch {
      return null;
    }
  },

  saveUser(user) {
    localStorage.setItem("user", JSON.stringify(user));
  },

  clearToken() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  },

  isLoggedIn() {
    return Boolean(this.getToken());
  },

  // apiRequest already unwrapped { data }, so `data` is { token, user }.
  async login(email, password) {
    const data = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    if (!data?.token) {
      throw new Error("The server did not return a login token.");
    }

    this.saveToken(data.token);
    if (data.user) this.saveUser(data.user);
    return data;
  },

  // Backend expects fullName (not name). phone is optional.
  async register(fullName, email, password, phone) {
    const body = { fullName, email, password };
    if (phone) body.phone = phone;

    const data = await apiRequest("/auth/register", {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (data?.token) {
      this.saveToken(data.token);
      if (data.user) this.saveUser(data.user);
    }

    return data;
  },

  logout() {
    this.clearToken();
    window.location.hash = "#/login";
  },
};
