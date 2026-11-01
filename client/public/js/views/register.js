/**
 * Registration view. Markup lives in index.html (#register-view).
 * The password rule matches the API: at least 8 characters, with at least one
 * letter and one number.
 */
const PASSWORD_RULE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
const PASSWORD_RULE_TEXT = "Password must be at least 8 characters and include a letter and a number.";

function initRegister() {
  const form = document.getElementById("register-form");
  const errorBox = document.getElementById("register-error");
  if (!form) return;
  setFormError(errorBox, "");
  if (form.dataset.bound === "true") return;
  form.dataset.bound = "true";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitBtn = document.getElementById("register-submit-btn");
    const fullName = document.getElementById("register-name").value.trim();
    const email = document.getElementById("register-email").value.trim();
    const password = document.getElementById("register-password").value;
    const phone = document.getElementById("register-phone").value.trim();

    if (!fullName || !email || !password) {
      setFormError(errorBox, "Please fill in all required fields.");
      return;
    }
    if (!PASSWORD_RULE.test(password)) {
      setFormError(errorBox, PASSWORD_RULE_TEXT);
      return;
    }

    setFormError(errorBox, "");
    setButtonLoading(submitBtn, true, "Creating account...");
    try {
      await Auth.register(fullName, email, password, phone);
      form.reset();
      showToast("Account created. Welcome to payNEXT!", "success");
      window.location.hash = Auth.isAuthenticated() ? "#/dashboard" : "#/login";
    } catch (error) {
      const message = error.message || "Registration failed. Please try again.";
      setFormError(errorBox, message);
      showToast(message, "error");
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });
}

window.initRegister = initRegister;
