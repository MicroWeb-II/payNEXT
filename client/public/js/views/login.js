/**
 * Login view. Markup lives in index.html (#login-view); this binds behaviour.
 */
function initLogin() {
  const form = document.getElementById("login-form");
  const errorBox = document.getElementById("login-error");
  if (!form) return;
  setFormError(errorBox, "");
  if (form.dataset.bound === "true") return;
  form.dataset.bound = "true";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const submitBtn = document.getElementById("login-submit-btn");
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;

    if (!email || !password) {
      setFormError(errorBox, "Please enter both email and password.");
      return;
    }

    setFormError(errorBox, "");
    setButtonLoading(submitBtn, true, "Signing in...");
    try {
      await Auth.login(email, password);
      form.reset();
      showToast("Welcome back!", "success");
      window.location.hash = "#/dashboard";
    } catch (error) {
      const message = error.message || "Sign in failed. Please check your details.";
      setFormError(errorBox, message);
      showToast(message, "error");
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });
}

window.initLogin = initLogin;
