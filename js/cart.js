/**
 * cart.js — the shopping cart.
 *  • ONE cart per device (key wt-cart-v2). It no longer switches when you sign in or out, so items never "disappear".
 *  • Migrates the old per-user carts, survives blocked/full storage (falls back to memory), syncs across tabs.
 *  • Remove has Undo; items that were delisted or sold out are flagged (and excluded from totals/checkout).
 */
const Cart = {
  items: [],
  unavailable: new Set(),
  userId: null,           // kept for compatibility with auth code; no longer affects storage
  MAX_QTY: 20,
  KEY: 'wt-cart-v2',
  _last: null,            // last removed item, for Undo
  _mem: null,             // in-memory fallback when localStorage is unavailable

  init() {
    this._migrate(); this.load(); this.updateBadge();
    window.addEventListener('storage', (e) => { if (e.key === this.KEY) { this.load(); this.updateBadge(); this._emit(); } });
  },
  setUserId(id) { this.userId = id || null; },   // intentionally does not touch the cart

  // ── Reading ────────────────────────────────────────────
  getItems() { return this.items; },
  isUnavailable(id) { return this.unavailable.has(String(id)); },
  getAvailableItems() { return this.items.filter((i) => !this.isUnavailable(i.productId)); },
  getTotal() { return this.getAvailableItems().reduce((s, i) => s + Number(i.price) * i.quantity, 0); },
  getSubtotal() { return this.getTotal(); },
  getItemCount() { return this.items.reduce((s, i) => s + i.quantity, 0); },
  has(id) { return this.items.some((i) => String(i.productId) === String(id)); },

  // ── Changing ───────────────────────────────────────────
  addItem(product, qty, opts) {
    opts = opts || {}; qty = Math.max(1, Math.floor(Number(qty) || 1));
    const id = String(product.id !== undefined ? product.id : product.productId);
    const price = Number(product.price);
    if (!id || id === 'undefined' || !isFinite(price)) return false;
    let clamped = false;
    const existing = this.items.find((i) => String(i.productId) === id);
    if (existing) { const q = existing.quantity + qty; clamped = q > this.MAX_QTY; existing.quantity = Math.min(this.MAX_QTY, q); }
    else { clamped = qty > this.MAX_QTY; this.items.push({ productId: id, name: String(product.name || 'Product'), price, image: Array.isArray(product.images) ? product.images[0] : (product.image || ''), quantity: Math.min(this.MAX_QTY, qty) }); }
    this.unavailable.delete(id);
    this.save(); this.updateBadge(true); this._emit();
    if (!opts.silent) {
      if (clamped) showNotification(`You can order up to ${this.MAX_QTY} of one item online. Contact us for bulk orders.`, 'info');
      else showNotification(`Added: ${product.name}`, 'success', { label: 'View cart', href: WT.page('cart.html') });
    }
    return true;
  },
  removeItem(productId, opts) {
    const id = String(productId), idx = this.items.findIndex((i) => String(i.productId) === id);
    if (idx < 0) return;
    const [gone] = this.items.splice(idx, 1);
    this._last = { item: gone, idx };
    this.save(); this.updateBadge(); this._emit();
    if (!(opts && opts.silent)) showNotification(`Removed: ${gone.name}`, 'info', { label: 'Undo', onClick: () => this.undoRemove() });
  },
  undoRemove() {
    if (!this._last) return;
    const { item, idx } = this._last; this._last = null;
    if (!this.has(item.productId)) this.items.splice(Math.min(idx, this.items.length), 0, item);
    this.save(); this.updateBadge(true); this._emit();
  },
  updateQuantity(productId, quantity) {
    const it = this.items.find((i) => String(i.productId) === String(productId)); if (!it) return;
    const q = Math.floor(Number(quantity));
    if (!(q >= 1)) return this.removeItem(productId);
    if (q > this.MAX_QTY) showNotification(`Maximum ${this.MAX_QTY} per item online. Contact us for bulk orders.`, 'info');
    it.quantity = Math.min(this.MAX_QTY, q); this.save(); this.updateBadge(); this._emit();
  },
  removeUnavailable() { const gone = [...this.unavailable]; this.items = this.items.filter((i) => !this.isUnavailable(i.productId)); this.unavailable.clear(); this.save(); this.updateBadge(); this._emit(); return gone.length; },
  clear() { this.items = []; this.unavailable.clear(); this._last = null; this.save(); this.updateBadge(); this._emit(); },

  // Re-check the cart against the live catalogue: refresh prices/names, flag items that are gone or sold out.
  // Skips entirely when the catalogue is empty (e.g. API failed) so a network blip never empties a cart.
  reconcile(products) {
    const changed = [];
    if (!Array.isArray(products) || !products.length) return { changed, unavailable: [...this.unavailable] };
    this.unavailable.clear();
    this.items.forEach((i) => {
      const p = products.find((x) => String(x.id) === String(i.productId));
      if (!p || p.status !== 'active' || p.stock === 'out-of-stock') { this.unavailable.add(String(i.productId)); return; }
      if (Number(p.price) !== Number(i.price)) { changed.push(`${p.name}: price is now ${formatPrice(p.price)}`); i.price = Number(p.price); }
      i.name = p.name; if (!i.image && p.images && p.images[0]) i.image = p.images[0];
    });
    if (changed.length) this.save();
    this._emit();
    return { changed, unavailable: [...this.unavailable] };
  },

  // ── Plumbing ───────────────────────────────────────────
  _emit() { document.dispatchEvent(new CustomEvent('cart-updated', { bubbles: true, detail: { items: this.items, total: this.getTotal() } })); },
  updateBadge(pulse) {
    const count = this.getItemCount();
    document.querySelectorAll('.cart-badge[data-cart]').forEach((b) => {
      b.textContent = count > 99 ? '99+' : count; b.hidden = count === 0; b.setAttribute('aria-label', `${count} items in cart`);
      if (pulse) { b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); }
    });
  },
  save() {
    const json = JSON.stringify({ v: 2, items: this.items });
    try { localStorage.setItem(this.KEY, json); this._mem = null; } catch (e) { this._mem = json; }
  },
  load() {
    let raw = this._mem;
    try { raw = localStorage.getItem(this.KEY) || raw; } catch (e) { /* storage blocked */ }
    try {
      const d = raw ? JSON.parse(raw) : null; const a = d && Array.isArray(d.items) ? d.items : [];
      this.items = a.filter((i) => i && i.productId && Number(i.quantity) > 0 && isFinite(Number(i.price)))
        .map((i) => ({ productId: String(i.productId), name: String(i.name || 'Product'), price: Number(i.price), image: i.image || '', quantity: Math.min(this.MAX_QTY, Math.floor(Number(i.quantity))) }));
    } catch (e) { this.items = []; }
  },
  // Merge the old guest/per-user carts into the single device cart (once).
  _migrate() {
    try {
      const legacy = Object.keys(localStorage).filter((k) => k === 'willstech-cart' || k.startsWith('willstech-cart-'));
      if (!legacy.length) return;
      const map = new Map((JSON.parse(localStorage.getItem(this.KEY) || '{"items":[]}').items || []).map((i) => [String(i.productId), i]));
      legacy.forEach((k) => {
        try { (JSON.parse(localStorage.getItem(k)) || []).forEach((i) => { if (!i || !i.productId) return; const cur = map.get(String(i.productId)); if (cur) cur.quantity = Math.max(cur.quantity, Number(i.quantity) || 1); else map.set(String(i.productId), { ...i, productId: String(i.productId), quantity: Number(i.quantity) || 1 }); }); } catch (e) { /* skip bad entry */ }
        localStorage.removeItem(k);
      });
      localStorage.setItem(this.KEY, JSON.stringify({ v: 2, items: [...map.values()] }));
    } catch (e) { /* storage blocked */ }
  },
};
window.Cart = Cart;
