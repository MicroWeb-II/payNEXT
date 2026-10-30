/**
 * payNEXT Dashboard View Controller
 * Manages user profile, token verification, wallet balance, top-up, money transfers, and transaction history.
 */

let activeWallet = null;

function renderDashboard() {
  // If invoked dynamically, returns the main container markup
  const existing = document.getElementById("dashboard-view");
  return existing ? existing.innerHTML : "";
}

function showDashboardError(text) {
  if (typeof showToast === "function") {
    showToast(text, "error");
  }
}

/**
 * Format currency amount
 */
function formatCurrency(amount, currency = "USD") {
  const num = Number(amount);
  const formatted = isNaN(num) ? "0.00" : num.toFixed(2);
  return `$${formatted} ${currency}`;
}

/**
 * Escape HTML to prevent injection
 */
function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Render user profile fields
 */
function renderUserProfile(user) {
  if (!user) return;
  const nameEl = document.getElementById("dash-user-name");
  const emailEl = document.getElementById("dash-user-email");
  const roleEl = document.getElementById("dash-user-role");
  const phoneEl = document.getElementById("dash-user-phone");
  const idEl = document.getElementById("dash-user-id");

  const displayName = user.fullName || user.full_name || user.name || user.email || "payNEXT User";
  if (nameEl) nameEl.textContent = displayName;
  if (emailEl) emailEl.textContent = user.email || "N/A";
  if (roleEl) roleEl.textContent = (user.role || "user").toUpperCase();
  if (phoneEl) phoneEl.textContent = user.phone || "None provided";
  if (idEl) idEl.textContent = user.id ? `UID-${user.id}` : "N/A";
}

/**
 * Render token preview card
 */
function renderTokenSecurity() {
  const token = typeof Auth !== "undefined" && Auth.getToken ? Auth.getToken() : null;
  const tokenPreviewEl = document.getElementById("dash-token-preview");
  if (!tokenPreviewEl) return;

  if (token) {
    const parts = token.split(".");
    if (parts.length === 3) {
      tokenPreviewEl.textContent = `${parts[0]}.${parts[1].substring(0, 15)}...[PROTECTED_SIGNATURE]`;
    } else {
      tokenPreviewEl.textContent = token.substring(0, 30) + "...";
    }
  } else {
    tokenPreviewEl.textContent = "No active Bearer token found.";
  }
}

/**
 * Load user's wallets and balance
 */
async function loadWallets() {
  const walletNumEl = document.getElementById("dash-wallet-number");
  const balanceEl = document.getElementById("dash-wallet-balance");

  try {
    const wallets = await apiRequest("/wallets");

    if (!Array.isArray(wallets) || wallets.length === 0) {
      // If no wallet exists yet, create default USD wallet
      try {
        const newWallet = await apiRequest("/wallets", {
          method: "POST",
          body: JSON.stringify({ currency: "USD" }),
        });
        activeWallet = newWallet;
      } catch (err) {
        console.warn("Wallet creation attempt:", err);
      }
    } else {
      activeWallet = wallets[0];
    }

    if (activeWallet) {
      localStorage.setItem("paynext_wallet", JSON.stringify(activeWallet));
      if (walletNumEl) {
        walletNumEl.textContent = activeWallet.wallet_number || "PAYNX-ACTIVE";
      }
      if (balanceEl) {
        balanceEl.innerHTML = `${formatCurrency(activeWallet.balance, activeWallet.currency)}`;
      }
    }

    return activeWallet;
  } catch (error) {
    console.error("Failed to load wallets:", error);
    if (typeof showToast === "function") {
      showToast("Could not retrieve wallet balance: " + error.message, "error");
    }
    return null;
  }
}

/**
 * Load transaction history for the user's wallet
 */
async function loadTransactions(walletId) {
  const container = document.getElementById("transactions-container");
  if (!container) return;

  try {
    let transactions = [];
    try {
      transactions = await apiRequest("/history?limit=20&offset=0");
    } catch {
      if (walletId) {
        transactions = await apiRequest(`/wallets/${walletId}/transactions?limit=20&offset=0`);
      }
    }

    if (!Array.isArray(transactions) || transactions.length === 0) {
      container.innerHTML = `
        <div class="tx-empty">
          <p>No transactions found.</p>
          <p style="font-size: 13px; color: var(--text-dim); margin-top: 6px;">
            Top up your wallet or transfer funds to see activity here.
          </p>
        </div>
      `;
      return;
    }

    const list = document.createElement("div");
    list.className = "tx-list";

    transactions.forEach((tx) => {
      const item = document.createElement("div");
      item.className = "tx-item";

      const type = (tx.type || "").toLowerCase();
      const isPositive = type === "top_up" || type === "transfer_in" || type === "credit";
      const iconClass = isPositive ? "tx-icon-in" : "tx-icon-out";
      const iconSymbol = isPositive ? "↓" : "↑";
      const amountSign = isPositive ? "+" : "-";

      const txTypeBadge = isPositive ? "badge-success" : "badge-rose";
      const displayType = type.replace(/_/g, " ").toUpperCase();
      const txAmount = Number(tx.amount || 0).toFixed(2);
      const balanceAfter = tx.balance_after !== undefined && tx.balance_after !== null
        ? `$${Number(tx.balance_after).toFixed(2)}`
        : "";

      const dateStr = tx.created_at ? new Date(tx.created_at).toLocaleString() : "Recent";
      const desc = tx.description || `${displayType} transaction`;

      item.innerHTML = `
        <div class="tx-left">
          <div class="tx-icon ${iconClass}">${iconSymbol}</div>
          <div class="tx-meta">
            <div class="tx-desc">${escapeHtml(desc)}</div>
            <div class="tx-date">${escapeHtml(dateStr)} • <span class="badge ${txTypeBadge}">${escapeHtml(displayType)}</span></div>
          </div>
        </div>
        <div class="tx-right">
          <div class="tx-amount ${isPositive ? 'positive' : 'negative'}">${amountSign}$${txAmount}</div>
          ${balanceAfter ? `<div class="tx-balance">Bal: ${escapeHtml(balanceAfter)}</div>` : ""}
        </div>
      `;
      list.appendChild(item);
    });

    container.replaceChildren(list);
  } catch (error) {
    console.error("Failed to load transactions:", error);
    container.innerHTML = `
      <div class="tx-empty" style="color: var(--accent-rose);">
        Unable to load transactions: ${escapeHtml(error.message)}
      </div>
    `;
  }
}

/**
 * Setup Top-Up Form Handler
 */
function setupTopUpForm() {
  const form = document.getElementById("topup-form");
  if (!form || form.dataset.bound === "true") return;
  form.dataset.bound = "true";

  const errorBox = document.getElementById("topup-error");
  const submitBtn = document.getElementById("topup-submit-btn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!activeWallet || !activeWallet.id) {
      if (typeof showToast === "function") {
        showToast("No active wallet found. Please refresh the page.", "error");
      }
      return;
    }

    const amountInput = document.getElementById("topup-amount");
    const providerSelect = document.getElementById("topup-provider");

    const amount = Number(amountInput ? amountInput.value : 0);
    const provider = providerSelect ? providerSelect.value : "mock";

    if (!amount || amount <= 0) {
      if (errorBox) {
        errorBox.textContent = "Please enter an amount greater than $0.00.";
        errorBox.style.display = "block";
      }
      if (typeof showToast === "function") {
        showToast("Please enter an amount greater than $0.00.", "warning");
      }
      return;
    }

    if (errorBox) {
      errorBox.style.display = "none";
      errorBox.textContent = "";
    }

    if (typeof setButtonLoading === "function") {
      setButtonLoading(submitBtn, true, "Confirm Top Up", "Processing Top Up...");
    } else if (submitBtn) {
      submitBtn.disabled = true;
    }

    try {
      await apiRequest(`/wallets/${activeWallet.id}/top-up`, {
        method: "POST",
        body: JSON.stringify({
          amount,
          provider,
          description: `Top-up via ${provider}`,
        }),
      });

      if (typeof showToast === "function") {
        showToast(`Top-up of $${amount.toFixed(2)} successful!`, "success");
      }
      form.reset();

      // RE-FETCH WALLET BALANCE AND TRANSACTIONS AFTER SUCCESSFUL MUTATION
      await loadWallets();
      if (activeWallet && activeWallet.id) {
        await loadTransactions(activeWallet.id);
      }
    } catch (error) {
      const msg = error.message || "Top-up failed. Please try again.";
      if (errorBox) {
        errorBox.textContent = msg;
        errorBox.style.display = "block";
      }
      if (typeof showToast === "function") {
        showToast(msg, "error");
      }
    } finally {
      if (typeof setButtonLoading === "function") {
        setButtonLoading(submitBtn, false, "Confirm Top Up");
      } else if (submitBtn) {
        submitBtn.disabled = false;
      }
    }
  });
}

/**
 * Setup Transfer (Send Money) Form Handler
 */
function setupTransferForm() {
  const form = document.getElementById("transfer-form");
  if (!form || form.dataset.bound === "true") return;
  form.dataset.bound = "true";

  const errorBox = document.getElementById("transfer-error");
  const submitBtn = document.getElementById("transfer-submit-btn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!activeWallet || !activeWallet.id) {
      if (typeof showToast === "function") {
        showToast("No active wallet found. Please refresh the page.", "error");
      }
      return;
    }

    const toWalletInput = document.getElementById("transfer-to-wallet");
    const amountInput = document.getElementById("transfer-amount");
    const noteInput = document.getElementById("transfer-note");

    const toWalletNumber = toWalletInput ? toWalletInput.value.trim().toUpperCase() : "";
    const amount = Number(amountInput ? amountInput.value : 0);
    const note = noteInput ? noteInput.value.trim() : "";

    if (!toWalletNumber || !amount || amount <= 0) {
      const msg = "Please enter a valid recipient wallet number and amount.";
      if (errorBox) {
        errorBox.textContent = msg;
        errorBox.style.display = "block";
      }
      if (typeof showToast === "function") {
        showToast(msg, "warning");
      }
      return;
    }

    if (activeWallet.wallet_number && toWalletNumber === activeWallet.wallet_number) {
      const msg = "You cannot send money to your own wallet.";
      if (errorBox) {
        errorBox.textContent = msg;
        errorBox.style.display = "block";
      }
      if (typeof showToast === "function") {
        showToast(msg, "warning");
      }
      return;
    }

    if (Number(activeWallet.balance) < amount) {
      const msg = `Insufficient funds. Your current balance is $${Number(activeWallet.balance).toFixed(2)}.`;
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
      setButtonLoading(submitBtn, true, "Send Money", "Sending Transfer...");
    } else if (submitBtn) {
      submitBtn.disabled = true;
    }

    try {
      await apiRequest("/transfers", {
        method: "POST",
        body: JSON.stringify({
          fromWalletId: activeWallet.id,
          toWalletNumber,
          amount,
          note: note || undefined,
        }),
      });

      if (typeof showToast === "function") {
        showToast(`Successfully transferred $${amount.toFixed(2)} to ${toWalletNumber}!`, "success");
      }
      form.reset();

      // RE-FETCH WALLET BALANCE AND TRANSACTIONS AFTER SUCCESSFUL MUTATION
      await loadWallets();
      if (activeWallet && activeWallet.id) {
        await loadTransactions(activeWallet.id);
      }
    } catch (error) {
      const msg = error.message || "Transfer failed. Please check the recipient wallet number.";
      if (errorBox) {
        errorBox.textContent = msg;
        errorBox.style.display = "block";
      }
      if (typeof showToast === "function") {
        showToast(msg, "error");
      }
    } finally {
      if (typeof setButtonLoading === "function") {
        setButtonLoading(submitBtn, false, "Send Money");
      } else if (submitBtn) {
        submitBtn.disabled = false;
      }
    }
  });
}

/**
 * Setup Dashboard Action Buttons
 */
function setupDashboardActions() {
  const copyBtn = document.getElementById("copy-token-btn");
  if (copyBtn && copyBtn.dataset.bound !== "true") {
    copyBtn.dataset.bound = "true";
    copyBtn.addEventListener("click", () => {
      const token = typeof Auth !== "undefined" && Auth.getToken ? Auth.getToken() : null;
      if (token && navigator.clipboard) {
        navigator.clipboard.writeText(token).then(() => {
          if (typeof showToast === "function") {
            showToast("Bearer token copied to clipboard!", "success");
          }
        }).catch(() => {
          if (typeof showToast === "function") {
            showToast("Could not copy token automatically.", "warning");
          }
        });
      }
    });
  }

  const btnTopUp = document.getElementById("btn-toggle-topup");
  if (btnTopUp && btnTopUp.dataset.bound !== "true") {
    btnTopUp.dataset.bound = "true";
    btnTopUp.addEventListener("click", () => {
      const panel = document.getElementById("topup-panel");
      const input = document.getElementById("topup-amount");
      if (panel) {
        panel.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      if (input) input.focus();
    });
  }

  const btnTransfer = document.getElementById("btn-toggle-transfer");
  if (btnTransfer && btnTransfer.dataset.bound !== "true") {
    btnTransfer.dataset.bound = "true";
    btnTransfer.addEventListener("click", () => {
      const panel = document.getElementById("transfer-panel");
      const input = document.getElementById("transfer-to-wallet");
      if (panel) {
        panel.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      if (input) input.focus();
    });
  }

  const btnRefresh = document.getElementById("btn-refresh-wallet");
  if (btnRefresh && btnRefresh.dataset.bound !== "true") {
    btnRefresh.dataset.bound = "true";
    btnRefresh.addEventListener("click", async () => {
      btnRefresh.disabled = true;
      try {
        await loadWallets();
        if (activeWallet && activeWallet.id) {
          await loadTransactions(activeWallet.id);
        }
        if (typeof showToast === "function") {
          showToast("Wallet data updated.", "info");
        }
      } finally {
        btnRefresh.disabled = false;
      }
    });
  }

  const btnRefreshHistory = document.getElementById("btn-refresh-history");
  if (btnRefreshHistory && btnRefreshHistory.dataset.bound !== "true") {
    btnRefreshHistory.dataset.bound = "true";
    btnRefreshHistory.addEventListener("click", async () => {
      btnRefreshHistory.disabled = true;
      try {
        if (activeWallet && activeWallet.id) {
          await loadTransactions(activeWallet.id);
        }
        if (typeof showToast === "function") {
          showToast("Transaction history updated.", "info");
        }
      } finally {
        btnRefreshHistory.disabled = false;
      }
    });
  }
}

/**
 * Initialize Dashboard View
 */
async function initDashboard() {
  if (typeof Auth === "undefined" || !Auth.isAuthenticated()) {
    if (typeof showToast === "function") {
      showToast("Please log in to access your dashboard.", "info");
    }
    window.location.hash = "#/login";
    return;
  }

  // 1. Render cached user profile immediately
  const cachedUser = Auth.getUser();
  if (cachedUser) {
    renderUserProfile(cachedUser);
  }

  // 2. Render token security
  renderTokenSecurity();

  // 3. Setup form handlers and buttons
  setupTopUpForm();
  setupTransferForm();
  setupDashboardActions();

  // 4. Fetch fresh user profile in background
  try {
    const freshUser = await Auth.fetchMe();
    if (freshUser) {
      renderUserProfile(freshUser);
    }
  } catch (err) {
    console.warn("Could not fetch fresh user profile:", err);
  }

  // 5. Load wallet & balance
  const wallet = await loadWallets();

  // 6. Load transactions
  if (wallet && wallet.id) {
    await loadTransactions(wallet.id);
  }
}

window.renderDashboard = renderDashboard;
window.initDashboard = initDashboard;
window.loadWallets = loadWallets;
window.loadTransactions = loadTransactions;
