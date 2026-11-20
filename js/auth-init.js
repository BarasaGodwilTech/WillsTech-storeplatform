/**
 * auth-init.js — Global authentication initialization
 * Will's Tech Store — Production-Ready
 * 
 * Included on EVERY page. Handles:
 * - Auth state monitoring and header updates
 * - Firestore login recording
 * - Guest mode initialization
 * - Cart merging on login
 * - Checkout protection
 */

import './auth/auth-service.js';
import AuthUI from './auth/auth-ui.js';
import FirestoreService from './account/firestore-service.js';
import GuestMode from './account/guest-mode.js';

(function() {
  'use strict';

  let _accountMenuUser = null;
  let _accountMenuCloseTimer = null;

  function _getPagePath(pageFileName) {
    const isSubpage = window.location.pathname.includes('/pages/');
    return (isSubpage ? '' : 'pages/') + pageFileName;
  }

  function _getRedirectParam() {
    const redirect = window.location.pathname + window.location.search;
    return `redirect=${encodeURIComponent(redirect)}`;
  }

  function _getAccountMenuElements() {
    const btn = document.getElementById('account-btn');
    if (!btn) return null;

    let wrapper = document.getElementById('account-menu');
    let panel = document.getElementById('account-menu-panel');

    if (!wrapper) {
      wrapper = btn.closest('.account-menu');
    }

    if (!panel) {
      panel = document.createElement('div');
      panel.className = 'account-menu-panel';
      panel.id = 'account-menu-panel';
      panel.setAttribute('role', 'menu');
      panel.setAttribute('aria-label', 'Account menu');
      panel.hidden = true;
      if (wrapper) wrapper.appendChild(panel);
    }

    return { wrapper, btn, panel };
  }

  function _renderAccountMenu(panel, user) {
    const accountHref = _getPagePath('account.html');
    const loginHref = `${_getPagePath('login.html')}?${_getRedirectParam()}`;
    const ordersHref = `${accountHref}?tab=orders`;
    const wishlistHref = _getPagePath('wishlist.html');

    const icons = {
      user: '<i class="fa-regular fa-user" aria-hidden="true"></i>',
      box: '<i class="fa-solid fa-box-open" aria-hidden="true"></i>',
      heart: '<i class="fa-regular fa-heart" aria-hidden="true"></i>',
      logout: '<i class="fa-solid fa-arrow-right-from-bracket" aria-hidden="true"></i>',
    };

    if (user) {
      panel.innerHTML = `
        <a class="account-menu-primary" role="menuitem" href="${accountHref}">${icons.user}<span>My Account</span></a>
        <a class="account-menu-item" role="menuitem" href="${ordersHref}">${icons.box}<span>My orders</span></a>
        <a class="account-menu-item" role="menuitem" href="${_getPagePath('track-order.html')}"><i class="fa-solid fa-truck-fast" aria-hidden="true"></i><span>Track an order</span></a>
        <a class="account-menu-item" role="menuitem" href="${wishlistHref}">${icons.heart}<span>Wishlist</span></a>
        <div class="account-menu-divider" role="separator"></div>
        <button type="button" class="account-menu-item" data-action="signout">${icons.logout}<span>Sign Out</span></button>
      `;
      return;
    }

    panel.innerHTML = `
      <a class="account-menu-primary" role="menuitem" href="${loginHref}"><i class="fa-solid fa-right-to-bracket" aria-hidden="true"></i><span>Sign in</span></a>
      <a class="account-menu-item" role="menuitem" href="${_getPagePath('register.html')}"><i class="fa-solid fa-user-plus" aria-hidden="true"></i><span>Create account</span></a>
      <a class="account-menu-item" role="menuitem" href="${_getPagePath('track-order.html')}"><i class="fa-solid fa-truck-fast" aria-hidden="true"></i><span>Track an order</span></a>
    `;
  }

  function _setAccountMenuOpen(isOpen, opts = {}) {
    const { returnFocus = false } = opts;
    const els = _getAccountMenuElements();
    if (!els) return;

    const { btn, panel } = els;

    if (_accountMenuCloseTimer) {
      clearTimeout(_accountMenuCloseTimer);
      _accountMenuCloseTimer = null;
    }

    if (isOpen) {
      _renderAccountMenu(panel, _accountMenuUser);
      panel.hidden = false;
      panel.dataset.open = 'false';
      btn.setAttribute('aria-expanded', 'true');
      requestAnimationFrame(() => {
        panel.dataset.open = 'true';
        const focusTarget = panel.querySelector('.account-menu-primary, .account-menu-item, button.account-menu-item');
        if (focusTarget) focusTarget.focus({ preventScroll: true });
      });
      return;
    }

    panel.dataset.open = 'false';
    btn.setAttribute('aria-expanded', 'false');
    _accountMenuCloseTimer = setTimeout(() => {
      panel.hidden = true;
      if (returnFocus) btn.focus({ preventScroll: true });
    }, 150);
  }

  function _initAccountMenu() {
    const els = _getAccountMenuElements();
    if (!els) return;

    const { wrapper, btn, panel } = els;
    btn.setAttribute('aria-haspopup', 'menu');
    btn.setAttribute('aria-expanded', 'false');
    btn.setAttribute('aria-controls', panel.id);

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      
      // If not logged in, redirect to login page instead of showing dropdown
      if (!_accountMenuUser) {
        const loginHref = `${_getPagePath('login.html')}?${_getRedirectParam()}`;
        window.location.href = loginHref;
        return;
      }
      
      const isOpen = !panel.hidden && panel.dataset.open === 'true';
      _setAccountMenuOpen(!isOpen);
    });

    btn.addEventListener('keydown', (e) => {
      const key = e.key;
      if (key === 'Enter' || key === ' ') {
        e.preventDefault();
        
        // If not logged in, redirect to login page instead of showing dropdown
        if (!_accountMenuUser) {
          const loginHref = `${_getPagePath('login.html')}?${_getRedirectParam()}`;
          window.location.href = loginHref;
          return;
        }
        
        const isOpen = !panel.hidden && panel.dataset.open === 'true';
        _setAccountMenuOpen(!isOpen);
      }
      if (key === 'Escape') {
        e.preventDefault();
        _setAccountMenuOpen(false, { returnFocus: true });
      }
    });

    document.addEventListener('pointerdown', (e) => {
      const isOpen = !panel.hidden && panel.dataset.open === 'true';
      if (!isOpen) return;
      if (wrapper && wrapper.contains(e.target)) return;
      _setAccountMenuOpen(false);
    });

    document.addEventListener('keydown', (e) => {
      const isOpen = !panel.hidden && panel.dataset.open === 'true';
      if (!isOpen) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        _setAccountMenuOpen(false, { returnFocus: true });
      }
    });

    panel.addEventListener('click', async (e) => {
      const signoutBtn = e.target.closest('[data-action="signout"]');
      if (!signoutBtn) return;
      e.preventDefault();

      try {
        if (typeof AuthService !== 'undefined') {
          await AuthService.signOut();
        }
        if (typeof showNotification === 'function') {
          showNotification('Signed out successfully.', 'success');
        }
      } catch (error) {
        if (typeof showNotification === 'function') {
          showNotification(error.message || 'Sign out failed.', 'error');
        }
      } finally {
        _setAccountMenuOpen(false, { returnFocus: true });
      }
    });
  }

  /**
   * Initialize global auth state — runs on every page
   */
  function initGlobalAuth() {
    if (typeof AuthService === 'undefined') {
      AuthUI.updateHeaderAuthState(null);
      GuestMode.init();
      return;
    }

    AuthService.onAuthStateChanged(async (user) => {
      // Update header avatar/info
      AuthUI.updateHeaderAuthState(user);
      _accountMenuUser = user;

      if (user) {
        // Set user-specific cart
        if (typeof Cart !== 'undefined') {
          Cart.setUserId(user.uid);
        }

        // Record login to Firestore (non-blocking)
        try {
          await FirestoreService.recordLogin(user.uid, {
            userAgent: navigator.userAgent,
            page: window.location.pathname
          });
        } catch (e) {
          // Silently fail — don't block page load
          console.warn('[Auth] Login recording failed:', e.message);
        }

      } else {
        // Initialize guest mode for non-authenticated users
        GuestMode.init();
      }
    });
  }

  /**
   * Protect checkout — require login for placing orders
   */
  function protectCheckout() {
    const checkoutBtn = document.getElementById('checkout-btn');
    if (!checkoutBtn) return;

    // Clone to remove existing listeners
    const newBtn = checkoutBtn.cloneNode(true);
    checkoutBtn.parentNode.replaceChild(newBtn, checkoutBtn);

    newBtn.addEventListener('click', (e) => {
      const user = typeof AuthService !== 'undefined' ? AuthService.getCurrentUser() : null;

      if (!user) {
        e.preventDefault();
        const redirect = window.location.pathname + window.location.search;
        const isSubpage = window.location.pathname.includes('/pages/');
        const loginPath = isSubpage ? 'login.html' : 'pages/login.html';
        window.location.href = `${loginPath}?redirect=${encodeURIComponent(redirect)}`;
        return;
      }

      if (typeof Cart !== 'undefined' && Cart.items.length === 0) {
        e.preventDefault();
        showNotification('Your cart is empty!', 'error');
      }
    });
  }

  /**
   * Redirect guests who click the account/profile link to the login page.
   * Only redirects if auth is initialized AND user is not logged in.
   * If auth is still initializing, allow navigation (account page will handle auth check).
   */
  function protectAccountLink() {
    let authInitialized = false;

    // Track when auth state is first determined
    if (typeof AuthService !== 'undefined') {
      AuthService.onAuthStateChanged(() => {
        authInitialized = true;
      });
    }

    document.addEventListener('click', (e) => {
      const link = e.target.closest('a');
      if (!link) return;

      const href = link.getAttribute('href') || '';
      const isAccountLink = link.id !== 'account-btn' && (href && href.includes('account.html'));
      if (!isAccountLink) return;

      // If auth is not yet initialized, allow navigation to proceed
      // The account page's requireAuth will handle the check
      if (!authInitialized) return;

      const user = typeof AuthService !== 'undefined' ? AuthService.getCurrentUser() : null;
      if (user) return;

      e.preventDefault();
      e.stopPropagation();

      let redirect = window.location.pathname + window.location.search;
      try {
        const targetUrl = new URL(href, window.location.href);
        redirect = targetUrl.pathname + targetUrl.search + targetUrl.hash;
      } catch (_) {}
      const isSubpage = window.location.pathname.includes('/pages/');
      const loginPath = isSubpage ? 'login.html' : 'pages/login.html';
      window.location.href = `${loginPath}?redirect=${encodeURIComponent(redirect)}`;
    });
  }

  /**
   * Wishlist: all behaviour lives in js/wishlist.js; here we only tell it when the sign-in state is known or changes.
   */
  function initWishlistButtons() {
    if (typeof AuthService === 'undefined' || !window.WT || !WT.Wishlist) return;
    AuthService.onAuthStateChanged((user) => WT.Wishlist.onAuth(user));
  }

  /**
   * Initialize on DOM ready
   */
  document.addEventListener('DOMContentLoaded', () => {
    _initAccountMenu();
    initGlobalAuth();
    protectAccountLink();
    initWishlistButtons();
  });

})();
