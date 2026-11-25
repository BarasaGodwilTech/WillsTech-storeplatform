/**
 * auth-service.js — Centralized authentication service
 * Will's Tech Store Authentication System
 *
 * Talks to our own backend (backend/src/routes/auth.routes.js) instead of
 * Firebase Auth. Keeps the same public method names and user-object shape
 * (uid, email, displayName, phoneNumber, photoURL) that auth-ui.js and
 * auth-init.js already expect, so those two files didn't need to change.
 *
 * Exposed to window.AuthService for use across all pages.
 */

const TOKEN_KEY = 'willstech_token';

function mapUser(apiUser) {
  if (!apiUser) return null;
  return {
    uid: apiUser.id,
    email: apiUser.email,
    displayName: apiUser.name,
    phoneNumber: apiUser.phone || null,
    photoURL: apiUser.photoUrl || null,
  };
}

async function apiCall(path, options = {}) {
  // Uses window.apiFetch from js/api-config.js (loaded on every page before
  // this module runs, since module scripts are deferred). It already
  // attaches the Authorization header from localStorage and throws a
  // readable Error on non-2xx responses.
  return window.apiFetch(path, options);
}

const AuthService = {
  _currentUser: undefined, // undefined = not yet resolved; null = resolved, logged out
  _listeners: [],

  _notify(user) {
    this._currentUser = user;
    this._listeners.forEach((cb) => {
      try { cb(user); } catch (e) { console.error('[Auth] listener error:', e); }
    });
  },

  async _init() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) {
      this._notify(null);
      return;
    }
    try {
      const data = await apiCall('/auth/me');
      this._notify(mapUser(data.user));
    } catch (e) {
      // Token missing/expired/invalid, or the account no longer exists.
      localStorage.removeItem(TOKEN_KEY);
      this._notify(null);
    }
  },

  /**
   * Sign up with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @param {string} displayName - User display name
   * @returns {Promise<Object>} User object
   */
  async signUp(email, password, displayName) {
    try {
      const data = await apiCall('/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name: displayName, email, password }),
      });
      localStorage.setItem(TOKEN_KEY, data.token);
      const user = mapUser(data.user);
      this._notify(user);
      return user;
    } catch (error) {
      throw this._handleError(error);
    }
  },

  /**
   * Sign in with email and password
   * @param {string} email - User email
   * @param {string} password - User password
   * @returns {Promise<Object>} User object
   */
  async signIn(email, password) {
    try {
      const data = await apiCall('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem(TOKEN_KEY, data.token);
      const user = mapUser(data.user);
      this._notify(user);
      return user;
    } catch (error) {
      throw this._handleError(error);
    }
  },

  /**
   * Google sign-in isn't wired up on this backend yet (it would need a
   * Google OAuth client + server-side ID token verification). Fails
   * clearly rather than pretending to work — auth-ui.js hides the Google
   * buttons on load, so this only matters if something calls it directly.
   * @returns {Promise<Object>}
   */
  async signInWithGoogle() {
    throw new Error('Sign-in with Google isn\'t available yet — please use your email and password.');
  },

  /**
   * Sign out current user
   * @returns {Promise<void>}
   */
  async signOut() {
    localStorage.removeItem(TOKEN_KEY);
    this._clearUserData();
    this._notify(null);
  },

  /**
   * Request a password reset link. The backend always responds with a
   * generic success message (so this can't be used to probe which emails
   * have accounts); see auth.routes.js for the email-provider note.
   * @param {string} email - User email
   * @returns {Promise<void>}
   */
  async resetPassword(email) {
    try {
      const data = await apiCall('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      if (data && data.devResetLink) {
        console.log('[Auth][dev only] Password reset link:', data.devResetLink);
      }
    } catch (error) {
      throw this._handleError(error);
    }
  },

  /**
   * Complete a password reset using the token from the emailed (or, in
   * development, console-logged) link.
   * @param {string} token
   * @param {string} newPassword
   * @returns {Promise<void>}
   */
  async completePasswordReset(token, newPassword) {
    try {
      await apiCall('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, newPassword }),
      });
    } catch (error) {
      throw this._handleError(error);
    }
  },

  /**
   * Update user profile (display name, phone)
   * @param {Object} userData - { displayName, phone }
   * @returns {Promise<void>}
   */
  async updateProfile(userData) {
    try {
      const data = await apiCall('/auth/me', {
        method: 'PUT',
        body: JSON.stringify({ name: userData.displayName, phone: userData.phone }),
      });
      // Update the cached user without re-notifying listeners — this
      // mirrors Firebase's onAuthStateChanged, which doesn't re-fire on a
      // profile update either, so pages don't unexpectedly reload data.
      if (this._currentUser) {
        this._currentUser = { ...this._currentUser, ...mapUser(data.user) };
      }
    } catch (error) {
      throw this._handleError(error);
    }
  },

  /**
   * Update user password
   * @param {string} currentPassword - Current password
   * @param {string} newPassword - New password
   * @returns {Promise<void>}
   */
  async updatePassword(currentPassword, newPassword) {
    try {
      await apiCall('/auth/me/password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
    } catch (error) {
      throw this._handleError(error);
    }
  },

  /**
   * Get current authenticated user
   * @returns {Object|null} User object or null
   */
  getCurrentUser() {
    return this._currentUser || null;
  },

  /**
   * Listen to authentication state changes. Calls back immediately with
   * the current state if it's already known, then again on every future
   * sign-in/out — same contract as Firebase's onAuthStateChanged.
   * @param {Function} callback - Callback function(user)
   * @returns {Function} Unsubscribe function
   */
  onAuthStateChanged(callback) {
    this._listeners.push(callback);
    if (this._currentUser !== undefined) {
      try { callback(this._currentUser); } catch (e) { console.error('[Auth] listener error:', e); }
    }
    return () => {
      this._listeners = this._listeners.filter((cb) => cb !== callback);
    };
  },

  /**
   * Delete user account
   * @returns {Promise<void>}
   */
  async deleteAccount() {
    try {
      await apiCall('/auth/me', { method: 'DELETE' });
      localStorage.removeItem(TOKEN_KEY);
      this._clearUserData();
      this._notify(null);
    } catch (error) {
      throw this._handleError(error);
    }
  },

  /**
   * Turn a thrown error into a user-friendly Error. window.apiFetch already
   * extracts the backend's { error: "message" } into Error.message, so
   * most of the time this just needs to pass it through.
   * @param {Error} error
   * @returns {Error}
   * @private
   */
  _handleError(error) {
    console.error('[Auth Error]', error.message);
    return new Error(error.message || 'An unexpected error occurred. Please try again.');
  },

  /**
   * Clear user-specific localStorage data on logout
   * @private
   */
  _clearUserData() {
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('willstech-')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach((key) => localStorage.removeItem(key));
  },
};

AuthService._init();

// Expose to global scope
window.AuthService = AuthService;

export default AuthService;
