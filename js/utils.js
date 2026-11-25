/**
 * utils.js — shared helpers for every page. Exposes the WT namespace.
 * Loaded after api-config.js and site.js.
 */
(function () {
  'use strict';
  // <html data-abs> (used by the 404 page) forces absolute paths because it can be served from any URL depth.
  // Clean URLs: every page lives at a root path (/shop, /cart, /product/<name>-<id>), so ALL links and assets are root-absolute.
  const WT = (window.WT = window.WT || {});
  WT.isSub = true;
  WT.root = '/';
  // WT.page('/shop?x=1') -> '/shop?x=1' ; WT.page('index.html') -> '/'. Accepts names with or without .html.
  WT.page = (file) => {
    const m = /^\/?(?:pages\/)?([^?#]*?)(?:\.html)?([?#].*)?$/.exec(String(file || ''));
    const base = m && m[1] !== 'index' ? m[1] : '';
    return '/' + base + ((m && m[2]) || '');
  };
  // Which page are we on? 'index', 'shop', 'product', 'cart' ...
  WT.here = (location.pathname.replace(/\/+$/, '').split('/')[1] || 'index').replace(/\.html$/, '').toLowerCase();
<<<<<<< HEAD
=======
<<<<<<< HEAD
>>>>>>> 809eded88154149fea57fa1f8b35d8278a3e3c06
  // Same rule as the server (backend/src/lib/pages.js): short, whole words only. The id at the end is what identifies the product.
  const baseSlug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  WT.slug = (name) => {
    let t = baseSlug(String(name || '').split(/\s[-–—]\s|[,|(]/)[0]) || baseSlug(name);
    if (t.length > 60) { t = t.slice(0, 60); const i = t.lastIndexOf('-'); if (i > 15) t = t.slice(0, i); }
    return t.replace(/-+$/, '');
  };
  WT.productPath = (p) => { const s = WT.slug(p.name); return '/product/' + (s ? s + '-' : '') + encodeURIComponent(p.id); };
  // Product id from the current URL (/product/some-name-123456) with a fallback for old ?id= links.
  WT.productIdFromUrl = () => { if (window.__PRODUCT_ID__) return window.__PRODUCT_ID__; const m = /\/product\/(?:[^/]*-)?(\d+)\/?$/.exec(location.pathname); return m ? m[1] : new URLSearchParams(location.search).get('id'); };
<<<<<<< HEAD
=======
=======
  WT.slug = (name) => String(name || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 70).replace(/-+$/, '');
  WT.productPath = (p) => { const s = WT.slug(p.name); return '/product/' + (s ? s + '-' : '') + encodeURIComponent(p.id); };
  // Product id from the current URL (/product/some-name-123456) with a fallback for old ?id= links.
  WT.productIdFromUrl = () => { const m = /\/product\/(?:[^/]*-)?(\d+)\/?$/.exec(location.pathname); return m ? m[1] : new URLSearchParams(location.search).get('id'); };
>>>>>>> c338fb81c595c3987b795b730eafef80368aa8e0
>>>>>>> 809eded88154149fea57fa1f8b35d8278a3e3c06
  WT.waLink = (text) => `https://wa.me/${(window.SITE && SITE.whatsapp) || '256751924844'}${text ? '?text=' + encodeURIComponent(text) : ''}`;

  // ── Formatting ─────────────────────────────────────────
  window.formatPrice = function formatPrice(amount) {
    const n = Number(amount);
    if (isNaN(n)) return 'UGX 0';
    return 'UGX ' + n.toLocaleString('en-UG', { maximumFractionDigits: 0 });
  };
  window.escapeHTML = function escapeHTML(v) {
    return String(v === null || v === undefined ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  const esc = window.escapeHTML;
  WT.cap = (s) => String(s || '').replace(/(^|[\s-])\w/g, (m) => m.toUpperCase());
  WT.date = (d, opts) => new Date(d).toLocaleDateString('en-UG', opts || { day: 'numeric', month: 'short', year: 'numeric' });
  WT.time = (d) => new Date(d).toLocaleTimeString('en-UG', { hour: 'numeric', minute: '2-digit' });

  // ── Images ─────────────────────────────────────────────
  // Product photos were saved as absolute GitHub URLs; the same files ship in /public/images/products,
  // so prefer the local copy (fast, offline-friendly) and fall back to the original URL if it is missing.
  WT.img = function (url) {
    if (!url) return WT.root + 'IMAGES/logo-mark-phone-purple.svg';
    const m = /\/public\/images\/products\/([^/?#]+)$/.exec(url);
    if (m) return WT.root + 'public/images/products/' + m[1];
    if (/^(https?:|data:|blob:)/.test(url)) return url;
    return WT.root + String(url).replace(/^\//, '');
  };
  // Small copy for product cards (made automatically at upload as "name-sm.webp"). Older photos have none, so keep their URL.
  WT.thumb = function (url) {
    const full = WT.img(url);
    return /\.webp(\?.*)?$/i.test(full) && !/-sm\.webp/i.test(full) && !/IMAGES\//.test(full) ? full.replace(/\.webp/i, '-sm.webp') : full;
  };
  WT.imgOriginal = (url) => (url && /^https?:/.test(url) ? url : '');
  // Fade images in once they have loaded (CSS shows a shimmer behind them until then).
  const fitHero = (i) => { if (i.classList.contains('hs-img') && i.naturalWidth && Math.abs(i.naturalWidth / i.naturalHeight - 1) > 0.12) i.classList.add('fit'); };
  document.addEventListener('load', (e) => { if (e.target && e.target.tagName === 'IMG') { e.target.classList.add('is-loaded'); fitHero(e.target); } }, true);
  WT.markLoaded = (root) => (root || document).querySelectorAll('img').forEach((i) => { if (i.complete && i.naturalWidth) { i.classList.add('is-loaded'); fitHero(i); } });
  document.addEventListener('error', (e) => {
    const img = e.target;
    if (!img || img.tagName !== 'IMG') return;
    if (img.dataset.fallback && !img.dataset.triedFallback) { img.dataset.triedFallback = '1'; img.src = img.dataset.fallback; return; }
    if (!img.dataset.placeholder) { img.dataset.placeholder = '1'; img.src = WT.root + 'IMAGES/logo-mark-phone-purple.svg'; img.classList.add('img-missing', 'is-loaded'); }
  }, true);

  // ── DOM / timing ───────────────────────────────────────
  window.createElement = (tag, cls, html) => { const el = document.createElement(tag); if (cls) el.className = cls; if (html !== undefined) el.innerHTML = html; return el; };
  window.debounce = (fn, ms) => { let t; return function (...a) { clearTimeout(t); t = setTimeout(() => fn.apply(this, a), ms); }; };
  window.lazyLoadImages = function () {
    const imgs = document.querySelectorAll('img[data-src]');
    imgs.forEach((i) => { i.src = i.dataset.src; i.removeAttribute('data-src'); });
  };

  // Run fn once products are loaded (immediately if they already are).
  const queue = [];
  WT.productsReady = false;
  WT.ready = (fn) => (WT.productsReady ? fn() : queue.push(fn));
  WT._flush = () => { WT.productsReady = true; while (queue.length) { try { queue.shift()(); } catch (e) { console.error(e); } } };

  // ── Icons ──────────────────────────────────────────────
  WT.stars = function (rating) {
    const r = Number(rating) || 0; let h = '';
    for (let i = 1; i <= 5; i++) h += i <= Math.floor(r + 0.25) ? '<i class="fa-solid fa-star"></i>' : (i - r < 1 && i - r > 0.25 ? '<i class="fa-solid fa-star-half-stroke"></i>' : '<i class="fa-solid fa-star off"></i>');
    return `<span class="stars" aria-hidden="true">${h}</span>`;
  };
  WT.categoryIcon = (c) => ({ smartphones: 'fa-mobile-screen', phones: 'fa-mobile-screen', laptops: 'fa-laptop', tablets: 'fa-tablet-screen-button', audio: 'fa-headphones', accessories: 'fa-plug', gaming: 'fa-gamepad', cameras: 'fa-camera', wearables: 'fa-clock' }[String(c || '').toLowerCase()] || 'fa-box');

  // ── Toasts ─────────────────────────────────────────────
  window.showNotification = function (message, type, action) {
    type = type || 'info';
    let stack = document.querySelector('.toast-stack');
    if (!stack) { stack = createElement('div', 'toast-stack'); stack.setAttribute('aria-live', 'polite'); document.body.appendChild(stack); }
    const icon = { success: 'fa-circle-check', error: 'fa-circle-exclamation', info: 'fa-circle-info' }[type] || 'fa-circle-info';
    const t = createElement('div', 'wt-toast ' + type);
    const kill = () => { t.classList.add('leaving'); setTimeout(() => t.remove(), 300); };
    t.setAttribute('role', type === 'error' ? 'alert' : 'status');
    t.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i><span>${esc(message)}</span>` + (action ? (action.onClick ? `<button type="button" class="wt-toast-action">${esc(action.label)}</button>` : `<a class="wt-toast-action" href="${esc(action.href)}">${esc(action.label)}</a>`) : '');
    if (action && action.onClick) t.querySelector('.wt-toast-action').addEventListener('click', (e) => { e.stopPropagation(); action.onClick(); kill(); });
    stack.appendChild(t);
    while (stack.children.length > 3) stack.firstChild.remove();
    t.addEventListener('click', (e) => { if (!e.target.closest('a')) kill(); });
    setTimeout(kill, action ? 6000 : 3200);
  };

  // ── Wishlist button state (heart icon) ─────────────────
  WT.setWishlistState = function (productId, isIn) {
    document.querySelectorAll(`.wishlist-btn[data-product-id="${productId}"], .wishlist-btn-detail[data-product-id="${productId}"]`).forEach((btn) => {
      btn.classList.toggle('active', !!isIn);
      const i = btn.querySelector('i.fa-heart');
      if (i) i.className = (isIn ? 'fa-solid' : 'fa-regular') + ' fa-heart';
      const label = btn.querySelector('.wl-label');
      if (label) label.textContent = isIn ? 'Saved to wishlist' : 'Save to wishlist';
      btn.setAttribute('aria-pressed', isIn ? 'true' : 'false');
    });
  };

  // ── Recently viewed ────────────────────────────────────
  const RV = 'willstech-recently-viewed';
  WT.recent = {
    get() { try { return JSON.parse(localStorage.getItem(RV) || '[]'); } catch (e) { return []; } },
    add(id) { try { const a = this.get().filter((x) => String(x) !== String(id)); a.unshift(id); localStorage.setItem(RV, JSON.stringify(a.slice(0, 12))); } catch (e) { /* ignore */ } },
  };

  // ── "Is this a clean studio shot?" (for picking hero images) ──
  const cleanCache = new Map();
  WT.isCleanImage = function (url) {
    if (cleanCache.has(url)) return cleanCache.get(url);
    const p = new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const n = 24, c = document.createElement('canvas'); c.width = c.height = n;
          const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, n, n);
          const d = g.getImageData(0, 0, n, n).data; let sum = 0, cnt = 0, min = 255;
          for (let i = 0; i < n; i++) for (const [x, y] of [[i, 0], [i, n - 1], [0, i], [n - 1, i]]) {
            const k = (y * n + x) * 4; const lum = (d[k] + d[k + 1] + d[k + 2]) / 3; sum += lum; cnt++; if (lum < min) min = lum;
          }
          resolve(sum / cnt > 238 && min > 205);
        } catch (e) { resolve(false); }
      };
      img.onerror = () => resolve(false);
      img.src = url;
    });
    cleanCache.set(url, p); return p;
  };
})();
