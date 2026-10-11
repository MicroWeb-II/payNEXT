function renderDashboard() {
  return `
    <section class="card">
      <h1>Your Dashboard</h1>
      <p class="muted" id="dashboard-welcome"></p>

      <div id="dashboard-message" aria-live="polite"></div>
      <div id="dashboard-wallets"></div>
    </section>
  `;
}

function showDashboardError(text) {
  const message = document.getElementById("dashboard-message");
  message.className = "message message-error";
  message.textContent = text;
}

async function loadWallets() {
  const message = document.getElementById("dashboard-message");
  const box = document.getElementById("dashboard-wallets");

  message.className = "";
  message.textContent = "Loading your wallets...";

  const wallets = await apiRequest("/wallets");

  message.textContent = "";
  box.replaceChildren();

  if (!Array.isArray(wallets) || wallets.length === 0) {
    const note = document.createElement("p");
    note.textContent = "You don't have a wallet yet.";

    const button = document.createElement("button");
    button.type = "button";
    button.className = "button";
    button.textContent = "Create wallet";

    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        await apiRequest("/wallets", {
          method: "POST",
          body: JSON.stringify({ currency: "USD" }),
        });
        await loadWallets();
      } catch (error) {
        showDashboardError(error.message);
        button.disabled = false;
      }
    });

    box.append(note, button);
    return;
  }

  const list = document.createElement("ul");

  for (const wallet of wallets) {
    const item = document.createElement("li");
    // wallet_number and id are confirmed by the backend tests;
    // balance and currency are assumed field names.
    item.textContent =
      `${wallet.wallet_number} — ${wallet.balance ?? "?"} ${wallet.currency ?? ""}`.trim();
    list.append(item);
  }

  box.append(list);
}

async function initDashboard() {
  const user = Auth.getUser();
  const welcome = document.getElementById("dashboard-welcome");
  const name = user?.fullName || user?.full_name || user?.email;
  welcome.textContent = name ? `Welcome, ${name}` : "Welcome";

  try {
    await loadWallets();
  } catch (error) {
    // apiRequest clears the token on 401, so this means the session expired.
    if (!Auth.isLoggedIn()) {
      window.location.hash = "#/login";
      return;
    }
    showDashboardError(error.message);
  }
}
