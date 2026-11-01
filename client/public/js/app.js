/**
 * payNEXT single-page app controller: toasts, loading states, hash routing and
 * auth guards. Loaded last, after auth.js, api.js and the view scripts.
 */

const TOAST_DURATION_MS = 4500;

/**
 * Show a toast. The message is inserted as text, never HTML, because it can
 * contain server-provided strings.
 * @param {string} message
 * @param {'info'|'success'|'error'|'warning'} type
 */
function showToast(message, type = "info") {
  const container = document.getElementById("global-toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.setAttribute("role", type === "error" ? "alert" : "status");

  const text = document.createElement("span");
  text.textContent = String(message);

  const close = document.createElement("button");
  close.className = "toast-close";
  close.type = "button";
  close.setAttribute("aria-label", "Close notification");
  close.textContent = "×";
  close.addEventListener("click", () => toast.remove());

  toast.append(text, close);
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => toast.remove(), 400);
  }, TOAST_DURATION_MS);
}

/**
 * Toggle a button's loading state. The original label is restored afterwards.
 * @param {HTMLButtonElement|null} btn
 * @param {boolean} isLoading
 * @param {string} [loadingText]
 */
function setButtonLoading(btn, isLoading, loadingText = "Please wait...") {
  if (!btn) return;
  btn.disabled = isLoading;
  btn.setAttribute("aria-busy", String(isLoading));
  if (isLoading) {
    if (!btn.dataset.originalLabel) btn.dataset.originalLabel = btn.textContent.trim();
    btn.replaceChildren();
    const spinner = document.createElement("span");
    spinner.className = "spinner";
    btn.append(spinner, document.createTextNode(` ${loadingText}`));
  } else if (btn.dataset.originalLabel) {
    btn.textContent = btn.dataset.originalLabel;
    delete btn.dataset.originalLabel;
  }
}

/** Show or hide an inline form error banner. */
function setFormError(element, message) {
  if (!element) return;
  element.textContent = message || "";
  element.style.display = message ? "block" : "none";
}

window.showToast = showToast;
window.setButtonLoading = setButtonLoading;
window.setFormError = setFormError;

const routes = {
  "/home": { viewId: "home-view" },
  "/login": { viewId: "login-view", init: initLogin, guestOnly: true },
  "/register": { viewId: "register-view", init: initRegister, guestOnly: true },
  "/dashboard": { viewId: "dashboard-view", init: initDashboard, protected: true },
};

function currentPath() {
  const hash = window.location.hash || "#/home";
  const path = hash.slice(1).startsWith("/") ? hash.slice(1) : `/${hash.slice(1)}`;
  return { path: path.split("#")[0] || "/home", anchor: path.split("#")[1] || null };
}

function updateNavigation() {
  const authenticated = Auth.isAuthenticated();
  const user = Auth.getUser();
  const guestNav = document.getElementById("nav-guest");
  const authNav = document.getElementById("nav-auth");
  const userDisplay = document.getElementById("nav-user-name");

  if (guestNav) guestNav.style.display = authenticated ? "none" : "flex";
  if (authNav) authNav.style.display = authenticated ? "flex" : "none";
  if (userDisplay && authenticated) {
    userDisplay.textContent = (user && (user.full_name || user.fullName || user.email)) || "Account";
  }

  const { path } = currentPath();
  document.querySelectorAll("nav a").forEach((link) => {
    const linkPath = (link.getAttribute("href") || "").replace(/^#/, "");
    link.classList.toggle("active", linkPath === path);
  });
}

async function navigate() {
  const { path, anchor } = currentPath();
  const route = routes[path] || routes["/home"];
  const authenticated = Auth.isAuthenticated();

  if (route.protected && !authenticated) {
    showToast("Please sign in to access your dashboard.", "info");
    window.location.hash = "#/login";
    return;
  }
  if (route.guestOnly && authenticated) {
    window.location.hash = "#/dashboard";
    return;
  }

  document.querySelectorAll(".view-section").forEach((view) => {
    view.classList.toggle("active", view.id === route.viewId);
  });
  updateNavigation();

  if (typeof route.init === "function") {
    try {
      await route.init();
    } catch (error) {
      console.error(`Failed to initialise ${path}:`, error);
      showToast("Something went wrong loading this page. Please refresh.", "error");
    }
  }

  const target = anchor && document.getElementById(anchor);
  if (target) target.scrollIntoView({ behavior: "smooth" });
  else window.scrollTo({ top: 0, behavior: "smooth" });
}

async function checkHealth() {
  const result = document.getElementById("healthResult");
  const button = document.getElementById("health-btn");
  if (!result) return;
  setButtonLoading(button, true, "Checking...");
  result.textContent = "Checking system health...";
  try {
    const web = await fetch("/healthz").then((r) => (r.ok ? "OK" : `failed (${r.status})`)).catch(() => "unreachable");
    const api = await fetch("/api/v1/health")
      .then(async (r) => (r.ok && (await r.json()).success ? "OK (database reachable)" : `failed (${r.status})`))
      .catch(() => "unreachable");
    result.textContent = `Web server: ${web} | API: ${api}`;
  } finally {
    setButtonLoading(button, false);
  }
}

function setupGlobalEvents() {
  document.querySelectorAll(".btn-logout").forEach((btn) => {
    btn.addEventListener("click", async (event) => {
      event.preventDefault();
      setButtonLoading(btn, true, "Signing out...");
      try {
        await Auth.logout();
        showToast("You have been signed out.", "info");
      } finally {
        setButtonLoading(btn, false);
      }
    });
  });

  const healthBtn = document.getElementById("health-btn");
  if (healthBtn) healthBtn.addEventListener("click", checkHealth);

  window.addEventListener("auth:change", updateNavigation);
  window.addEventListener("hashchange", navigate);
}

let started = false;
async function start() {
  if (started) return;
  started = true;
  setupGlobalEvents();
  await Auth.restoreSession();
  await navigate();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
  start();
}
