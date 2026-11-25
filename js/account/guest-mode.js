/**
 * guest-mode.js — Guest user experience management
 * Will's Tech Store Account Management System
 * 
 * Handles what guests can/cannot do and prompts for authentication
 * when accessing protected features.
 */

const GuestMode = {
  /**
   * Check if user is authenticated
   * @returns {boolean}
   */
  isAuthenticated() {
    return typeof AuthService !== 'undefined' && AuthService.getCurrentUser() !== null;
  },

  /**
   * Require authentication - show modal or redirect
   * @param {string} feature - Feature name trying to access
   * @param {string} redirectUrl - URL to redirect after login
   * @returns {boolean} Whether user is authenticated
   */
  requireAuth(feature = 'this feature', redirectUrl = null) {
    if (this.isAuthenticated()) {
      return true;
    }

    const currentPath = window.location.pathname + window.location.search;
    const redirect = redirectUrl || currentPath;
    
    // Show authentication prompt modal
    this.showAuthPrompt(feature, redirect);
    return false;
  },

  /**
   * Show authentication prompt modal
   * @param {string} feature - Feature name
   * @param {string} redirectUrl - Redirect after login
   */
  showAuthPrompt(feature, redirectUrl) {
    // Remove existing modal if any
    const existing = document.getElementById('auth-prompt-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'auth-prompt-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal-container">
        <button class="modal-close" aria-label="Close">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
        <div class="modal-icon">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect>
            <path d="M7 11V7a5 5 0 0 1 10 0v4"></path>
          </svg>
        </div>
        <h2 class="modal-title">Sign In Required</h2>
        <p class="modal-message">Please sign in or create an account to access <strong>${feature}</strong>.</p>
        <div class="modal-actions">
          <a href="/login?redirect=${encodeURIComponent(redirectUrl)}" class="btn btn-primary btn-lg">Sign In</a>
          <a href="/register?redirect=${encodeURIComponent(redirectUrl)}" class="btn btn-secondary btn-lg">Create Account</a>
        </div>
        <p class="modal-footer">
          <a href="${redirectUrl}">Continue browsing</a>
        </p>
      </div>
    `;

    document.body.appendChild(modal);

    // Animate in
    setTimeout(() => modal.classList.add('active'), 10);

    // Close handlers
    const closeBtn = modal.querySelector('.modal-close');
    const closeHandler = () => {
      modal.classList.remove('active');
      setTimeout(() => modal.remove(), 300);
    };

    closeBtn.addEventListener('click', closeHandler);
    modal.addEventListener('click', (e) => {
      if (e.target === modal) closeHandler();
    });

    // ESC key
    const escHandler = (e) => {
      if (e.key === 'Escape') {
        closeHandler();
        document.removeEventListener('keydown', escHandler);
      }
    };
    document.addEventListener('keydown', escHandler);
  },

  /**
   * Add item to guest cart (session storage)
   * @param {Object} product - Product to add
   * @param {number} quantity - Quantity
   */
  addToGuestCart(product, quantity = 1) {
    // One cart for everyone: guests and signed-in customers share the device cart (see js/cart.js).
    if (typeof Cart !== 'undefined') Cart.addItem(product, quantity);
  },

  /**
   * Update guest cart badge
   */
  updateGuestCartBadge() {
    if (typeof Cart !== 'undefined') Cart.updateBadge();
  },

  /**
   * Get guest cart
   * @returns {Array} Cart items
   */
  getGuestCart() {
    return typeof Cart !== 'undefined' ? Cart.getItems() : [];
  },

  /**
   * Clear guest cart
   */
  clearGuestCart() {
    /* no separate guest cart any more */
  },

  /**
   * Show "Sign in for better experience" banner
   */
  showSignInBanner() {
    // Intentionally empty: signing in is offered in the header, at checkout and when saving to the wishlist, not as a pop-up banner.
  },

  /**
   * Protect checkout flow
   */
  protectCheckout() {
    const checkoutBtn = document.getElementById('checkout-btn');
    if (!checkoutBtn) return;

    checkoutBtn.addEventListener('click', (e) => {
      if (!this.isAuthenticated()) {
        e.preventDefault();
        this.requireAuth('checkout', '/cart');
      }
    });
  },

  /**
   * Protect wishlist actions
   */
  protectWishlist() {
    // This will be called when user tries to add to wishlist
    // The actual protection happens in product.js or wishlist-manager.js
  },

  /**
   * Initialize guest mode protections
   */
  init() {
    // Show banner on homepage
    if (window.location.pathname === '/') {
      this.showSignInBanner();
    }

    // Update cart badge if guest
    if (!this.isAuthenticated()) {
      this.updateGuestCartBadge();
    }

    // Protect checkout
    this.protectCheckout();
  }
};

// Expose to global scope
window.GuestMode = GuestMode;

export default GuestMode;
