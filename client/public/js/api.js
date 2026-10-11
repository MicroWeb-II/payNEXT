/**
 * payNEXT Centralized API Client
 * Automatically attaches JWT Bearer token from localStorage to all requests.
 * Handles automatic 401 Unauthorized redirect to login.
 */

// Centralized Fetch Interceptor
async function apiRequest(endpoint, options = {}) {
  const token = localStorage.getItem('paynext_token');

  const headers = {
    'Content-Type': 'application/json',
    ...options.headers,
  };

  // Attach Bearer token if it exists
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`/api/v1${endpoint}`, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    // Token expired or invalid, redirect to login
    localStorage.removeItem('paynext_token');
    localStorage.removeItem('paynext_user');
    window.location.hash = '#/login';
  }

  return response.json();
}

// Dedicated Auth API endpoints
const authAPI = {
  /**
   * Log in user
   * @param {string} email
   * @param {string} password
   */
  login: async (email, password) => {
    return apiRequest('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  /**
   * Register new user
   * @param {{ fullName: string, email: string, password: string, phone?: string }} userData
   */
  register: async (userData) => {
    return apiRequest('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  /**
   * Fetch current authenticated user's profile
   */
  getMe: async () => {
    return apiRequest('/auth/me', {
      method: 'GET',
    });
  },

  /**
   * Check system health
   */
  getHealth: async () => {
    return apiRequest('/health', {
      method: 'GET',
    });
  },
};

// Make available globally in the browser
window.apiRequest = apiRequest;
window.authAPI = authAPI;
