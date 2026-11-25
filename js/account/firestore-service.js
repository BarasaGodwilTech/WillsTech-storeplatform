/**
 * firestore-service.js — account data client
 * Will's Tech Store — Production-Ready Account Management
 *
 * Historically named for Firestore; now talks to our own backend
 * (backend/src/routes/account.routes.js and orders.routes.js), which
 * stores everything in Postgres. Kept the filename and the same method
 * names/signatures — including the now-unused leading `uid` parameter —
 * so auth-ui.js and auth-init.js didn't need to change: the backend
 * always scopes data to whoever the request's JWT belongs to, never to a
 * client-supplied id, so the `uid` argument is accepted for compatibility
 * but ignored.
 */

async function apiCall(path, options = {}) {
  return window.apiFetch(path, options);
}

const FirestoreService = {

  // ── PROFILE ──────────────────────────────────────────────
  async getProfile(_uid) {
    const data = await apiCall('/auth/me');
    return data.user;
  },

  async updateProfile(_uid, data) {
    await apiCall('/auth/me', {
      method: 'PUT',
      body: JSON.stringify({ name: data.displayName, phone: data.phone }),
    });
  },

  async getAccountStats(_uid) {
    const stats = await apiCall('/account/stats');
    return {
      totalOrders: stats.totalOrders,
      totalSpent: stats.totalSpent,
      wishlistItems: stats.wishlistItems,
      savedAddresses: stats.savedAddresses,
      savedPaymentMethods: stats.savedPaymentMethods,
      memberSince: stats.memberSince,
      tier: stats.tier,
      completion: stats.completion,
    };
  },

  // ── ADDRESSES ────────────────────────────────────────────
  async getAddresses(_uid) {
    const data = await apiCall('/account/addresses');
    return data.addresses;
  },

  async addAddress(_uid, data) {
    const res = await apiCall('/account/addresses', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.address;
  },

  async deleteAddress(_uid, addressId) {
    await apiCall(`/account/addresses/${addressId}`, { method: 'DELETE' });
  },

  async setDefaultAddress(_uid, addressId, _type) {
    await apiCall(`/account/addresses/${addressId}/default`, { method: 'PATCH' });
  },

  // ── ORDERS ───────────────────────────────────────────────
  async getOrders(_uid) {
    const data = await apiCall('/orders/mine');
    return data.orders;
  },

  async cancelOrder(_uid, orderId, _reason = '') {
    try {
      await apiCall(`/orders/${orderId}/cancel`, { method: 'PATCH' });
      return true;
    } catch (e) {
      return false;
    }
  },

  // ── WISHLIST ─────────────────────────────────────────────
  async getWishlist(_uid) {
    const data = await apiCall('/account/wishlist');
    return data.wishlist;
  },

  async isInWishlist(_uid, productId) {
    const wishlist = await this.getWishlist();
    return wishlist.some((id) => String(id) === String(productId));
  },

  async toggleWishlist(_uid, productId) {
    const data = await apiCall('/account/wishlist/toggle', {
      method: 'POST',
      body: JSON.stringify({ productId }),
    });
    return data.isIn;
  },

  // ── PAYMENT METHODS ──────────────────────────────────────
  async getPaymentMethods(_uid) {
    const data = await apiCall('/account/payment-methods');
    return data.paymentMethods;
  },

  async addPaymentMethod(_uid, data) {
    // Card numbers are masked to last4 server-side and never stored in
    // full — see backend/src/routes/account.routes.js.
    const res = await apiCall('/account/payment-methods', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    return res.paymentMethod;
  },

  async deletePaymentMethod(_uid, methodId) {
    await apiCall(`/account/payment-methods/${methodId}`, { method: 'DELETE' });
  },

  // ── PREFERENCES ──────────────────────────────────────────
  async getPreferences(_uid) {
    const data = await apiCall('/account/preferences');
    return data.preferences;
  },

  async updatePreferences(_uid, preferences) {
    await apiCall('/account/preferences', {
      method: 'PUT',
      body: JSON.stringify(preferences),
    });
  },

  // ── ACTIVITY / SECURITY ──────────────────────────────────
  async recordLogin(_uid, details = {}) {
    try {
      await apiCall('/account/login-history', {
        method: 'POST',
        body: JSON.stringify(details),
      });
    } catch (e) {
      // Non-critical — never block page load over this.
      console.warn('[Account] recordLogin failed:', e.message);
    }
  },

  async getLoginHistory(_uid) {
    const data = await apiCall('/account/login-history');
    return data.history;
  },

  // ── DATA EXPORT / DELETE ─────────────────────────────────
  async exportAllData(_uid) {
    return apiCall('/account/export');
  },

  async deleteAllUserData(_uid) {
    // No-op: AuthService.deleteAccount() (called right after this by
    // auth-ui.js) deletes the user row itself, which cascades to
    // addresses/payment methods/wishlist via their foreign keys. Past
    // orders are kept for business records with their user_id cleared.
    // Kept as a real async method (rather than removing the call site)
    // so auth-ui.js didn't need to change.
  },
};

window.FirestoreService = FirestoreService;
export default FirestoreService;
