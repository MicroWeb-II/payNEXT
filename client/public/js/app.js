/**
 * payNEXT Single Page Application (SPA) Controller
 * Routes: #/home, #/login, #/register, #/dashboard
 */

document.addEventListener('DOMContentLoaded', () => {
  initApp();
});

function initApp() {
  // Bind router events
  window.addEventListener('hashchange', handleRoute);
  window.addEventListener('auth:change', updateNav);

  // Form listeners
  setupLoginForm();
  setupRegisterForm();
  setupLogoutButtons();
  setupDashboardActions();

  // Initial render
  updateNav();
  handleRoute();
}

/**
 * Handle Hash-based SPA routing
 */
async function handleRoute() {
  const hash = window.location.hash.toLowerCase() || '#/home';
  const authenticated = Auth.isAuthenticated();

  // Route Guards
  if (hash === '#/dashboard' && !authenticated) {
    showAlert('Please log in to access your dashboard.', 'info');
    window.location.hash = '#/login';
    return;
  }

  if ((hash === '#/login' || hash === '#/register') && authenticated) {
    window.location.hash = '#/dashboard';
    return;
  }

  // Hide all views
  const views = document.querySelectorAll('.view-section');
  views.forEach((view) => view.classList.remove('active'));

  // Show target view
  let targetViewId = 'home-view';
  if (hash === '#/login') targetViewId = 'login-view';
  else if (hash === '#/register') targetViewId = 'register-view';
  else if (hash === '#/dashboard') targetViewId = 'dashboard-view';
  else if (hash === '#/home' || hash === '#/' || !hash) targetViewId = 'home-view';

  const targetView = document.getElementById(targetViewId);
  if (targetView) {
    targetView.classList.add('active');
  }

  // Route-specific actions
  if (targetViewId === 'dashboard-view') {
    loadDashboardData();
  }

  // Scroll to top
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * Update Navigation based on Auth State
 */
function updateNav() {
  const authenticated = Auth.isAuthenticated();
  const user = Auth.getUser();

  const guestNav = document.getElementById('nav-guest');
  const authNav = document.getElementById('nav-auth');
  const userDisplay = document.getElementById('nav-user-name');

  if (guestNav && authNav) {
    if (authenticated) {
      guestNav.style.display = 'none';
      authNav.style.display = 'flex';
      if (userDisplay) {
        userDisplay.textContent = user?.fullName || user?.email || 'User';
      }
    } else {
      guestNav.style.display = 'flex';
      authNav.style.display = 'none';
    }
  }
}

/**
 * Setup Login Form Handler
 */
function setupLoginForm() {
  const form = document.getElementById('login-form');
  const errorBox = document.getElementById('login-error');
  const submitBtn = document.getElementById('login-submit-btn');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errorBox) {
      errorBox.style.display = 'none';
      errorBox.textContent = '';
    }

    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;

    if (!email || !password) {
      showFormError(errorBox, 'Please enter both email and password.');
      return;
    }

    // Set loading state
    setButtonLoading(submitBtn, true, 'Signing in...');

    try {
      const res = await authAPI.login(email, password);

      if (res.success && res.data?.token) {
        // Store token and user profile in localStorage
        Auth.setSession(res.data.token, res.data.user);
        form.reset();
        showAlert('Welcome back! Login successful.', 'success');
        window.location.hash = '#/dashboard';
      } else {
        const errorMsg = Auth.formatError(res);
        showFormError(errorBox, errorMsg);
      }
    } catch (err) {
      showFormError(errorBox, err.message || 'Login failed. Please try again.');
    } finally {
      setButtonLoading(submitBtn, false, 'Sign In');
    }
  });
}

/**
 * Setup Register Form Handler
 */
function setupRegisterForm() {
  const form = document.getElementById('register-form');
  const errorBox = document.getElementById('register-error');
  const submitBtn = document.getElementById('register-submit-btn');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (errorBox) {
      errorBox.style.display = 'none';
      errorBox.textContent = '';
    }

    const fullName = document.getElementById('register-name').value.trim();
    const email = document.getElementById('register-email').value.trim();
    const password = document.getElementById('register-password').value;
    const phone = document.getElementById('register-phone').value.trim();

    if (!fullName || !email || !password) {
      showFormError(errorBox, 'Full Name, Email, and Password are required.');
      return;
    }

    if (password.length < 6) {
      showFormError(errorBox, 'Password must be at least 6 characters long.');
      return;
    }

    // Set loading state
    setButtonLoading(submitBtn, true, 'Creating Account...');

    try {
      const payload = { fullName, email, password };
      if (phone) payload.phone = phone;

      const res = await authAPI.register(payload);

      if (res.success && res.data?.token) {
        // Store token, user, and optionally wallet in localStorage
        Auth.setSession(res.data.token, res.data.user);
        if (res.data.wallet) {
          localStorage.setItem('paynext_wallet', JSON.stringify(res.data.wallet));
        }
        form.reset();
        showAlert('Account created successfully! Welcome to payNEXT.', 'success');
        window.location.hash = '#/dashboard';
      } else {
        const errorMsg = Auth.formatError(res);
        showFormError(errorBox, errorMsg);
      }
    } catch (err) {
      showFormError(errorBox, err.message || 'Registration failed. Please try again.');
    } finally {
      setButtonLoading(submitBtn, false, 'Create Account');
    }
  });
}

/**
 * Setup Logout Button Handlers
 */
function setupLogoutButtons() {
  document.querySelectorAll('.btn-logout').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      Auth.logout();
      showAlert('You have been logged out safely.', 'info');
    });
  });
}

/**
 * Load and display Dashboard Data
 */
async function loadDashboardData() {
  const cachedUser = Auth.getUser();
  const token = Auth.getToken();

  // Populate cached data first
  if (cachedUser) {
    renderUserData(cachedUser);
  }

  // Render Token Security status
  renderTokenSecurity(token);

  // Fetch fresh profile from API /api/v1/auth/me
  try {
    const res = await authAPI.getMe();
    if (res.success && res.data) {
      Auth.setSession(token, res.data);
      renderUserData(res.data);
    }
  } catch (error) {
    console.error('Failed to load fresh user data:', error);
  }
}

/**
 * Render user profile info in dashboard
 */
function renderUserData(user) {
  const nameEl = document.getElementById('dash-user-name');
  const emailEl = document.getElementById('dash-user-email');
  const roleEl = document.getElementById('dash-user-role');
  const phoneEl = document.getElementById('dash-user-phone');
  const idEl = document.getElementById('dash-user-id');

  if (nameEl) nameEl.textContent = user.fullName || user.email || 'N/A';
  if (emailEl) emailEl.textContent = user.email || 'N/A';
  if (roleEl) roleEl.textContent = (user.role || 'user').toUpperCase();
  if (phoneEl) phoneEl.textContent = user.phone || 'None provided';
  if (idEl) idEl.textContent = user.id ? `UID-${user.id}` : 'N/A';

  // Check stored wallet preview
  const cachedWallet = localStorage.getItem('paynext_wallet');
  const walletEl = document.getElementById('dash-wallet-number');
  if (walletEl) {
    if (cachedWallet) {
      try {
        const w = JSON.parse(cachedWallet);
        walletEl.textContent = w.wallet_number || 'PAYNX-' + String(w.id || '000000').padStart(6, '0');
      } catch (e) {
        walletEl.textContent = 'PAYNX-ACTIVE';
      }
    } else {
      walletEl.textContent = 'PAYNX-READY';
    }
  }
}

/**
 * Render Token Security Verification card
 */
function renderTokenSecurity(token) {
  const tokenPreviewEl = document.getElementById('dash-token-preview');
  if (tokenPreviewEl && token) {
    const parts = token.split('.');
    if (parts.length === 3) {
      tokenPreviewEl.textContent = `${parts[0]}.${parts[1].substring(0, 15)}...[PROTECTED_SIGNATURE]`;
    } else {
      tokenPreviewEl.textContent = token.substring(0, 25) + '...';
    }
  }
}

/**
 * Setup Dashboard Actions
 */
function setupDashboardActions() {
  const copyBtn = document.getElementById('copy-token-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', () => {
      const token = Auth.getToken();
      if (token) {
        navigator.clipboard.writeText(token).then(() => {
          showAlert('Bearer token copied to clipboard!', 'success');
        }).catch(() => {
          showAlert('Could not copy token automatically.', 'warning');
        });
      }
    });
  }
}

/**
 * UI Utilities
 */
function showFormError(el, message) {
  if (!el) return;
  el.textContent = message;
  el.style.display = 'block';
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function setButtonLoading(btn, isLoading, text) {
  if (!btn) return;
  btn.disabled = isLoading;
  btn.innerHTML = isLoading ? `<span class="spinner"></span> ${text}` : text;
}

function showAlert(message, type = 'info') {
  const alertContainer = document.getElementById('global-toast-container');
  if (!alertContainer) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `
    <span>${message}</span>
    <button class="toast-close" onclick="this.parentElement.remove()">&times;</button>
  `;

  alertContainer.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 400);
  }, 4000);
}

// Health check integration
window.checkHealth = async function () {
  const result = document.getElementById('healthResult');
  if (!result) return;

  try {
    result.textContent = 'Checking services...';
    const webRes = await fetch('/healthz');
    const webText = webRes.ok ? await webRes.text() : `Failed (${webRes.status})`;

    const apiRes = await authAPI.getHealth();
    const apiStatus = apiRes.success ? 'OK (paynext-api online)' : `API error (${apiRes.error || apiRes.status || 'offline'})`;

    result.textContent = `Web Server: ${webText} | API Server: ${apiStatus}`;
  } catch (error) {
    result.textContent = 'Health check error: ' + error.message;
  }
};
