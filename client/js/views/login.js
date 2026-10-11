
function renderLogin() {
  return `
    <section class="card">
      <h1>Welcome back</h1>
      <p class="muted">Log in to access your account.</p>

      <div id="login-message" aria-live="polite"></div>

      <form id="login-form">
        <div class="form-group">
          <label for="login-email">Email</label>
          <input id="login-email" name="email" type="email"
            autocomplete="email" required>
        </div>

        <div class="form-group">
          <label for="login-password">Password</label>
          <input id="login-password" name="password" type="password"
            autocomplete="current-password" required>
        </div>

        <button class="button form-button" type="submit">
          Log in
        </button>
      </form>

      <p class="muted">
        New here? <a href="#/register">Create an account</a>.
      </p>
    </section>
  `;
}

function initLogin() {
  const form = document.getElementById("login-form");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const button = form.querySelector('button[type="submit"]');
    const message = document.getElementById("login-message");
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;

    button.disabled = true;
    message.textContent = "";

    try {
      await Auth.login(email, password);
      window.location.hash = "#/dashboard";
    } catch (error) {
      message.className = "message message-error";
      message.textContent = error.message || "Login failed.";
    } finally {
      button.disabled = false;
    }
  });
}
