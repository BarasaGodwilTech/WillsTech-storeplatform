/**
 * wishlist.js — one wishlist for everyone.
 *  • Signed out: saved on this device (localStorage). Nothing is lost, and nobody is forced to sign in just to save an item.
 *  • Signed in: saved to the account. Anything saved while signed out is merged in automatically after sign-in.
 *  • Optimistic UI with rollback, one request per item at a time, idempotent PUT/DELETE (no flip-flopping on double clicks).
 *  • Hearts, the header count and the wishlist views all stay in sync (and clear on sign-out).
 */
(function () {
  'use strict';
  const KEY = 'wt-wishlist', HINT = 'wt-wl-hint', TOKEN = 'willstech_token';
  const W = (WT.Wishlist = { list: [], authed: false, loaded: false });
  let resolveLoaded; W.whenLoaded = new Promise((r) => { resolveLoaded = r; });
  const busy = new Set(); let lastServerLoad = 0;

  const has = (id) => W.list.includes(String(id));
  W.has = has;
  const readLocal = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]').map(String); } catch (e) { return []; } };
  const writeLocal = () => { try { localStorage.setItem(KEY, JSON.stringify(W.list)); } catch (e) { /* storage blocked: stays in memory */ } };
  const hasToken = () => { try { return !!localStorage.getItem(TOKEN); } catch (e) { return false; } };
  const loginUrl = () => {
    const file = location.pathname.split('/').pop() || 'index.html';
    return `${WT.page('login.html')}?redirect=${encodeURIComponent((WT.isSub ? '' : '../') + file + location.search)}`;
  };
  const shortName = (id) => { const p = window.Products && Products.getProductById(id); return p ? String(p.name).split(/\s[-–—]\s|[,|(/]/)[0].slice(0, 38) : 'Item'; };

  function paint() {
    const ids = new Set();
    document.querySelectorAll('.wishlist-btn[data-product-id], .wishlist-btn-detail[data-product-id]').forEach((b) => ids.add(b.dataset.productId));
    ids.forEach((id) => WT.setWishlistState(id, has(id)));
    if (WT.setWishlistCount) WT.setWishlistCount(W.list.length);
  }
  const emit = () => document.dispatchEvent(new CustomEvent('wt:wishlist-changed', { detail: { list: W.list.slice(), authed: W.authed } }));
  function done() { W.loaded = true; resolveLoaded(); paint(); emit(); }

  // ── Server sync ────────────────────────────────────────
  async function loadServer() {
    lastServerLoad = Date.now();
    try {
      const local = readLocal();
      const d = local.length
        ? await window.apiFetch('/account/wishlist/merge', { method: 'POST', body: JSON.stringify({ productIds: local }) })
        : await window.apiFetch('/account/wishlist');
      if (local.length) { try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ } }
      W.list = (d.wishlist || []).map(String); W.authed = true;
    } catch (e) {
      if (e.status === 401 || e.status === 403) { W.authed = false; W.list = readLocal(); }   // expired token: behave as signed out
    }
    done();
  }

  // Called by auth-init whenever the sign-in state is known or changes.
  W.onAuth = function (user) {
    if (user) { if (!W.authed || Date.now() - lastServerLoad > 3000) loadServer(); }
    else { W.authed = false; W.list = readLocal(); done(); }   // signed out: hearts clear, device list (if any) shows
  };

  // ── Toggle ─────────────────────────────────────────────
  W.toggle = async function (id) {
    id = String(id); if (!id || busy.has(id)) return;
    busy.add(id);
    const want = !has(id), prev = W.list.slice();
    W.list = want ? [id, ...W.list.filter((x) => x !== id)] : W.list.filter((x) => x !== id);
    paint(); emit();                                                  // optimistic
    try {
      if (W.authed) await window.apiFetch(`/account/wishlist/${encodeURIComponent(id)}`, { method: want ? 'PUT' : 'DELETE' });
      else writeLocal();
      if (want) {
        if (!W.authed && !sessionStorage.getItem(HINT)) { try { sessionStorage.setItem(HINT, '1'); } catch (e) { /* ignore */ } showNotification(`Saved “${shortName(id)}”. Sign in to keep your wishlist on every device.`, 'success', { label: 'Sign in', href: loginUrl() }); }
        else showNotification('Saved to your wishlist', 'success', { label: 'View', href: WT.page('wishlist.html') });
      } else showNotification('Removed from your wishlist', 'info', { label: 'Undo', onClick: () => W.toggle(id) });
    } catch (e) {
      W.list = prev; paint(); emit();                                 // roll back
      if (e.status === 401) showNotification('Please sign in again to use your wishlist.', 'error', { label: 'Sign in', href: loginUrl() });
      else showNotification(e.status === 404 ? 'That product is no longer available.' : 'Could not update your wishlist. Please try again.', 'error');
    } finally { busy.delete(id); }
  };

  // ── Wiring ─────────────────────────────────────────────
  document.addEventListener('click', (e) => {
    const b = e.target.closest('.wishlist-btn, .wishlist-btn-detail'); if (!b || !b.dataset.productId) return;
    e.preventDefault(); e.stopPropagation(); W.toggle(b.dataset.productId);
  });
  document.addEventListener('wt:cards-rendered', paint);
  document.addEventListener('wt:sync-wishlist', paint);
  document.addEventListener('DOMContentLoaded', paint);
  window.addEventListener('storage', (e) => { if (e.key === KEY && !W.authed) { W.list = readLocal(); paint(); emit(); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden && W.authed && Date.now() - lastServerLoad > 30000) loadServer(); });

  // Initial state: a token means "probably signed in", fetch the account list straight away; otherwise use the device list.
  if (hasToken()) { W.authed = true; loadServer(); } else { W.list = readLocal(); done(); }
})();
