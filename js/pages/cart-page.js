/** pages/cart-page.js — full cart page: unavailable items, undo, cross-sell, sticky mobile checkout. */
(function () {
  'use strict';
  const root = document.getElementById('cart-root');
  const SHOP = WT.page('/shop');

  WT.ready(() => { if (Products.allProducts.length) Cart.reconcile(Products.allProducts); render(); document.addEventListener('cart-updated', render); });

  // Cross-sell: things people usually add (other categories first), never what's already in the cart.
  function pairs() {
    const inCart = new Set(Cart.getItems().map((i) => String(i.productId)));
    const cats = new Set(Cart.getItems().map((i) => { const p = Products.getProductById(i.productId); return p && p.category; }).filter(Boolean));
    const pool = Products.active().filter((p) => !inCart.has(String(p.id)) && !Products.isOut(p));
    const other = pool.filter((p) => !cats.has(p.category)), same = pool.filter((p) => cats.has(p.category));
    const rank = (a, b) => (b.rating || 0) * Math.log(2 + (b.reviewCount || 0)) - (a.rating || 0) * Math.log(2 + (a.reviewCount || 0));
    return [...other.sort(rank), ...same.sort(rank)].slice(0, 8);
  }

  function render() {
    const items = Cart.getItems(), th = SITE.freeDeliveryThreshold || 0;
    const count = Cart.getItemCount();
    const sub = document.querySelector('.page-hero p'); if (sub) sub.textContent = items.length ? `${count} item${count === 1 ? '' : 's'} ready to order` : 'Your cart is waiting for something good.';
    if (!items.length) {
      root.innerHTML = `<div class="empty-state" style="padding:64px 20px"><i class="fa-solid fa-bag-shopping"></i><h3>Your cart is empty</h3><p>Find something you like and it will wait for you here.</p>
        <div class="form-actions" style="justify-content:center"><a class="btn btn-primary btn-lg" href="${SHOP}">Start shopping</a><a class="btn btn-secondary btn-lg" href="${SHOP}?filter=sale">See deals</a></div></div>`;
      return;
    }
    const goneIds = items.filter((i) => Cart.isUnavailable(i.productId));
    const total = Cart.getTotal(), left = th - total, blocked = goneIds.length > 0;
    const pair = pairs();
    root.innerHTML = `
      <div class="cart-layout">
        <div class="cart-list">
          ${blocked ? `<div class="err-box"><i class="fa-solid fa-circle-exclamation"></i><span style="flex:1">${goneIds.length === 1 ? 'One item is' : goneIds.length + ' items are'} no longer available. Remove ${goneIds.length === 1 ? 'it' : 'them'} to check out.</span><button class="btn btn-dark btn-sm" id="clean-cart">Remove ${goneIds.length === 1 ? 'it' : 'them'}</button></div>` : ''}
          ${items.map((i) => { const g = Cart.isUnavailable(i.productId); const href = `/product/${encodeURIComponent(i.productId)}`; return `
            <article class="cart-card${g ? ' is-gone' : ''}" data-id="${escapeHTML(i.productId)}">
              <a href="${href}"><img src="${escapeHTML(WT.img(i.image))}" data-fallback="${escapeHTML(WT.imgOriginal(i.image))}" alt="" loading="lazy"></a>
              <div>
                <h3><a href="${href}">${escapeHTML(i.name)}</a></h3>
                ${g ? '<div class="gone-note"><i class="fa-solid fa-circle-exclamation"></i> No longer available</div>'
                    : `<div class="unit">${formatPrice(i.price)} each</div>
                       <div class="qty"><button data-act="dec" aria-label="Decrease quantity"><i class="fa-solid fa-minus"></i></button><span>${i.quantity}</span><button data-act="inc" aria-label="Increase quantity"${i.quantity >= Cart.MAX_QTY ? ' disabled' : ''}><i class="fa-solid fa-plus"></i></button></div>`}
              </div>
              <div class="line">${g ? '' : `<b>${formatPrice(i.price * i.quantity)}</b>`}<button class="link-btn" data-act="rm"><i class="fa-regular fa-trash-can"></i> Remove</button></div>
            </article>`; }).join('')}
          <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:10px"><a class="link-arrow" href="${SHOP}"><i class="fa-solid fa-arrow-left" style="margin-right:4px"></i> Continue shopping</a><button class="link-btn" id="clear-cart">Clear cart</button></div>
          ${pair.length ? `<div class="pair"><h2>Pair it with</h2><div class="pair-track">${pair.map((p) => `<div class="pair-card"><div class="pimg"><img src="${escapeHTML(WT.img((p.images || [])[0]))}" data-fallback="${escapeHTML(WT.imgOriginal((p.images || [])[0]))}" alt="" loading="lazy"></div><b>${escapeHTML(p.name)}</b><span>${formatPrice(p.price)}</span><button class="btn btn-primary btn-sm btn-block" data-pair="${p.id}"><i class="fa-solid fa-plus"></i> Add</button></div>`).join('')}</div></div>` : ''}
        </div>
        <aside class="summary" aria-label="Order summary">
          <h2>Summary</h2>
          ${th <= 0 ? '<div class="free-ship" style="border-radius:16px;padding:14px 16px"><span><i class="fa-solid fa-truck-fast" style="color:var(--signal)"></i> We deliver everywhere in Uganda</span></div>'
            : left > 0 ? `<div class="free-ship" style="border-radius:16px;padding:14px 16px"><span>Add <b>${formatPrice(left)}</b> for free delivery</span><div class="free-ship-bar"><span style="width:${Math.min(100, total / th * 100).toFixed(0)}%"></span></div></div>`
            : '<div class="free-ship" style="border-radius:16px;padding:14px 16px"><span><i class="fa-solid fa-circle-check" style="color:var(--signal)"></i> Free delivery unlocked</span></div>'}
          <div class="sum-row"><span>Subtotal</span><b>${formatPrice(total)}</b></div>
          <div class="sum-row"><span>Delivery</span><b>${th <= 0 ? 'Confirmed at checkout' : 'At checkout'}</b></div>
          <div class="sum-total"><span>Estimated total</span><strong>${formatPrice(total)}</strong></div>
          <a class="btn btn-primary btn-lg btn-block" href="/checkout" ${blocked ? 'aria-disabled="true" style="pointer-events:none;opacity:.45"' : ''}><i class="fa-solid fa-lock"></i> Checkout</a>
          <p class="fine"><i class="fa-solid fa-shield-halved"></i> Authentic · Pay on delivery · No account needed</p>
          <p class="fine">Need help deciding? <a href="${WT.page('/contact')}" style="text-decoration:underline;font-weight:700">Ask us</a></p>
        </aside>
      </div>
      <div class="cart-sticky"><div><small>${count} item${count === 1 ? '' : 's'}</small><strong>${formatPrice(total)}</strong></div><a class="btn btn-primary btn-lg" href="/checkout" ${blocked ? 'aria-disabled="true" style="pointer-events:none;opacity:.45"' : ''}>Checkout</a></div>`;
    WT.markLoaded(root);
  }

  root.addEventListener('click', (e) => {
    if (e.target.closest('#clear-cart')) { const snap = JSON.stringify(Cart.items); if (confirm('Remove everything from your cart?')) { Cart.clear(); showNotification('Cart cleared', 'info', { label: 'Undo', onClick: () => { Cart.items = JSON.parse(snap); Cart.save(); Cart.updateBadge(); Cart._emit(); } }); } return; }
    if (e.target.closest('#clean-cart')) { Cart.removeUnavailable(); return; }
    const pa = e.target.closest('[data-pair]'); if (pa) { const p = Products.getProductById(pa.dataset.pair); if (p) Cart.addItem(p, 1, { silent: true }); showNotification(`Added: ${p.name}`, 'success'); return; }
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.closest('.cart-card').dataset.id, it = Cart.getItems().find((x) => String(x.productId) === id); if (!it) return;
    if (b.dataset.act === 'inc') Cart.updateQuantity(id, it.quantity + 1); else if (b.dataset.act === 'dec') Cart.updateQuantity(id, it.quantity - 1); else Cart.removeItem(id);
  });
})();
