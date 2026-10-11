
function renderDashboard() {
  return `
    <section class="card">
      <h1>Your Dashboard</h1>
      <p class="muted">You are viewing a protected page.</p>

      <div id="dashboard-message" aria-live="polite">
        Loading your account...
      </div>

      <div id="dashboard-profile"></div>
    </section>
  `;
}

async function initDashboard() {
  const message = document.getElementById("dashboard-message");
  const profile = document.getElementById("dashboard-profile");

  try {
    const data = await Auth.getCurrentUser();

    // Support either { user: {...} } or a direct user object.
    const user = data?.user || data;

    const name = user?.name || "User";
    const email = user?.email || "No email available";

    message.textContent = "You are successfully authenticated.";

    const heading = document.createElement("h2");
    heading.textContent = `Welcome, ${name}`;

    const emailParagraph = document.createElement("p");
    emailParagraph.textContent = `Email: ${email}`;

    profile.replaceChildren(heading, emailParagraph);
  } catch (error) {
    Auth.clearToken();
    window.location.hash = "#/login";
  }
}
