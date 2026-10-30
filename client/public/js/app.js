/**
 * payNEXT Single Page Application (SPA) Controller & Core Utilities
 */

/**
 * Toast Notification System
 * @param {string} message - Message to display
 * @param {'info'|'success'|'error'|'warning'} type - Toast type
 */
function showToast(message, type = "info") {
  const container = document.getElementById("global-toast-container");
  if (!container) {
    alert(message);
    return;
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.setAttribute("role", "alert");
  toast.innerHTML = `
    <span>${message}</span>
    <button class="toast-close" type="button" aria-label="Close notification">&times;</button>
  `;

  const closeBtn = toast.querySelector(".toast-close");
  if (closeBtn) {
    closeBtn.addEventListener("click", () => toast.remove());
  }

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("fade-out");
    setTimeout(() => {
      if (toast.parentElement) toast.remove();
    }, 400);
  }, 4000);
}

// Global aliases
window.showToast = showToast;
window.showAlert = showToast;

/**
 * Set Button Loading State
 * @param {HTMLButtonElement} btn
 * @param {boolean} isLoading
 * @param {string} [originalText]
 * @param {string} [loadingText]
 */
function setButtonLoading(btn, isLoading, originalText = "Submit", loadingText = "Please wait...") {
  if (!btn) return;
  btn.disabled = isLoading;
  if (isLoading) {
    if (!btn.dataset.originalHtml) {
      btn.dataset.originalHtml = btn.innerHTML;
    }
    btn.innerHTML = `<span class="spinner"></span> ${loadingText}`;
  } else {
    btn.innerHTML = btn.dataset.originalHtml || originalText;
  }
}

window.setButtonLoading = setButtonLoading;

/**
 * Routes Configuration
 */
const routes = {
  "/": {
    viewId: "home-view",
  },
  "/home": {
    viewId: "home-view",
  },
  "/login": {
    viewId: "login-view",
    render: typeof renderLogin === "function" ? renderLogin : null,
    init: typeof initLogin === "function" ? initLogin : null,
  },
  "/register": {
    viewId: "register-view",
    render: typeof renderRegister === "function" ? renderRegister : null,
    init: typeof initRegister === "function" ? initRegister : null,
  },
  "/dashboard": {
    viewId: "dashboard-view",
    render: typeof renderDashboard === "function" ? renderDashboard : null,
    init: typeof initDashboard === "function" ? initDashboard : null,
    protected: true,
  },
};

/**
 * Update Header Navigation based on Authentication State
 */
function updateNavigation() {
  const authenticated = typeof Auth !== "undefined" && Auth.isAuthenticated && Auth.isAuthenticated();
  const user = typeof Auth !== "undefined" && Auth.getUser ? Auth.getUser() : null;

  const guestNav = document.getElementById("nav-guest");
  const authNav = document.getElementById("nav-auth");
  const userDisplay = document.getElementById("nav-user-name");

  if (guestNav && authNav) {
    if (authenticated) {
      guestNav.style.display = "none";
      authNav.style.display = "flex";
      if (userDisplay) {
        userDisplay.textContent = user?.fullName || user?.full_name || user?.email || "User";
      }
    } else {
      guestNav.style.display = "flex";
      authNav.style.display = "none";
    }
  }

  // Update active state in nav links
  const currentPath = (window.location.hash || "#/home").toLowerCase().replace(/^#/, "");
  document.querySelectorAll("nav a").forEach((link) => {
    const linkPath = (link.getAttribute("href") || "").toLowerCase().replace(/^#/, "");
    if (linkPath === currentPath) {
      link.classList.add("active");
    } else {
      link.classList.remove("active");
    }
  });
}

/**
 * Main SPA Router & Navigation Handler
 */
async function navigate() {
  let hash = window.location.hash || "#/home";
  // Handle empty or anchor-only hash
  if (!hash || hash === "#" || hash === "#/") {
    hash = "#/home";
  }

  // Strip hash symbol and handle internal section hashes like #/home#features
  let path = hash.slice(1);
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const cleanPath = path.split("#")[0];

  const authenticated = typeof Auth !== "undefined" && Auth.isAuthenticated && Auth.isAuthenticated();
  const route = routes[cleanPath] || routes["/home"];

  // Auth Guards
  if (route.protected && !authenticated) {
    showToast("Please log in to access your dashboard.", "info");
    window.location.hash = "#/login";
    return;
  }

  if ((cleanPath === "/login" || cleanPath === "/register") && authenticated) {
    window.location.hash = "#/dashboard";
    return;
  }

  // Switch view visibility
  const views = document.querySelectorAll(".view-section");
  views.forEach((view) => view.classList.remove("active"));

  const targetView = document.getElementById(route.viewId);
  if (targetView) {
    targetView.classList.add("active");
  }

  updateNavigation();

  // Run route initializer if available
  if (route.init && typeof route.init === "function") {
    try {
      await route.init();
    } catch (err) {
      console.error(`Error initializing route ${cleanPath}:`, err);
    }
  }

  updateNavigation();

  // Handle smooth scroll for anchor tags like #features or #status
  if (path.includes("#")) {
    const anchorId = path.split("#")[1];
    const targetElement = document.getElementById(anchorId);
    if (targetElement) {
      targetElement.scrollIntoView({ behavior: "smooth" });
      return;
    }
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

/**
 * Setup Global Event Listeners
 */
function setupGlobalEvents() {
  // Bind all logout buttons
  document.querySelectorAll(".btn-logout, #logout-button").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      if (typeof Auth !== "undefined" && Auth.logout) {
        Auth.logout();
        showToast("You have been logged out.", "info");
      }
    });
  });

  // Listen for auth state changes
  window.addEventListener("auth:change", updateNavigation);

  // Listen for URL hash changes
  window.addEventListener("hashchange", navigate);
}

/**
 * System Health Check (used by #home-view)
 */
window.checkHealth = async function () {
  const result = document.getElementById("healthResult");
  if (!result) return;

  try {
    result.textContent = "Checking system health...";
    const webRes = await fetch("/healthz");
    const webText = webRes.ok ? await webRes.text() : `Web check failed (${webRes.status})`;

    let apiText = "checking...";
    try {
      const apiRes = await fetch("/api/v1/health");
      if (apiRes.ok) {
        const apiJson = await apiRes.json();
        apiText = apiJson.success ? "OK (paynext-api online)" : "API error response";
      } else {
        apiText = `API check failed (${apiRes.status})`;
      }
    } catch (apiErr) {
      apiText = "API unreachable: " + apiErr.message;
    }

    result.textContent = `Web Server: ${webText} | API Server: ${apiText}`;
  } catch (error) {
    result.textContent = "Health check error: " + error.message;
  }
};

window.navigate = navigate;
window.updateNavigation = updateNavigation;
window.routes = routes;

// Initialize Application on DOM Ready
document.addEventListener("DOMContentLoaded", () => {
  setupGlobalEvents();
  updateNavigation();
  navigate();
});

// Run navigation immediately in case DOM is already parsed
if (document.readyState === "interactive" || document.readyState === "complete") {
  setupGlobalEvents();
  updateNavigation();
  navigate();
}
