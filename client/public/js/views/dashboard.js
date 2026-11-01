/**
 * Dashboard view: profile, wallet balance, top-up, transfers and history.
 * Markup lives in index.html (#dashboard-view). Every successful money
 * movement re-fetches the wallet and history from the server, so the balance
 * on screen is always the server's balance.
 */
let activeWallet = null;

const CREDIT_TYPES = new Set(["top_up", "transfer_in", "request_in", "adjustment_credit"]);
const TYPE_LABELS = {
  top_up: "Top up",
  withdrawal: "Withdrawal",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  request_in: "Request received",
  request_out: "Request paid",
  merchant_payment: "Merchant payment",
  adjustment_credit: "Adjustment (credit)",
  adjustment_debit: "Adjustment (debit)",
};
const AMOUNT_RULE = /^(?:0|[1-9]\d{0,12})(?:\.\d{1,2})?$/;

/** Validate an amount typed by the user; returns a canonical string or null. */
function parseAmountInput(raw) {
  const text = String(raw || "").trim();
  if (!AMOUNT_RULE.test(text) || !/[1-9]/.test(text)) return null;
  return text;
}

/** Integer cents from a decimal string, for exact client-side comparisons. */
function toCents(value) {
  const [whole, fraction = ""] = String(value || "0").split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0").slice(0, 2));
}

function formatMoney(amount, currency = "USD") {
  const value = Number(amount);
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number.isFinite(value) ? value : 0);
  } catch {
    return `${(Number.isFinite(value) ? value : 0).toFixed(2)} ${currency}`;
  }
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function renderUserProfile(user) {
  if (!user) return;
  setText("dash-user-name", user.full_name || user.fullName || user.email || "payNEXT user");
  setText("dash-user-email", user.email || "N/A");
  setText("dash-user-role", (user.role || "user").toUpperCase());
  setText("dash-user-phone", user.phone || "Not provided");
  setText("dash-user-since", user.created_at ? new Date(user.created_at).toLocaleDateString() : "N/A");
}

function renderWallet(wallet) {
  if (!wallet) return;
  setText("dash-wallet-number", wallet.wallet_number);
  setText("dash-wallet-balance", formatMoney(wallet.balance, wallet.currency));
  const status = document.getElementById("dash-wallet-status");
  if (status) {
    status.textContent = (wallet.status || "active").toUpperCase();
    status.className = `badge ${wallet.status === "active" ? "badge-success" : "badge-rose"}`;
  }
  document.querySelectorAll(".currency-label").forEach((el) => {
    el.textContent = wallet.currency;
  });
}

async function loadWallets() {
  try {
    let wallets = await apiRequest("/wallets");
    if (!Array.isArray(wallets) || wallets.length === 0) {
      const created = await apiRequest("/wallets", { method: "POST", body: JSON.stringify({ currency: "USD" }) });
      wallets = created ? [created] : [];
    }
    activeWallet = wallets.find((w) => w.status === "active") || wallets[0] || null;
    renderWallet(activeWallet);
    return activeWallet;
  } catch (error) {
    setText("dash-wallet-balance", "Unavailable");
    showToast(`Could not load your wallet: ${error.message}`, "error");
    return null;
  }
}

function transactionRow(tx) {
  const type = String(tx.type || "").toLowerCase();
  const isCredit = CREDIT_TYPES.has(type);
  const item = document.createElement("div");
  item.className = "tx-item";

  const left = document.createElement("div");
  left.className = "tx-left";
  const icon = document.createElement("div");
  icon.className = `tx-icon ${isCredit ? "tx-icon-in" : "tx-icon-out"}`;
  icon.textContent = isCredit ? "↓" : "↑";
  const meta = document.createElement("div");
  meta.className = "tx-meta";
  const desc = document.createElement("div");
  desc.className = "tx-desc";
  desc.textContent = tx.description || TYPE_LABELS[type] || type;
  const date = document.createElement("div");
  date.className = "tx-date";
  date.textContent = `${tx.created_at ? new Date(tx.created_at).toLocaleString() : ""} • `;
  const badge = document.createElement("span");
  badge.className = `badge ${isCredit ? "badge-success" : "badge-rose"}`;
  badge.textContent = (TYPE_LABELS[type] || type).toUpperCase();
  date.appendChild(badge);
  meta.append(desc, date);
  left.append(icon, meta);

  const right = document.createElement("div");
  right.className = "tx-right";
  const amount = document.createElement("div");
  amount.className = `tx-amount ${isCredit ? "positive" : "negative"}`;
  amount.textContent = `${isCredit ? "+" : "-"}${formatMoney(tx.amount, tx.currency)}`;
  right.appendChild(amount);
  if (tx.balance_after !== undefined && tx.balance_after !== null) {
    const after = document.createElement("div");
    after.className = "tx-balance";
    after.textContent = `Balance: ${formatMoney(tx.balance_after, tx.currency)}`;
    right.appendChild(after);
  }

  item.append(left, right);
  return item;
}

function renderEmptyHistory(container, message, isError = false) {
  const box = document.createElement("div");
  box.className = "tx-empty";
  if (isError) box.classList.add("tx-error");
  box.textContent = message;
  container.replaceChildren(box);
}

async function loadTransactions() {
  const container = document.getElementById("transactions-container");
  if (!container || !activeWallet) return;
  renderEmptyHistory(container, "Loading transaction history...");
  try {
    const transactions = await apiRequest(`/history?limit=20&offset=0&walletId=${encodeURIComponent(activeWallet.id)}`);
    if (!Array.isArray(transactions) || transactions.length === 0) {
      renderEmptyHistory(container, "No transactions yet. Top up your wallet or send money to see activity here.");
      return;
    }
    const list = document.createElement("div");
    list.className = "tx-list";
    transactions.forEach((tx) => list.appendChild(transactionRow(tx)));
    container.replaceChildren(list);
  } catch (error) {
    renderEmptyHistory(container, `Unable to load transactions: ${error.message}`, true);
  }
}

async function refreshWalletAndHistory() {
  await loadWallets();
  await loadTransactions();
}

/**
 * Bind a money form: validates, shows a loading state and inline errors, and
 * re-fetches balance and history after a successful mutation.
 */
function bindMoneyForm({ formId, errorId, buttonId, loadingText, buildRequest, successMessage }) {
  const form = document.getElementById(formId);
  if (!form || form.dataset.bound === "true") return;
  form.dataset.bound = "true";
  const errorBox = document.getElementById(errorId);
  const submitBtn = document.getElementById(buttonId);

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!activeWallet) {
      setFormError(errorBox, "No wallet loaded. Please refresh the page.");
      return;
    }
    let request;
    try {
      request = buildRequest();
    } catch (validationError) {
      setFormError(errorBox, validationError.message);
      return;
    }

    setFormError(errorBox, "");
    setButtonLoading(submitBtn, true, loadingText);
    try {
      await apiRequest(request.endpoint, { method: "POST", body: JSON.stringify(request.body) });
      form.reset();
      showToast(successMessage(request.body), "success");
      await refreshWalletAndHistory();
    } catch (error) {
      setFormError(errorBox, error.message);
      showToast(error.message, "error");
      if (error.status === 409 || error.status === 400) await loadWallets();
    } finally {
      setButtonLoading(submitBtn, false);
    }
  });
}

function setupMoneyForms() {
  bindMoneyForm({
    formId: "topup-form",
    errorId: "topup-error",
    buttonId: "topup-submit-btn",
    loadingText: "Processing top-up...",
    buildRequest() {
      const amount = parseAmountInput(document.getElementById("topup-amount").value);
      if (!amount) throw new Error("Enter an amount greater than 0 with at most 2 decimal places.");
      const provider = document.getElementById("topup-provider").value || "mock";
      return { endpoint: `/wallets/${activeWallet.id}/top-up`, body: { amount, provider } };
    },
    successMessage: ({ amount }) => `Top-up of ${formatMoney(amount, activeWallet.currency)} successful.`,
  });

  bindMoneyForm({
    formId: "transfer-form",
    errorId: "transfer-error",
    buttonId: "transfer-submit-btn",
    loadingText: "Sending...",
    buildRequest() {
      const toWalletNumber = document.getElementById("transfer-to-wallet").value.trim().toUpperCase();
      const amount = parseAmountInput(document.getElementById("transfer-amount").value);
      const note = document.getElementById("transfer-note").value.trim();
      if (!/^PAYNX-\d{6}$/.test(toWalletNumber)) throw new Error("Recipient wallet number must look like PAYNX-123456.");
      if (!amount) throw new Error("Enter an amount greater than 0 with at most 2 decimal places.");
      if (toWalletNumber === activeWallet.wallet_number) throw new Error("You cannot send money to your own wallet.");
      if (toCents(amount) > toCents(activeWallet.balance)) {
        throw new Error(`Insufficient funds. Your balance is ${formatMoney(activeWallet.balance, activeWallet.currency)}.`);
      }
      return { endpoint: "/transfers", body: { fromWalletId: activeWallet.id, toWalletNumber, amount, ...(note ? { note } : {}) } };
    },
    successMessage: ({ amount, toWalletNumber }) => `Sent ${formatMoney(amount, activeWallet.currency)} to ${toWalletNumber}.`,
  });
}

function bindButton(id, handler) {
  const btn = document.getElementById(id);
  if (!btn || btn.dataset.bound === "true") return;
  btn.dataset.bound = "true";
  btn.addEventListener("click", handler);
}

function setupDashboardActions() {
  const focusPanel = (panelId, inputId) => () => {
    document.getElementById(panelId)?.scrollIntoView({ behavior: "smooth", block: "center" });
    document.getElementById(inputId)?.focus();
  };
  bindButton("btn-toggle-topup", focusPanel("topup-panel", "topup-amount"));
  bindButton("btn-toggle-transfer", focusPanel("transfer-panel", "transfer-to-wallet"));

  const withLoading = (id, text, work) => async () => {
    const btn = document.getElementById(id);
    setButtonLoading(btn, true, text);
    try {
      await work();
    } finally {
      setButtonLoading(btn, false);
    }
  };
  bindButton("btn-refresh-wallet", withLoading("btn-refresh-wallet", "Refreshing...", refreshWalletAndHistory));
  bindButton("btn-refresh-history", withLoading("btn-refresh-history", "Refreshing...", loadTransactions));
  bindButton("btn-copy-wallet", async () => {
    if (!activeWallet || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(activeWallet.wallet_number);
      showToast("Wallet number copied.", "success");
    } catch {
      showToast("Could not copy the wallet number.", "warning");
    }
  });
}

async function initDashboard() {
  if (!Auth.isAuthenticated()) {
    window.location.hash = "#/login";
    return;
  }
  renderUserProfile(Auth.getUser());
  setupMoneyForms();
  setupDashboardActions();

  try {
    renderUserProfile(await Auth.fetchMe());
  } catch (error) {
    if (error.status !== 401) showToast(`Could not refresh your profile: ${error.message}`, "warning");
  }
  if (!Auth.isAuthenticated()) return;
  await refreshWalletAndHistory();
}

window.initDashboard = initDashboard;
