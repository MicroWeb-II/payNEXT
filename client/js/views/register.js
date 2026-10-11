
function renderRegister() {
  return `
    <section class="card">
      <h1>Create your account</h1>
      <p class="muted">Register to get started.</p>

      <div id="register-message" aria-live="polite"></div>

      <form id="register-form">
        <div class="form-group">
          <label for="register-name">Name</label>
          <input id="register-name" name="name" type="text"
            autocomplete="name" maxlength="100" required>
        </div>

        <div class="form-group">
          <label for="register-email">Email</label>
          <input id="register-email" name="email" type="email"
            autocomplete="email" required>
        </div>

        <div class="form-group">
          <label for="register-password">Password</label>
          <input id="register-password" name="password" type="password"
            autocomplete="new-password" minlength="8" required>
        </div>

        <button class="button form-button" type="submit">
          Create account
        </button>
      </form>

      <p class="muted">
        Already registered? <a href="#/login">Log in</a>.
      </p>
    </section>
  `;
}

function initRegister() {
  const form = document.getElementById("register-form");
  if (!form) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const button = form.querySelector('button[type="submit"]');
    const message = document.getElementById("register-message");

    const name = form.elements.name.value.trim();
    const email = form.elements.email.value.trim();
    const password = form.elements.password.value;

    if (password.length < 8) {
      message.className = "message message-error";
      message.textContent = "Password must be at least 8 characters.";
      return;
    }

    button.disabled = true;
    message.textContent = "";

    try {
      const data = await Auth.register(name, email, password);

      if (Auth.isLoggedIn()) {
        window.location.hash = "#/dashboard";
      } else {
        message.className = "message message-success";
        message.textContent =
          data?.message || "Registration successful. Please log in.";
        form.reset();
      }
    } catch (error) {
      message.className = "message message-error";
      message.textContent = error.message || "Registration failed.";
    } finally {
      button.disabled = false;
    }
  });
}
