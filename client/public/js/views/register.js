/**
 * payNEXT Register View Controller
 */

function renderRegister() {
  return `
    <div class="auth-container">
      <div class="card">
        <div class="auth-header">
          <h2>Create Account</h2>
          <p>Join payNEXT and activate your digital wallet</p>
        </div>

        <div id="register-error" class="form-error-banner" style="display: none;"></div>

        <form id="register-form">
          <div class="form-group">
            <label for="register-name">Full Name</label>
            <input
              type="text"
              id="register-name"
              name="fullName"
              class="form-control"
              placeholder="John Doe"
              required
              autocomplete="name"
            />
          </div>

          <div class="form-group">
            <label for="register-email">Email Address</label>
            <input
              type="email"
              id="register-email"
              name="email"
              class="form-control"
              placeholder="name@example.com"
              required
              autocomplete="email"
            />
          </div>

          <div class="form-group">
            <label for="register-password">Password</label>
            <input
              type="password"
              id="register-password"
              name="password"
              class="form-control"
              placeholder="At least 6 characters"
              required
              minlength="6"
              autocomplete="new-password"
            />
            <div class="form-hint">Must contain at least 6 characters</div>
          </div>

          <div class="form-group">
            <label for="register-phone">Phone Number (Optional)</label>
            <input
              type="tel"
              id="register-phone"
              name="phone"
              class="form-control"
              placeholder="+1 (555) 000-0000"
              autocomplete="tel"
            />
          </div>

          <button type="submit" class="btn btn-primary" id="register-submit-btn" style="width: 100%; margin-top: 8px;">
            Create Account
          </button>
        </form>

        <div class="auth-footer-text">
          Already have an account? <a href="#/login">Sign In</a>
        </div>
      </div>
    </div>
  `;
}

function initRegister() {
  const form = document.getElementById("register-form");
  if (!form) return;

  const errorBox = document.getElementById("register-error");
  if (errorBox) {
    errorBox.style.display = "none";
    errorBox.textContent = "";
  }

  // Prevent multiple bindings
  if (form.dataset.bound === "true") return;
  form.dataset.bound = "true";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const submitBtn = document.getElementById("register-submit-btn") || form.querySelector('button[type="submit"]');
    const nameInput = document.getElementById("register-name") || form.elements.fullName;
    const emailInput = document.getElementById("register-email") || form.elements.email;
    const passwordInput = document.getElementById("register-password") || form.elements.password;
    const phoneInput = document.getElementById("register-phone") || form.elements.phone;

    const fullName = nameInput ? nameInput.value.trim() : "";
    const email = emailInput ? emailInput.value.trim() : "";
    const password = passwordInput ? passwordInput.value : "";
    const phone = phoneInput ? phoneInput.value.trim() : "";

    if (!fullName || !email || !password) {
      const msg = "Please fill in all required fields.";
      if (errorBox) {
        errorBox.textContent = msg;
        errorBox.style.display = "block";
      }
      if (typeof showToast === "function") {
        showToast(msg, "warning");
      }
      return;
    }

    if (password.length < 6) {
      const msg = "Password must be at least 6 characters.";
      if (errorBox) {
        errorBox.textContent = msg;
        errorBox.style.display = "block";
      }
      if (typeof showToast === "function") {
        showToast(msg, "warning");
      }
      return;
    }

    if (errorBox) {
      errorBox.style.display = "none";
      errorBox.textContent = "";
    }

    if (typeof setButtonLoading === "function") {
      setButtonLoading(submitBtn, true, "Create Account", "Creating account...");
    } else if (submitBtn) {
      submitBtn.disabled = true;
    }

    try {
      await Auth.register(fullName, email, password, phone);

      if (typeof showToast === "function") {
        showToast("Account created successfully! Welcome to payNEXT.", "success");
      }
      form.reset();

      if (Auth.isAuthenticated()) {
        window.location.hash = "#/dashboard";
      } else {
        window.location.hash = "#/login";
      }
    } catch (error) {
      const msg = error.message || "Registration failed. Please try again.";
      if (errorBox) {
        errorBox.textContent = msg;
        errorBox.style.display = "block";
      }
      if (typeof showToast === "function") {
        showToast(msg, "error");
      }
    } finally {
      if (typeof setButtonLoading === "function") {
        setButtonLoading(submitBtn, false, "Create Account");
      } else if (submitBtn) {
        submitBtn.disabled = false;
      }
    }
  });
}

window.renderRegister = renderRegister;
window.initRegister = initRegister;
