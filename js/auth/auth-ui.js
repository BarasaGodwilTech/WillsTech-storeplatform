/**
 * auth-ui.js — UI handlers for authentication & account management
 * Will's Tech Store — Production-Ready with Firestore
 * 
 * Handles all authentication page UI interactions, account management,
 * and Firestore integration for real cross-device data sync.
 */

import FirestoreService from '../account/firestore-service.js';
import GuestMode from '../account/guest-mode.js';

const AuthUI = {

  // ── LOGIN PAGE ────────────────────────────────────────────
  initLoginPage() {
    const loginForm = document.getElementById('login-form');
    if (!loginForm) return;

    this.redirectIfAuthenticated('pages/account.html');

    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');
    const submitBtn = document.getElementById('login-submit-btn');
    const googleBtn = document.getElementById('login-google-btn');
    const errorDiv = document.getElementById('login-error');

    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = emailInput.value.trim();
      const password = passwordInput.value;

      if (!this.validateEmail(email)) { this.showError(errorDiv, 'Please enter a valid email address.'); return; }
      if (!password) { this.showError(errorDiv, 'Please enter your password.'); return; }

      this.showLoading(submitBtn, 'Signing in...');
      this.hideError(errorDiv);

      try {
        await AuthService.signIn(email, password);
        showNotification('Successfully logged in!', 'success');
        const params = new URLSearchParams(window.location.search);
        window.location.href = params.get('redirect') || 'pages/account.html';
      } catch (error) {
        this.showError(errorDiv, error.message);
      } finally {
        this.hideLoading(submitBtn, 'Sign In');
      }
    });

    if (googleBtn) {
      // Google sign-in isn't wired up on the backend yet — hide the
      // button and its "or continue with" divider rather than leaving a
      // dead-end control. See AuthService.signInWithGoogle().
      const divider = googleBtn.previousElementSibling;
      if (divider && divider.classList.contains('auth-divider')) divider.style.display = 'none';
      googleBtn.style.display = 'none';
    }

    this.initPasswordToggle('login-password', 'login-toggle-password');
  },

  // ── REGISTER PAGE ─────────────────────────────────────────
  initRegisterPage() {
    const registerForm = document.getElementById('register-form');
    if (!registerForm) return;

    this.redirectIfAuthenticated('pages/account.html');

    const nameInput = document.getElementById('register-name');
    const emailInput = document.getElementById('register-email');
    const passwordInput = document.getElementById('register-password');
    const confirmInput = document.getElementById('register-confirm');
    const termsCheckbox = document.getElementById('register-terms');
    const submitBtn = document.getElementById('register-submit-btn');
    const googleBtn = document.getElementById('register-google-btn');
    const errorDiv = document.getElementById('register-error');
    const strengthMeter = document.getElementById('password-strength-meter');
    const strengthText = document.getElementById('password-strength-text');

    if (passwordInput && strengthMeter) {
      passwordInput.addEventListener('input', () => {
        const strength = this.checkPasswordStrength(passwordInput.value);
        this.updatePasswordStrength(strengthMeter, strengthText, strength);
      });
    }

    registerForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const displayName = nameInput.value.trim();
      const email = emailInput.value.trim();
      const password = passwordInput.value;
      const confirmPassword = confirmInput.value;

      if (!displayName || displayName.length < 2) { this.showError(errorDiv, 'Name must be at least 2 characters.'); return; }
      if (!this.validateEmail(email)) { this.showError(errorDiv, 'Please enter a valid email address.'); return; }
      if (password.length < 6) { this.showError(errorDiv, 'Password must be at least 6 characters.'); return; }
      if (password !== confirmPassword) { this.showError(errorDiv, 'Passwords do not match.'); return; }
      if (!termsCheckbox.checked) { this.showError(errorDiv, 'Please agree to the Terms and Conditions.'); return; }

      this.showLoading(submitBtn, 'Creating account...');
      this.hideError(errorDiv);

      try {
        await AuthService.signUp(email, password, displayName);
        showNotification('Account created!', 'success');
        window.location.href = 'pages/account.html';
      } catch (error) {
        this.showError(errorDiv, error.message);
      } finally {
        this.hideLoading(submitBtn, 'Create Account');
      }
    });

    if (googleBtn) {
      const divider = googleBtn.previousElementSibling;
      if (divider && divider.classList.contains('auth-divider')) divider.style.display = 'none';
      googleBtn.style.display = 'none';
    }

    this.initPasswordToggle('register-password', 'register-toggle-password');
    this.initPasswordToggle('register-confirm', 'register-toggle-confirm');
  },

  // ── ACCOUNT PAGE (FULL INTEGRATION) ───────────────────────
  async initAccountPage() {
    this.requireAuth('login.html');

    AuthService.onAuthStateChanged(async (user) => {
      if (!user) return;

      this.initAccountTabs();
      this.loadSidebarUserInfo(user);
      this.loadProfileSection(user);
      this.initSecurityForm();
      this.initLogoutButton();
      this.initDeleteAccountButton();

      // Load all Firestore data
      await this._loadAccountData(user);
    });
  },

  async _loadAccountData(user) {
    const uid = user.uid;

    // Load everything in parallel
    const [orders, wishlistIds, addresses, paymentMethods, preferences, loginHistory, stats] = await Promise.all([
      FirestoreService.getOrders(uid),
      FirestoreService.getWishlist(uid),
      FirestoreService.getAddresses(uid),
      FirestoreService.getPaymentMethods(uid),
      FirestoreService.getPreferences(uid),
      FirestoreService.getLoginHistory(uid),
      FirestoreService.getAccountStats(uid)
    ]);

    this._renderOverview(user, stats);
    this._renderOrders(orders);
    this._renderWishlist(wishlistIds);
    this._renderAddresses(uid, addresses);
    this._renderPaymentMethods(uid, paymentMethods);
    this._renderNotificationPreferences(uid, preferences);
    this._renderLoginHistory(loginHistory);
    this._initAddressForm(uid);
    this._initPaymentForm(uid);
    this._initExportButton(uid);
  },

  // ── DATA EXPORT ──────────────────────────────────────────
  _initExportButton(uid) {
    const btn = document.getElementById('export-data-btn');
    if (!btn) return;
    btn.addEventListener('click', async () => {
      this.showLoading(btn, 'Preparing download...');
      try {
        const data = await FirestoreService.exportAllData(uid);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'willstech-my-data-' + Date.now() + '.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showNotification('Data downloaded!', 'success');
      } catch (e) {
        showNotification('Export failed: ' + e.message, 'error');
      } finally {
        this.hideLoading(btn, 'Download My Data');
      }
    });
  },

  // ── OVERVIEW DASHBOARD ────────────────────────────────────
  _renderOverview(user, stats) {
    const container = document.getElementById('account-overview-stats');
    if (!container) return;

    container.innerHTML = `
      <div class="account-stats-grid">
        <div class="account-stat-card">
          <div class="stat-icon" style="background:#3b82f620; color:#3b82f6;"><i class="fa-solid fa-box-open"></i></div>
          <div class="stat-value">${stats.totalOrders}</div>
          <div class="stat-label">Total Orders</div>
        </div>
        <div class="account-stat-card">
          <div class="stat-icon" style="background:#10b98120; color:#10b981;"><i class="fa-solid fa-wallet"></i></div>
          <div class="stat-value">${formatPrice(stats.totalSpent)}</div>
          <div class="stat-label">Total Spent</div>
        </div>
        <div class="account-stat-card">
          <div class="stat-icon" style="background:#f59e0b20; color:#f59e0b;"><i class="fa-solid fa-heart"></i></div>
          <div class="stat-value">${stats.wishlistItems}</div>
          <div class="stat-label">Wishlist Items</div>
        </div>
        <div class="account-stat-card">
          <div class="stat-icon" style="background:${stats.tier.color}20; color:${stats.tier.color};"><i class="fa-solid ${String(stats.tier.icon).startsWith('fa-') ? stats.tier.icon : 'fa-medal'}"></i></div>
          <div class="stat-value">${stats.tier.name}</div>
          <div class="stat-label">Member Tier</div>
        </div>
      </div>
      <div style="margin-top:var(--space-lg); padding:var(--space-md); background:var(--bg-surface); border-radius:var(--radius);">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="color:var(--text-secondary); font-size:0.9rem;">Profile Completion</span>
          <strong>${stats.completion}%</strong>
        </div>
        <div style="height:8px; background:var(--bg-surface); border-radius:4px; overflow:hidden; border:1px solid var(--border);">
          <div style="width:${stats.completion}%; height:100%; background:var(--accent); border-radius:4px; transition:width 0.5s;"></div>
        </div>
      </div>
    `;
  },

  // ── ORDERS ────────────────────────────────────────────────
  _renderOrders(orders) {
    const container = document.getElementById('orders-list');
    if (!container) return;

    if (orders.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-box-open" aria-hidden="true"></i>
          <h3>No orders yet</h3>
          <p>Start shopping to see your orders here.</p>
          <a href="shop.html" class="btn btn-primary btn-sm">Browse Products</a>
        </div>`;
      return;
    }

    container.innerHTML = orders.map(order => {
      const statusColors = {
        pending: '#f59e0b', confirmed: '#3b82f6', shipped: '#8b5cf6',
        completed: '#10b981', cancelled: '#ef4444'
      };
      const statusIcons = {
        pending: 'fa-clock', confirmed: 'fa-circle-check', shipped: 'fa-truck-fast', completed: 'fa-box-open', cancelled: 'fa-ban'
      };
      const color = statusColors[order.status] || '#6b7280';
      const icon = statusIcons[order.status] || 'fa-circle';
      const date = WT.date(order.createdAt);

      return `
        <div class="order-card">
          <div class="order-header">
            <div>
              <strong>Order ${this._escapeHtml(order.orderNumber || ('#' + order.id.substring(0, 8).toUpperCase()))}</strong>
              <span class="order-date">${date}</span>
            </div>
            <span class="order-status" style="background:${color}20; color:${color};"><i class="fa-solid ${icon}"></i> ${typeof WT.statusLabel === 'function' ? WT.statusLabel(order.status) : order.status}</span>
          </div>
          <div class="order-items">
            ${order.items.map(item => `
              <div class="order-item">
                <img src="${this._escapeHtml(WT.img(item.image))}" data-fallback="${this._escapeHtml(WT.imgOriginal(item.image))}" alt="${this._escapeHtml(item.name)}" loading="lazy">
                <div>
                  <strong>${this._escapeHtml(item.name)}</strong>
                  <span>Qty: ${item.quantity}</span>
                </div>
                <span class="order-item-price">${formatPrice(item.price * item.quantity)}</span>
              </div>
            `).join('')}
          </div>
          <div class="order-total">
            <span>Total</span>
            <strong>${formatPrice(order.total)}</strong>
          </div>
          <div class="order-actions">
            <a class="btn btn-sm btn-dark" href="track-order.html?number=${encodeURIComponent(order.orderNumber || '')}&contact=${encodeURIComponent(order.customerPhone || order.customerEmail || '')}"><i class="fa-solid fa-truck-fast"></i> Track</a>
            <button class="btn btn-sm btn-secondary reorder-btn" data-order-id="${order.id}"><i class="fa-solid fa-rotate-right"></i> Buy again</button>
            ${order.status === 'pending' ? `<button class="btn btn-sm btn-outline-danger cancel-order-btn" data-order-id="${order.id}">Cancel</button>` : ''}
          </div>
        </div>`;
    }).join('');

    // Buy again: put the items back in the cart
    container.querySelectorAll('.reorder-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const o = orders.find(x => x.id === btn.dataset.orderId); if (!o) return;
        o.items.forEach(i => Cart.addItem({ id: i.productId, name: i.name, price: i.price, images: [i.image] }, i.quantity, { silent: true }));
        showNotification('Items added to your cart', 'success', { label: 'View cart', href: 'cart.html' });
      });
    });

    // Cancel order handlers
    container.querySelectorAll('.cancel-order-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const orderId = btn.dataset.orderId;
        if (!confirm('Cancel this order?')) return;
        const user = AuthService.getCurrentUser();
        const cancelled = await FirestoreService.cancelOrder(user.uid, orderId);
        showNotification(cancelled ? 'Order cancelled' : 'Could not cancel this order', cancelled ? 'success' : 'error');
        const orders = await FirestoreService.getOrders(user.uid);
        this._renderOrders(orders);
      });
    });
  },

  // ── WISHLIST ──────────────────────────────────────────────
  async _renderWishlist(wishlistIds) {
    const container = document.getElementById('wishlist-grid');
    if (!container) return;
    if (!this._wlBound) { this._wlBound = true; document.addEventListener('wt:wishlist-changed', (e) => { if (document.getElementById('wishlist-grid') && e.detail) this._renderWishlist(e.detail.list); }); }

    if (wishlistIds.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-heart" aria-hidden="true"></i>
          <h3>Your wishlist is empty</h3>
          <p>Save products you love to your wishlist.</p>
          <a href="shop.html" class="btn btn-primary btn-sm">Start shopping</a>
        </div>`;
      return;
    }

    if (typeof Products !== 'undefined') {
      const products = wishlistIds.map(id => Products.getProductById(id)).filter(p => p && p.status === 'active');
      if (products.length === 0) {
        container.innerHTML = '<p class="text-muted">Those products are no longer available.</p>';
        return;
      }
      // Products.render also paints the hearts (they are all "saved" here) and fades the photos in.
      Products.render(container, products);
    } else {
      container.innerHTML = '<p class="text-muted">Products not loaded.</p>';
    }
  },

  // ── ADDRESSES ─────────────────────────────────────────────
  _renderAddresses(uid, addresses) {
    const container = document.getElementById('addresses-list');
    if (!container) return;

    if (addresses.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-location-dot" aria-hidden="true"></i>
          <h3>No addresses saved</h3>
          <p>Add a shipping or billing address for faster checkout.</p>
        </div>`;
      return;
    }

    container.innerHTML = addresses.map(addr => `
      <div class="address-card">
        <div class="address-card-header">
          <strong>${this._escapeHtml(addr.name)}</strong>
          <div class="address-badges">
            ${addr.isDefault ? '<span class="address-badge address-default">Default</span>' : ''}
            <span class="address-badge address-type">${addr.type || 'shipping'}</span>
          </div>
        </div>
        <div class="address-card-body">
          <p>${this._escapeHtml(addr.street)}</p>
          <p>${this._escapeHtml(addr.city)}${addr.state ? ', ' + this._escapeHtml(addr.state) : ''} ${this._escapeHtml(addr.postalCode || '')}</p>
          <p>${this._escapeHtml(addr.country)}</p>
          <p style="color:var(--text-muted);"><i class="fa-solid fa-phone"></i> ${this._escapeHtml(addr.phone)}</p>
        </div>
        <div class="address-card-actions">
          ${!addr.isDefault ? `<button class="btn btn-sm btn-secondary set-default-addr-btn" data-id="${addr.id}" data-type="${addr.type || 'shipping'}">Set as Default</button>` : ''}
          <button class="btn btn-sm btn-danger delete-addr-btn" data-id="${addr.id}">Delete</button>
        </div>
      </div>
    `).join('');

    // Event handlers
    container.querySelectorAll('.delete-addr-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this address?')) return;
        await FirestoreService.deleteAddress(uid, btn.dataset.id);
        showNotification('Address deleted', 'success');
        const updated = await FirestoreService.getAddresses(uid);
        this._renderAddresses(uid, updated);
      });
    });

    container.querySelectorAll('.set-default-addr-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        await FirestoreService.setDefaultAddress(uid, btn.dataset.id, btn.dataset.type);
        showNotification('Default address updated', 'success');
        const updated = await FirestoreService.getAddresses(uid);
        this._renderAddresses(uid, updated);
      });
    });
  },

  _initAddressForm(uid) {
    const addBtn = document.getElementById('add-address-btn');
    if (!addBtn) return;

    addBtn.addEventListener('click', () => {
      this._showAddressModal(uid);
    });
  },

  _showAddressModal(uid) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-container" style="max-width:500px; padding:var(--space-xl);">
        <button class="modal-close" aria-label="Close">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        <h2 style="margin-bottom:var(--space-lg);">Add New Address</h2>
        <form id="address-form">
          <div class="form-group"><label class="form-label">Full Name *</label><input type="text" class="form-input" name="name" required></div>
          <div class="form-group"><label class="form-label">Phone *</label><input type="tel" class="form-input" name="phone" required placeholder="+256..."></div>
          <div class="form-group"><label class="form-label">Street Address *</label><input type="text" class="form-input" name="street" required></div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-md);">
            <div class="form-group"><label class="form-label">City *</label><input type="text" class="form-input" name="city" required></div>
            <div class="form-group"><label class="form-label">State/Region</label><input type="text" class="form-input" name="state"></div>
          </div>
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-md);">
            <div class="form-group"><label class="form-label">Postal Code</label><input type="text" class="form-input" name="postalCode"></div>
            <div class="form-group"><label class="form-label">Country *</label><input type="text" class="form-input" name="country" value="Uganda" required></div>
          </div>
          <div class="form-group">
            <label class="form-label">Address Type</label>
            <select class="form-input" name="type"><option value="shipping">Shipping</option><option value="billing">Billing</option></select>
          </div>
          <div class="form-group"><label class="preference-item"><input type="checkbox" name="isDefault"><span>Set as default address</span></label></div>
          <button type="submit" class="btn btn-primary" style="width:100%;">Save Address</button>
        </form>
      </div>`;

    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('active'), 10);

    const closeModal = () => { modal.classList.remove('active'); setTimeout(() => modal.remove(), 300); };
    modal.querySelector('.modal-close').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    modal.querySelector('#address-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData);
      data.isDefault = formData.has('isDefault');

      if (!data.name || data.name.trim().length < 2) { showNotification('Name is required', 'error'); return; }
      if (!data.phone || data.phone.length < 10) { showNotification('Valid phone is required', 'error'); return; }

      try {
        await FirestoreService.addAddress(uid, data);
        showNotification('Address added!', 'success');
        closeModal();
        const addresses = await FirestoreService.getAddresses(uid);
        this._renderAddresses(uid, addresses);
      } catch (error) {
        showNotification('Failed to add address: ' + error.message, 'error');
      }
    });
  },

  // ── PAYMENT METHODS ───────────────────────────────────────
  _renderPaymentMethods(uid, methods) {
    const container = document.getElementById('payment-methods-list');
    if (!container) return;

    if (methods.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <i class="fa-solid fa-wallet" aria-hidden="true"></i>
          <h3>No payment methods saved</h3>
          <p>Save payment methods for faster checkout.</p>
        </div>`;
      return;
    }

    const typeInfo = {
      card: { label: 'Card', icon: '<i class="fa-solid fa-credit-card"></i>', color: '#3b82f6' },
      momo: { label: 'MTN MoMo', icon: '<i class="fa-solid fa-mobile-screen-button"></i>', color: '#ffcc00' },
      airtel: { label: 'Airtel Money', icon: '<i class="fa-solid fa-mobile-screen-button"></i>', color: '#ef4444' },
      bank: { label: 'Bank', icon: '<i class="fa-solid fa-building-columns"></i>', color: '#10b981' }
    };

    container.innerHTML = methods.map(m => {
      const info = typeInfo[m.type] || { label: m.type, icon: '<i class="fa-solid fa-wallet"></i>', color: '#6b7280' };
      let details = '';
      if (m.type === 'card') details = `•••• •••• •••• ${m.last4 || '****'}`;
      else if (m.phoneNumber) details = m.phoneNumber;

      return `
        <div class="payment-card">
          <div class="payment-card-header">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:1.5rem;">${info.icon}</span>
              <strong>${info.label}</strong>
              ${m.isDefault ? '<span class="address-badge address-default">Default</span>' : ''}
            </div>
            <button class="btn btn-sm btn-danger delete-payment-btn" data-id="${m.id}">Delete</button>
          </div>
          ${details ? `<p style="color:var(--text-secondary); margin-top:8px; font-family:monospace;">${details}</p>` : ''}
        </div>`;
    }).join('');

    container.querySelectorAll('.delete-payment-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Delete this payment method?')) return;
        await FirestoreService.deletePaymentMethod(uid, btn.dataset.id);
        showNotification('Payment method deleted', 'success');
        const methods = await FirestoreService.getPaymentMethods(uid);
        this._renderPaymentMethods(uid, methods);
      });
    });
  },

  _initPaymentForm(uid) {
    const addBtn = document.getElementById('add-payment-btn');
    if (!addBtn) return;

    addBtn.addEventListener('click', () => {
      this._showPaymentModal(uid);
    });
  },

  _showPaymentModal(uid) {
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-container" style="max-width:500px; padding:var(--space-xl);">
        <button class="modal-close" aria-label="Close">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        <h2 style="margin-bottom:var(--space-lg);">Add Payment Method</h2>
        <form id="payment-form">
          <div class="form-group">
            <label class="form-label">Payment Type</label>
            <select class="form-input" name="type" id="payment-type-select">
              <option value="card">Credit/Debit Card</option>
              <option value="momo">MTN Mobile Money</option>
              <option value="airtel">Airtel Money</option>
              <option value="bank">Bank Transfer</option>
            </select>
          </div>
          <div id="card-fields">
            <div class="form-group"><label class="form-label">Card Number</label><input type="text" class="form-input" name="cardNumber" placeholder="1234 5678 9012 3456" maxlength="19"></div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-md);">
              <div class="form-group"><label class="form-label">Expiry (MM/YY)</label><input type="text" class="form-input" name="expiry" placeholder="12/25" maxlength="5"></div>
              <div class="form-group"><label class="form-label">CVV</label><input type="text" class="form-input" name="cvv" placeholder="123" maxlength="4"></div>
            </div>
          </div>
          <div id="momo-fields" style="display:none;">
            <div class="form-group"><label class="form-label">Phone Number</label><input type="tel" class="form-input" name="phoneNumber" placeholder="+256 7XX XXX XXX"></div>
          </div>
          <div id="airtel-fields" style="display:none;">
            <div class="form-group"><label class="form-label">Phone Number</label><input type="tel" class="form-input" name="phoneNumber" placeholder="+256 7XX XXX XXX"></div>
          </div>
          <div id="bank-fields" style="display:none;">
            <div class="form-group"><label class="form-label">Bank Name</label><input type="text" class="form-input" name="bankName" placeholder="Bank name"></div>
            <div class="form-group"><label class="form-label">Account Number</label><input type="text" class="form-input" name="accountNumber" placeholder="Account number"></div>
          </div>
          <div class="form-group"><label class="preference-item"><input type="checkbox" name="isDefault"><span>Set as default</span></label></div>
          <button type="submit" class="btn btn-primary" style="width:100%;">Save Payment Method</button>
        </form>
      </div>`;

    document.body.appendChild(modal);
    setTimeout(() => modal.classList.add('active'), 10);

    // Toggle fields based on type
    const typeSelect = modal.querySelector('#payment-type-select');
    typeSelect.addEventListener('change', () => {
      modal.querySelector('#card-fields').style.display = typeSelect.value === 'card' ? 'block' : 'none';
      modal.querySelector('#momo-fields').style.display = typeSelect.value === 'momo' ? 'block' : 'none';
      modal.querySelector('#airtel-fields').style.display = typeSelect.value === 'airtel' ? 'block' : 'none';
      modal.querySelector('#bank-fields').style.display = typeSelect.value === 'bank' ? 'block' : 'none';
    });

    const closeModal = () => { modal.classList.remove('active'); setTimeout(() => modal.remove(), 300); };
    modal.querySelector('.modal-close').addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

    modal.querySelector('#payment-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const data = Object.fromEntries(formData);
      data.isDefault = formData.has('isDefault');

      try {
        await FirestoreService.addPaymentMethod(uid, data);
        showNotification('Payment method added!', 'success');
        closeModal();
        const methods = await FirestoreService.getPaymentMethods(uid);
        this._renderPaymentMethods(uid, methods);
      } catch (error) {
        showNotification('Failed to add payment method: ' + error.message, 'error');
      }
    });
  },

  // ── NOTIFICATION PREFERENCES ──────────────────────────────
  _renderNotificationPreferences(uid, prefs) {
    const container = document.getElementById('notification-preferences-container');
    const privacyContainer = document.getElementById('privacy-settings-container');
    if (!container) return;

    const notifPrefs = prefs?.notifications || {
      orderConfirmations: true, shippingUpdates: true, priceDrops: true,
      newArrivals: false, promotions: false, newsletter: true
    };

    const privacyPrefs = prefs?.privacy || {
      profileVisibility: 'private', orderHistoryVisibility: 'private', searchHistory: true
    };

    container.innerHTML = `
      <form id="notification-prefs-form">
        <div class="preference-group">
          ${[
            ['orderConfirmations', 'Order Confirmations', 'Receive emails when you place an order'],
            ['shippingUpdates', 'Shipping Updates', 'Track your delivery status'],
            ['priceDrops', 'Price Drops', 'Get notified when wishlist items go on sale'],
            ['newArrivals', 'New Arrivals', 'Be first to know about new products'],
            ['promotions', 'Promotions', 'Special offers and discounts'],
            ['newsletter', 'Newsletter', 'Weekly tech news and tips']
          ].map(([key, label, desc]) => `
            <label class="preference-item">
              <input type="checkbox" name="${key}" ${notifPrefs[key] ? 'checked' : ''}>
              <div class="preference-content"><strong>${label}</strong><span>${desc}</span></div>
            </label>
          `).join('')}
        </div>
        <button type="submit" class="btn btn-primary" style="margin-top:var(--space-md);">Save Preferences</button>
      </form>`;

    container.querySelector('#notification-prefs-form').addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const newPrefs = {
        notifications: {
          orderConfirmations: formData.has('orderConfirmations'),
          shippingUpdates: formData.has('shippingUpdates'),
          priceDrops: formData.has('priceDrops'),
          newArrivals: formData.has('newArrivals'),
          promotions: formData.has('promotions'),
          newsletter: formData.has('newsletter')
        },
        privacy: privacyPrefs
      };
      await FirestoreService.updatePreferences(uid, newPrefs);
      showNotification('Notification preferences saved!', 'success');
    });

    // Privacy settings
    if (privacyContainer) {
      privacyContainer.innerHTML = `
        <form id="privacy-prefs-form">
          <div class="form-group">
            <label class="form-label">Profile Visibility</label>
            <select class="form-input" name="profileVisibility">
              <option value="private" ${privacyPrefs.profileVisibility === 'private' ? 'selected' : ''}>Private</option>
              <option value="public" ${privacyPrefs.profileVisibility === 'public' ? 'selected' : ''}>Public</option>
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Order History Visibility</label>
            <select class="form-input" name="orderHistoryVisibility">
              <option value="private" ${privacyPrefs.orderHistoryVisibility === 'private' ? 'selected' : ''}>Private</option>
              <option value="public" ${privacyPrefs.orderHistoryVisibility === 'public' ? 'selected' : ''}>Public</option>
            </select>
          </div>
          <label class="preference-item">
            <input type="checkbox" name="searchHistory" ${privacyPrefs.searchHistory ? 'checked' : ''}>
            <div class="preference-content"><strong>Save Search History</strong><span>Keep your recent searches for easy access</span></div>
          </label>
          <button type="submit" class="btn btn-primary" style="margin-top:var(--space-md);">Save Privacy Settings</button>
        </form>`;

      privacyContainer.querySelector('#privacy-prefs-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const newPrefs = {
          notifications: notifPrefs,
          privacy: {
            profileVisibility: formData.get('profileVisibility'),
            orderHistoryVisibility: formData.get('orderHistoryVisibility'),
            searchHistory: formData.has('searchHistory')
          }
        };
        await FirestoreService.updatePreferences(uid, newPrefs);
        showNotification('Privacy settings saved!', 'success');
      });
    }
  },

  // ── LOGIN HISTORY ─────────────────────────────────────────
  _renderLoginHistory(history) {
    const container = document.getElementById('login-history-list');
    if (!container) return;

    if (history.length === 0) {
      container.innerHTML = '<p style="color:var(--text-muted);">No login history recorded yet.</p>';
      return;
    }

    container.innerHTML = `
      <div style="margin-top:var(--space-md);">
        <h4 style="font-size:0.95rem; margin-bottom:var(--space-sm); color:var(--text-secondary);">Recent Login Activity</h4>
        <div style="max-height:200px; overflow-y:auto;">
          ${history.slice(0, 5).map(entry => {
            const date = new Date(entry.timestamp).toLocaleString();
            const browser = entry.userAgent ? this._getBrowserName(entry.userAgent) : 'Unknown';
            return `<div style="padding:8px 0; border-bottom:1px solid var(--border); font-size:0.85rem;">
              <span style="color:var(--text-muted);">${date}</span> — ${browser}
            </div>`;
          }).join('')}
        </div>
      </div>`;
  },

  _getBrowserName(ua) {
    if (ua.includes('Chrome')) return 'Chrome';
    if (ua.includes('Firefox')) return 'Firefox';
    if (ua.includes('Safari')) return 'Safari';
    if (ua.includes('Edge')) return 'Edge';
    return 'Unknown Browser';
  },

  // ── RESET PASSWORD PAGE ───────────────────────────────────
  initResetPasswordPage() {
    const token = new URLSearchParams(window.location.search).get('token');
    if (token) {
      this._initCompletePasswordResetForm(token);
      return;
    }

    const resetForm = document.getElementById('reset-form');
    if (!resetForm) return;

    const emailInput = document.getElementById('reset-email');
    const submitBtn = document.getElementById('reset-submit-btn');
    const errorDiv = document.getElementById('reset-error');
    const successDiv = document.getElementById('reset-success');

    resetForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = emailInput.value.trim();
      if (!this.validateEmail(email)) { this.showError(errorDiv, 'Please enter a valid email address.'); return; }

      this.showLoading(submitBtn, 'Sending...');
      this.hideError(errorDiv);

      try {
        await AuthService.resetPassword(email);
        successDiv.style.display = 'flex';
        successDiv.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg><span>If an account exists for that email, a reset link has been sent.</span>`;
        showNotification('Check your email for a reset link.', 'success');
      } catch (error) {
        this.showError(errorDiv, error.message);
      } finally {
        this.hideLoading(submitBtn, 'Send Reset Link');
      }
    });
  },

  // Second step of the reset flow — shown when the page is opened from the
  // emailed (or, in development, console-logged) link with ?token=...
  _initCompletePasswordResetForm(token) {
    const titleEl = document.getElementById('reset-form-title');
    const subtitleEl = document.getElementById('reset-form-subtitle');
    if (titleEl) titleEl.textContent = 'Choose a New Password';
    if (subtitleEl) subtitleEl.textContent = 'Enter and confirm your new password below.';

    const requestForm = document.getElementById('reset-form');
    if (requestForm) requestForm.style.display = 'none';

    const form = document.getElementById('reset-new-password-form');
    if (!form) return;
    form.style.display = '';

    const newInput = document.getElementById('reset-new-password');
    const confirmInput = document.getElementById('reset-confirm-password');
    const submitBtn = document.getElementById('reset-complete-btn');
    const errorDiv = document.getElementById('reset-new-error');
    const successDiv = document.getElementById('reset-new-success');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const newPassword = newInput.value;
      const confirmPassword = confirmInput.value;

      if (newPassword.length < 6) { this.showError(errorDiv, 'Password must be at least 6 characters.'); return; }
      if (newPassword !== confirmPassword) { this.showError(errorDiv, 'Passwords do not match.'); return; }

      this.showLoading(submitBtn, 'Saving...');
      this.hideError(errorDiv);

      try {
        await AuthService.completePasswordReset(token, newPassword);
        successDiv.style.display = 'flex';
        successDiv.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Password updated! Redirecting to sign in...</span>`;
        showNotification('Password updated!', 'success');
        form.reset();
        setTimeout(() => { window.location.href = 'login.html'; }, 1800);
      } catch (error) {
        this.showError(errorDiv, error.message);
      } finally {
        this.hideLoading(submitBtn, 'Set New Password');
      }
    });
  },

  // ── HEADER AUTH STATE ─────────────────────────────────────
  updateHeaderAuthState(user) {
    const accountBtn = document.getElementById('account-btn');
    const accountAvatar = document.getElementById('account-avatar');
    const accountIcon = document.querySelector('#account-btn .account-icon');
    if (!accountBtn) return;

    if (user) {
      if (accountAvatar && user.photoURL) {
        accountAvatar.src = user.photoURL;
        accountAvatar.alt = user.displayName || 'User';
        accountAvatar.style.display = 'block';
        if (accountIcon) accountIcon.style.display = 'none';
      } else if (accountIcon) {
        accountIcon.style.display = 'block';
      }
      accountBtn.setAttribute('aria-label', `My account - ${user.displayName || user.email}`);
    } else {
      if (accountAvatar) accountAvatar.style.display = 'none';
      if (accountIcon) accountIcon.style.display = 'block';
      accountBtn.setAttribute('aria-label', 'My account');
    }
  },

  // ── UTILITIES ─────────────────────────────────────────────
  showLoading(button, text = 'Loading...') {
    if (!button) return;
    button.disabled = true;
    button.dataset.originalText = button.textContent;
    button.innerHTML = `<span class="auth-spinner"></span> ${text}`;
  },

  hideLoading(button, text) {
    if (!button) return;
    button.disabled = false;
    button.textContent = text || button.dataset.originalText || 'Submit';
  },

  showError(errorDiv, message) {
    if (!errorDiv) return;
    errorDiv.style.display = 'flex';
    errorDiv.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg><span>${message}</span>`;
  },

  hideError(errorDiv) {
    if (!errorDiv) return;
    errorDiv.style.display = 'none';
    errorDiv.innerHTML = '';
  },

  redirectIfAuthenticated(redirectUrl) {
    const user = AuthService.getCurrentUser();
    if (user) window.location.href = redirectUrl;
  },

  requireAuth(loginUrl) {
    let authInitialized = false;
    let authCheckComplete = false;

    // Check current user state immediately (may be null if auth not initialized yet)
    const currentUser = AuthService.getCurrentUser();
    
    // Listen for auth state changes
    AuthService.onAuthStateChanged((user) => {
      authInitialized = true;
      
      if (!authCheckComplete) {
        authCheckComplete = true;
        
        // Only redirect if user is not authenticated after auth is initialized
        if (!user) {
          const currentPath = window.location.pathname + window.location.search;
          window.location.href = `${loginUrl}?redirect=${encodeURIComponent(currentPath)}`;
        }
      } else {
        // Handle logout after initial check
        if (!user) {
          const currentPath = window.location.pathname + window.location.search;
          window.location.href = `${loginUrl}?redirect=${encodeURIComponent(currentPath)}`;
        }
      }
    });

    // If auth is already initialized and user is not logged in, redirect immediately
    if (currentUser) {
      // User is logged in, no redirect needed
      return;
    }
    // If currentUser is null, we wait for onAuthStateChanged to complete the check
  },

  initAccountTabs() {
    const tabBtns = document.querySelectorAll('.account-nav-item[data-tab]');
    const tabPanels = document.querySelectorAll('.account-panel');

    tabBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;
        tabBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        tabPanels.forEach(panel => {
          panel.classList.remove('active');
          if (panel.id === `${tabId}-panel`) panel.classList.add('active');
        });
      });
    });

    const tabParam = new URLSearchParams(window.location.search).get('tab');
    if (tabParam) {
      const targetBtn = Array.from(tabBtns).find(b => b.dataset.tab === tabParam);
      if (targetBtn) targetBtn.click();
    }
  },

  loadSidebarUserInfo(user) {
    const avatarImg = document.getElementById('account-avatar-img');
    const avatarPlaceholder = document.getElementById('account-avatar-placeholder');
    const userName = document.getElementById('sidebar-user-name');
    const userEmail = document.getElementById('sidebar-user-email');

    if (user.photoURL && avatarImg) {
      avatarImg.src = user.photoURL;
      avatarImg.style.display = 'block';
      if (avatarPlaceholder) avatarPlaceholder.style.display = 'none';
    } else if (avatarPlaceholder && user.displayName) {
      avatarPlaceholder.textContent = user.displayName.charAt(0).toUpperCase();
    }
    if (userName) userName.textContent = user.displayName || 'User';
    if (userEmail) userEmail.textContent = user.email || '';
  },

  loadProfileSection(user) {
    const nameInput = document.getElementById('profile-name');
    const emailDisplay = document.getElementById('profile-email');
    const photoPreview = document.getElementById('profile-photo-preview');
    const photoInput = document.getElementById('profile-photo-input');
    const saveBtn = document.getElementById('profile-save-btn');
    const errorDiv = document.getElementById('profile-error');
    const successDiv = document.getElementById('profile-success');

    if (nameInput) nameInput.value = user.displayName || '';
    if (emailDisplay) emailDisplay.textContent = user.email || '';
    if (photoPreview && user.photoURL) photoPreview.src = user.photoURL;

    if (photoInput) {
      photoInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
          const reader = new FileReader();
          reader.onload = (event) => { photoPreview.src = event.target.result; };
          reader.readAsDataURL(file);
        }
      });
    }

    if (saveBtn) {
      saveBtn.addEventListener('click', async () => {
        const displayName = nameInput.value.trim();
        if (!displayName || displayName.length < 2) { this.showError(errorDiv, 'Name must be at least 2 characters.'); return; }

        this.showLoading(saveBtn, 'Saving...');
        this.hideError(errorDiv);

        try {
          await AuthService.updateProfile({ displayName });
          // Also update Firestore profile
          const uid = AuthService.getCurrentUser().uid;
          await FirestoreService.updateProfile(uid, { displayName });
          
          successDiv.style.display = 'flex';
          successDiv.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Profile updated!</span>`;
          showNotification('Profile updated!', 'success');
        } catch (error) {
          this.showError(errorDiv, error.message);
        } finally {
          this.hideLoading(saveBtn, 'Save Changes');
        }
      });
    }
  },

  initSecurityForm() {
    const form = document.getElementById('security-form');
    if (!form) return;

    const currentInput = document.getElementById('current-password');
    const newInput = document.getElementById('new-password');
    const confirmInput = document.getElementById('confirm-new-password');
    const submitBtn = document.getElementById('update-password-btn');
    const errorDiv = document.getElementById('security-error');
    const successDiv = document.getElementById('security-success');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPassword = currentInput.value;
      const newPassword = newInput.value;
      const confirmPassword = confirmInput.value;

      if (!currentPassword) { this.showError(errorDiv, 'Enter your current password.'); return; }
      if (newPassword.length < 6) { this.showError(errorDiv, 'New password must be at least 6 characters.'); return; }
      if (newPassword !== confirmPassword) { this.showError(errorDiv, 'Passwords do not match.'); return; }

      this.showLoading(submitBtn, 'Updating...');
      this.hideError(errorDiv);

      try {
        await AuthService.updatePassword(currentPassword, newPassword);
        successDiv.style.display = 'flex';
        successDiv.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"></polyline></svg><span>Password updated!</span>`;
        showNotification('Password updated!', 'success');
        form.reset();
      } catch (error) {
        this.showError(errorDiv, error.message);
      } finally {
        this.hideLoading(submitBtn, 'Update Password');
      }
    });
  },

  initLogoutButton() {
    const logoutBtn = document.getElementById('logout-btn');
    if (!logoutBtn) return;

    logoutBtn.addEventListener('click', async () => {
      if (!confirm('Sign out?')) return;
      try {
        await AuthService.signOut();
        showNotification('Signed out!', 'success');
        window.location.href = 'login.html';
      } catch (error) {
        showNotification(error.message, 'error');
      }
    });
  },

  initDeleteAccountButton() {
    const deleteBtn = document.getElementById('delete-account-btn');
    if (!deleteBtn) return;

    deleteBtn.addEventListener('click', async () => {
      if (!confirm('WARNING: This will permanently delete your account and all data. Continue?')) return;
      if (!confirm('FINAL WARNING: Type "DELETE" in the next prompt to confirm.')) return;

      try {
        const uid = AuthService.getCurrentUser().uid;
        await FirestoreService.deleteAllUserData(uid);
        await AuthService.deleteAccount();
        showNotification('Account deleted', 'success');
        window.location.href = '/';
      } catch (error) {
        showNotification(error.message, 'error');
      }
    });
  },

  initPasswordToggle(inputId, toggleId) {
    const input = document.getElementById(inputId);
    const toggle = document.getElementById(toggleId);
    if (!input || !toggle) return;

    toggle.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
    });
  },

  checkPasswordStrength(password) {
    let score = 0;
    if (password.length >= 6) score++;
    if (password.length >= 10) score++;
    if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
    if (/\d/.test(password)) score++;
    if (/[^a-zA-Z0-9]/.test(password)) score++;

    const levels = [
      { score: 0, label: 'Very Weak', color: '#ef4444' },
      { score: 1, label: 'Weak', color: '#f97316' },
      { score: 2, label: 'Fair', color: '#eab308' },
      { score: 3, label: 'Good', color: '#22c55e' },
      { score: 4, label: 'Strong', color: '#10b981' },
      { score: 5, label: 'Very Strong', color: '#06b6d4' }
    ];
    return levels[score] || levels[0];
  },

  updatePasswordStrength(meter, text, strength) {
    if (!meter || !text) return;
    meter.style.width = `${(strength.score / 5) * 100}%`;
    meter.style.backgroundColor = strength.color;
    text.textContent = strength.label;
    text.style.color = strength.color;
  },

  validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  },

  _escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};

window.AuthUI = AuthUI;
export default AuthUI;
