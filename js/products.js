/**
 * products.js — loads the catalogue (API first, static JSON fallback), renders product cards,
 * and wires the add-to-cart buttons. Depends on utils.js and cart.js.
 */
const Products = {
  allProducts: [],
  loaded: false,
  fromFallback: false,   // true when the live API was unreachable and data/site-config.json was used

  // Bump this string whenever the saved catalogue's shape changes: every returning visitor's old copy is then ignored once.
  CACHE_KEY: 'wt-catalog-v3',
  CACHE_TTL: 5 * 60 * 1000,   // a saved copy is only trusted for 5 minutes (and is replaced the moment the server's version differs)
  version: null,              // catalogue version reported by the server for the copy currently in memory

  _readCache() {
    try {
      const c = JSON.parse(localStorage.getItem(this.CACHE_KEY) || 'null');
      if (c && Array.isArray(c.p) && c.p.length && Date.now() - c.t < this.CACHE_TTL) return c;
    } catch (e) { /* no cache */ }
    // Tidy up copies left behind by older versions of the site.
    try { ['wt-catalog-v1', 'wt-catalog-v2'].forEach((k) => localStorage.removeItem(k)); } catch (e) { /* ignore */ }
    return null;
  },

  async init() {
    // Show the last catalogue we saw straight away (names, prices and stock appear instantly), then refresh quietly.
    const cache = this._readCache(); const cached = cache && cache.p;
    const fresh = this.loadProducts().then((list) => {
      if (!this.fromFallback) { try { localStorage.setItem(this.CACHE_KEY, JSON.stringify({ t: Date.now(), v: this.version, p: list })); } catch (e) { /* storage full */ } }
      return list;
    });
    if (cached) {
      const drawn = cache.v || null;   // version of the copy being shown right now
      this.allProducts = cached; this.loaded = true; WT._flush();
      fresh.then((list) => this._apply(list, drawn)).catch(() => {});
      return;
    }
    try { this.allProducts = await fresh; }
    catch (e) { console.error('[Products] Failed to load products:', e); this.allProducts = []; }
    this.loaded = true;
    WT._flush();
  },

  // Swap in a newly loaded list and tell the page, but only when something actually changed.
  _apply(list, before) {
    this.allProducts.splice(0, this.allProducts.length, ...list);
    if (window.Cart && list.length && !this.fromFallback) Cart.reconcile(this.allProducts);   // prices/stock may have changed since the cached copy
    document.dispatchEvent(new CustomEvent('wt:products-refreshed', { detail: { version: this.version, changed: !this.version || !before || this.version !== before } }));
  },

  // Re-check the live catalogue (used when a visitor returns to a tab that has been in the background).
  async refresh() {
    if (this._refreshing) return; this._refreshing = true;
    try {
      const prev = this.version;
      const list = await this.loadProducts();
      if (this.fromFallback) return;
      try { localStorage.setItem(this.CACHE_KEY, JSON.stringify({ t: Date.now(), v: this.version, p: list })); } catch (e) { /* storage full */ }
      if (this.version && this.version === prev) return;   // nothing changed on the server
      this._apply(list, prev);
    } catch (e) { /* offline: keep what is on screen */ }
    finally { this._refreshing = false; }
  },

  async loadProducts() {
    this.fromFallback = false;
    try {
      const base = typeof window.API_BASE === 'string' ? window.API_BASE : '/api';
      const res = await fetch(`${base}/products`, { cache: 'no-cache' });   // always ask the server first (a quick 304 when unchanged)
      if (res.ok) { const data = await res.json(); if (Array.isArray(data.products)) { this.version = data.version || res.headers.get('X-Catalog-Version') || null; return data.products; } }
    } catch (e) { /* handled below */ }
    console.warn('[Products] Live catalogue unavailable, using data/site-config.json');
    this.fromFallback = true;
    const res = await fetch(WT.root + 'data/site-config.json');
    if (!res.ok) throw new Error(`HTTP ${res.status} loading catalogue`);
    const data = await res.json();
    return Array.isArray(data.products) ? data.products : [];
  },

  // ── Queries ────────────────────────────────────────────
  active() { return this.allProducts.filter((p) => p.status === 'active'); },
  getProductById(id) { return this.allProducts.find((p) => String(p.id) === String(id)); },
  filterByCategory(category, source) { const pool = source || this.allProducts; return pool.filter((p) => p.category && p.category.toLowerCase() === String(category).toLowerCase()); },
  categories() {
    const map = new Map();
    this.active().forEach((p) => { if (p.category) map.set(p.category, (map.get(p.category) || 0) + 1); });
    return [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
  },
  discountPct(p) { return p.originalPrice && Number(p.originalPrice) > Number(p.price) ? Math.round((1 - Number(p.price) / Number(p.originalPrice)) * 100) : 0; },
  isOut(p) { return p.stock === 'out-of-stock'; },
  related(p, n) {
    const others = this.active().filter((x) => x.id !== p.id);
    const same = others.filter((x) => x.category === p.category);
    return [...same, ...others.filter((x) => x.category !== p.category)].slice(0, n || 8);
  },
  trending(n) {
    return [...this.active()].sort((a, b) => (b.rating || 0) * Math.log(2 + (b.reviewCount || 0)) - (a.rating || 0) * Math.log(2 + (a.reviewCount || 0))).slice(0, n || 10);
  },
  href(p) { return WT.productPath(p); },

  // ── Brands & budgets ───────────────────────────────────
  brand(p) {
    const MAP = { jbl: 'JBL', dji: 'DJI', kz: 'KZ', galaxy: 'Samsung', iphone: 'Apple', ipad: 'Apple', macbook: 'Apple', airpods: 'Apple' };
    const w = String((p && p.name) || '').trim().split(/\s+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '');
    return MAP[w] || (w ? w.charAt(0).toUpperCase() + w.slice(1) : '');
  },
  brands() {
    const m = new Map(); this.active().forEach((p) => { const b = this.brand(p); if (b) m.set(b, (m.get(b) || 0) + 1); });
    return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  },
  budgets() {
    const A = this.active(), n = (lo, hi) => A.filter((p) => p.price >= lo && (hi === null || p.price <= hi)).length;
    return [
      { label: 'Under UGX 200,000', hint: 'Everyday essentials', href: `${WT.page('/shop')}?max=200000`, count: n(0, 200000) },
      { label: 'UGX 200K – 500K', hint: 'Crowd pleasers', href: `${WT.page('/shop')}?min=200000&max=500000`, count: n(200000, 500000) },
      { label: 'UGX 500K – 1M', hint: 'Step it up', href: `${WT.page('/shop')}?min=500000&max=1000000`, count: n(500000, 1000000) },
      { label: 'Over UGX 1M', hint: 'The big wow', href: `${WT.page('/shop')}?min=1000000`, count: n(1000000, null) },
    ];
  },

  // ── Card ───────────────────────────────────────────────
  _buildCard(p) {
    const pct = this.discountPct(p), out = this.isOut(p);
    const badges = [];
    if (out) badges.push('<span class="badge badge-ink">Sold out</span>');
    else {
      if (pct > 0) badges.push(`<span class="badge badge-flame">−${pct}%</span>`);
      if ((p.badges || []).includes('bestseller')) badges.push('<span class="badge badge-sun"><i class="fa-solid fa-fire"></i> Best seller</span>');
      else if ((p.badges || []).includes('new')) badges.push('<span class="badge badge-ink">New</span>');
      if (p.stock === 'limited') badges.push('<span class="badge badge-soft">Low stock</span>');
      if (p.stock === 'pre-order') badges.push('<span class="badge badge-soft">Pre-order</span>');
    }
    const imgs = (p.images || []).filter(Boolean).slice(0, 8), multi = imgs.length > 1;
    const slidesHTML = (imgs.length ? imgs : ['']).map((u, i) => `<a class="slide" href="${this.href(p)}" tabindex="-1" aria-hidden="true"><img src="${escapeHTML(WT.thumb(u))}" data-fallback="${escapeHTML(WT.img(u))}" alt="${i === 0 ? escapeHTML(p.name) : ''}" loading="lazy" decoding="async" width="480" height="480"></a>`).join('');
    const dotsHTML = multi ? `<div class="pcard-dots" aria-hidden="true">${imgs.map((_, i) => `<i${i === 0 ? ' class="on"' : ''}></i>`).join('')}</div>` : '';
    const link = this.href(p);
    const ask = `${WT.page('/contact')}?subject=${encodeURIComponent('Product question')}&message=${encodeURIComponent(`Please let me know when "${p.name}" is back in stock.`)}`;
    const card = createElement('article', 'pcard' + (out ? ' is-out' : ''));
    card.dataset.id = p.id; card.dataset.category = p.category || '';
    card.innerHTML = `
      <div class="pcard-media">
        <div class="pcard-slides${multi ? ' multi' : ''}">${slidesHTML}</div>
        ${dotsHTML}
        <div class="pcard-badges">${badges.slice(0, 2).join('')}</div>
        <button class="wishlist-btn" data-product-id="${p.id}" aria-label="Save ${escapeHTML(p.name)} to wishlist" aria-pressed="false"><i class="fa-regular fa-heart"></i></button>
        <button class="cmp-btn" data-compare="${p.id}" aria-label="Compare ${escapeHTML(p.name)}" aria-pressed="false" title="Compare"><i class="fa-solid fa-code-compare"></i></button>
      </div>
      <div class="pcard-body">
        <span class="pcard-cat">${escapeHTML(this.brand(p))} · ${escapeHTML(p.category || '')}</span>
        <h3 class="pcard-name"><a href="${link}">${escapeHTML(p.name)}</a></h3>
        ${p.reviewCount > 0 && p.rating ? `<div class="rating">${WT.stars(p.rating)}<span>${Number(p.rating).toFixed(1)} (${p.reviewCount})</span></div>` : ''}${p.stock === 'limited' ? '<div class="pcard-stock low">Only a few left</div>' : ''}
        <div class="pcard-price">
          <span class="price-now">${formatPrice(p.price)}</span>
          <span class="price-meta">${pct > 0 ? `<s>${formatPrice(p.originalPrice)}</s><b>Save ${pct}%</b>` : '<i class="fa-solid fa-shield-halved"></i> Authentic · Pay on delivery'}</span>
        </div>
        <div class="pcard-actions">
          ${out ? `<button class="btn btn-secondary btn-sm btn-block" disabled>Sold out</button><a class="pcard-ask" href="${ask}">Ask when it's back</a>`
                : `<button class="btn btn-primary btn-sm btn-block add-to-cart-btn" data-id="${p.id}"><i class="fa-solid fa-bag-shopping"></i> ${p.stock === 'pre-order' ? 'Pre-order' : 'Add to cart'}</button>`}
        </div>
      </div>`;
    return card;
  },

  skeletons(n) {
    return Array.from({ length: n || 4 }, () => '<div class="pcard-skel" aria-hidden="true"><div class="skeleton"></div><div class="s"><div class="skeleton" style="width:38%"></div><div class="skeleton" style="width:88%;height:18px"></div><div class="skeleton" style="width:50%"></div><div class="skeleton" style="width:62%;height:22px"></div><div class="skeleton" style="height:38px;border-radius:99px"></div></div></div>').join('');
  },

  render(container, list, emptyHTML) {
    if (!container) return;
    container.innerHTML = '';
    if (!list.length) { container.innerHTML = emptyHTML || '<div class="empty-state"><i class="fa-regular fa-face-frown"></i><h3>Nothing here yet</h3></div>'; return; }
    const frag = document.createDocumentFragment();
    list.forEach((p) => frag.appendChild(this._buildCard(p)));
    container.appendChild(frag);
    container.querySelectorAll('.pcard:nth-child(-n+4) .slide:first-child img').forEach((im) => { im.loading = 'eager'; im.setAttribute('fetchpriority', 'high'); });
    WT.markLoaded(container);
    document.dispatchEvent(new CustomEvent('wt:cards-rendered', { detail: { container } }));
  },

  handleAddToCart(id, btn) {
    const p = this.getProductById(id);
    if (!p) return showNotification('Product not found.', 'error');
    Cart.addItem(p);
    if (btn) { const old = btn.innerHTML; btn.innerHTML = '<i class="fa-solid fa-check"></i> Added'; btn.disabled = true; setTimeout(() => { btn.innerHTML = old; btn.disabled = false; }, 1100); }
  },
};

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.add-to-cart-btn');
  if (btn && btn.dataset.id) { e.preventDefault(); Products.handleAddToCart(btn.dataset.id, btn.closest('.pcard') ? btn : null); }
});
// ── Card photo slider ──────────────────────────────────
// Cards with several photos: hovering (mouse devices) scrolls through them; touch users just swipe. A dot indicator shows
// how many photos there are and which one is showing. Cards with ONE photo have no slider, no dots and no hover change.
(function () {
  const timers = new WeakMap();
  const canHover = matchMedia('(hover: hover)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches;
  const slidesOf = (el) => (el && el.closest ? el.closest('.pcard-media') : null);

  function start(media) {
    const sl = media.querySelector('.pcard-slides.multi'); if (!sl || timers.has(media)) return;
    sl.querySelectorAll('img[loading="lazy"]').forEach((i) => { i.loading = 'eager'; });     // preload the rest
    const n = sl.children.length; let i = Math.round(sl.scrollLeft / (sl.clientWidth || 1));
    const t = { delay: setTimeout(() => {
      const step = () => { i = (i + 1) % n; sl.scrollTo({ left: i * sl.clientWidth, behavior: 'smooth' }); };
      step(); t.iv = setInterval(step, 1200);
    }, 300) };
    timers.set(media, t);
  }
  function stop(media) {
    const t = timers.get(media); if (!t) return;
    clearTimeout(t.delay); clearInterval(t.iv); timers.delete(media);
    const sl = media.querySelector('.pcard-slides.multi'); if (sl) sl.scrollTo({ left: 0, behavior: 'smooth' });
  }
  if (canHover) {
    document.addEventListener('mouseover', (e) => { const m = slidesOf(e.target); if (m && !(e.relatedTarget && m.contains(e.relatedTarget))) start(m); });
    document.addEventListener('mouseout', (e) => { const m = slidesOf(e.target); if (m && !(e.relatedTarget && m.contains(e.relatedTarget))) stop(m); });
  }
  // keep the dots in step with the scroll position (works for swipe and for the hover scroll)
  let raf = 0;
  document.addEventListener('scroll', (e) => {
    const sl = e.target; if (!sl || !sl.classList || !sl.classList.contains('pcard-slides')) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const dots = sl.parentElement.querySelectorAll('.pcard-dots i'); if (!dots.length) return;
      const idx = Math.min(dots.length - 1, Math.round(sl.scrollLeft / (sl.clientWidth || 1)));
      dots.forEach((d, k) => d.classList.toggle('on', k === idx));
    });
  }, true);
})();

window.Products = Products;
