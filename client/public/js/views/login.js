/**
 * payNEXT Login View Controller
 */

function renderLogin() {
  return `
    <div class="auth-container">
      <div class="card">
        <div class="auth-header">
          <h2>Welcome Back</h2>
          <p>Sign in to your payNEXT digital wallet</p>
        </div>

        <div id="login-error" class="form-error-banner" style="display: none;"></div>

        <form id="login-form">
          <div class="form-group">
            <label for="login-email">Email Address</label>
            <input
              type="email"
              id="login-email"
              name="email"
              class="form-control"
              placeholder="name@example.com"
              required
              autocomplete="email"
            />
          </div>

          <div class="form-group">
            <label for="login-password">Password</label>
            <input
              type="password"
              id="login-password"
              name="password"
              class="form-control"
              placeholder="••••••••"
              required
              autocomplete="current-password"
            />
          </div>

          <button type="submit" class="btn btn-primary" id="login-submit-btn" style="width: 100%; margin-top: 8px;">
            Sign In
          </button>
        </form>

        <div class="auth-footer-text">
          Don't have an account? <a href="#/register">Create Account</a>
        </div>
      </div>
    </div>
  `;
}

function initLogin() {
  const form = document.getElementById("login-form");
  if (!form) return;

  // Clear previous errors when initializing
  const errorBox = document.getElementById("login-error");
  if (errorBox) {
    errorBox.style.display = "none";
    errorBox.textContent = "";
  }

  // Prevent multiple bindings
  if (form.dataset.bound === "true") return;
  form.dataset.bound = "true";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitBtn = document.getElementById("login-submit-btn") || form.querySelector('button[type="submit"]');
    const emailInput = document.getElementById("login-email") || form.elements.email;
    const passwordInput = document.getElementById("login-password") || form.elements.password;

    const email = emailInput ? emailInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value : "";

    if (!email || !password) {
      if (errorBox) {
        errorBox.textContent = "Please enter both email and password.";
        errorBox.style.display = "block";
      }
      if (typeof showToast === "function") {
        showToast("Please enter both email and password.", "warning");
      }
      return;
    }

    if (errorBox) {
      errorBox.style.display = "none";
      errorBox.textContent = "";
    }

    if (typeof setButtonLoading === "function") {
      setButtonLoading(submitBtn, true, "Sign In", "Signing in...");
    } else if (submitBtn) {
      submitBtn.disabled = true;
    }

    try {
      await Auth.login(email, password);
      if (typeof showToast === "function") {
        showToast("Welcome back! Login successful.", "success");
      }
      form.reset();
      window.location.hash = "#/dashboard";
    } catch (error) {
      const msg = error.message || "Login failed. Please check your credentials.";
      if (errorBox) {
        errorBox.textContent = msg;
        errorBox.style.display = "block";
      }
      if (typeof showToast === "function") {
        showToast(msg, "error");
      }
    } finally {
      if (typeof setButtonLoading === "function") {
        setButtonLoading(submitBtn, false, "Sign In");
      } else if (submitBtn) {
        submitBtn.disabled = false;
      }
    }
  });
}

window.renderLogin = renderLogin;
window.initLogin = initLogin;
