/** pages/wishlist-page.js — the wishlist, for guests (saved on this device) and signed-in customers (saved to the account). */
(function () {
  'use strict';
  const root = document.getElementById('wl-root');
  const W = WT.Wishlist;
  const SHOP = WT.page('shop.html');

  async function render() {
    await W.whenLoaded;
    const items = W.list.map((id) => Products.getProductById(id)).filter((p) => p && p.status === 'active');
    const gone = W.list.length - items.length;
    const sub = document.querySelector('.page-hero p');
    if (sub) sub.textContent = items.length ? `${items.length} saved item${items.length === 1 ? '' : 's'}. Add them to your cart when you're ready.` : 'Save products you love and find them here.';
    const login = `${WT.page('login.html')}?redirect=${encodeURIComponent('wishlist.html')}`;
    const nudge = !W.authed && items.length ? `<div class="signin-nudge"><span><i class="fa-regular fa-heart"></i> Saved on this device. Sign in to keep your wishlist on every device.</span><a class="btn btn-dark btn-sm" href="${login}">Sign in</a></div>` : '';

    if (!items.length) {
      root.innerHTML = `<div class="empty-state" style="padding:64px 20px"><i class="fa-regular fa-heart"></i><h3>Your wishlist is empty</h3><p>Tap the heart on any product to save it here.</p>
        <div class="form-actions" style="justify-content:center"><a class="btn btn-primary btn-lg" href="${SHOP}">Start shopping</a><a class="btn btn-secondary btn-lg" href="${SHOP}?filter=sale">See deals</a></div></div>`;
      return;
    }
    const buyable = items.filter((p) => !Products.isOut(p));
    root.innerHTML = `${nudge}
      <div class="wl-bar"><b>${items.length} saved</b>${buyable.length ? `<button class="btn btn-dark btn-sm" id="wl-addall"><i class="fa-solid fa-bag-shopping"></i> Add ${buyable.length === 1 ? 'it' : 'all'} to cart</button>` : ''}</div>
      ${gone > 0 ? `<div class="callout"><i class="fa-solid fa-circle-info"></i><span>${gone} saved item${gone === 1 ? ' is' : 's are'} no longer available and ${gone === 1 ? 'was' : 'were'} hidden.</span></div>` : ''}
      <div class="products-grid" id="wl-grid"></div>`;
    Products.render(document.getElementById('wl-grid'), items);
  }

  root.addEventListener('click', (e) => {
    if (!e.target.closest('#wl-addall')) return;
    const buyable = W.list.map((id) => Products.getProductById(id)).filter((p) => p && p.status === 'active' && !Products.isOut(p));
    buyable.forEach((p) => Cart.addItem(p, 1, { silent: true }));
    showNotification(`Added ${buyable.length} item${buyable.length === 1 ? '' : 's'} to your cart`, 'success', { label: 'View cart', href: WT.page('cart.html') });
  });

  WT.ready(render);
  document.addEventListener('wt:wishlist-changed', () => { if (Products.loaded) render(); });
})();
