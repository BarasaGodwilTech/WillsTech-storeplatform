/** pages/checkout.js — guest-friendly checkout. The server recalculates prices, delivery and discounts. */
(function () {
  'use strict';
  const root = document.getElementById('co-root');
  const DRAFT = 'wt-checkout-draft', SAVED = 'wt-checkout-saved';
  const FALLBACK_CFG = {
    freeDeliveryThreshold: SITE.freeDeliveryThreshold,
    zones: [{ id: 'kampala', name: 'Kampala', fee: 0, quote: true, eta: 'Same day for orders before 3 pm', freeOverThreshold: true }, { id: 'mbale', name: 'Mbale', fee: 0, quote: true, eta: 'Next day', freeOverThreshold: true }, { id: 'other', name: 'Elsewhere in Uganda', fee: 0, quote: true, eta: 'Courier, usually 2 to 3 days' }],
    paymentMethods: [{ id: 'momo', name: 'MTN MoMo', hint: 'Pay when it arrives' }, { id: 'airtel', name: 'Airtel Money', hint: 'Pay when it arrives' }, { id: 'cod', name: 'Cash on delivery', hint: 'Pay the rider when it arrives' }, ],
  };
  const PAY_ICON = { momo: ['mtn', 'fa-mobile-screen-button'], airtel: ['airtel', 'fa-mobile-screen-button'], cod: ['cod', 'fa-money-bill-wave'], bank: ['', 'fa-building-columns'] };
  let cfg = FALLBACK_CFG, coupon = null, busy = false;
  const f = {};   // form state

  WT.ready(async () => {
    const r = Products.allProducts.length ? Cart.reconcile(Products.allProducts) : { changed: [], unavailable: [] };
    if (!Cart.getItems().length) return empty();
    try { cfg = Object.assign({}, FALLBACK_CFG, await window.apiFetch('/shop/config')); } catch (e) { /* backend offline: use defaults */ }
    const saved = (() => { try { return JSON.parse(localStorage.getItem(SAVED) || '{}'); } catch (e) { return {}; } })();
    const draft = (() => { try { return JSON.parse(sessionStorage.getItem(DRAFT) || '{}'); } catch (e) { return {}; } })();
    Object.assign(f, { name: '', phone: '', email: '', zone: cfg.zones[0].id, street: '', notes: '', lat: null, lng: null, pay: cfg.paymentMethods[0].id }, saved, draft);
    if (!cfg.zones.find((z) => z.id === f.zone)) f.zone = cfg.zones[0].id;
    if (!cfg.paymentMethods.find((p) => p.id === f.pay)) f.pay = cfg.paymentMethods[0].id;
    draw(r);
    document.addEventListener('cart-updated', () => { if (!Cart.getItems().length && !busy) empty(); else totals(); items(); });
    if (window.AuthService) AuthService.onAuthStateChanged(prefillFromAccount);
  });

  function empty() {
    root.innerHTML = `<div class="empty-state" style="padding:72px 20px"><i class="fa-solid fa-bag-shopping"></i><h3>Your cart is empty</h3><p>Add something first, then come back to check out.</p><a class="btn btn-primary btn-lg" href="/shop">Start shopping</a></div>`;
  }

  async function prefillFromAccount(user) {
    const nudge = document.getElementById('signin-nudge'); if (nudge) nudge.hidden = !!user;
    if (!user) return;
    const set = (id, key, val) => { const el = document.getElementById(id); if (el && !el.value && val) { el.value = val; f[key] = val; } };
    set('f-name', 'name', user.displayName); set('f-email', 'email', user.email); set('f-phone', 'phone', user.phoneNumber);
    try {
      const addrs = await FirestoreService.getAddresses(user.uid);
      const a = (addrs || []).find((x) => x.isDefault) || (addrs || [])[0];
      if (a) { if (f.lat == null && a.lat != null) { f.lat = a.lat; f.lng = a.lng; const pt = document.getElementById('pin-txt'); if (pt) pt.textContent = 'Change pin on map'; } set('f-street', 'street', [a.street, a.city].filter(Boolean).join(', ')); set('f-phone', 'phone', a.phone); }
    } catch (e) { /* optional */ }
  }

  function draw(rec) {
    const notes = (rec.changed || []).map((n) => `<div class="callout"><i class="fa-solid fa-circle-info"></i><span>${escapeHTML(n)}</span></div>`).join('');
    const gone = (rec.unavailable || []).length;
    root.innerHTML = `
    <div class="checkout-layout">
      <form class="co-form" id="co-form" novalidate>
        <div class="signin-nudge" id="signin-nudge" hidden><span><i class="fa-regular fa-user"></i> Have an account? Sign in to fill this in and track your orders.</span><a class="btn btn-dark btn-sm" href="/login?redirect=%2Fcheckout">Sign in</a></div>
        ${notes}${gone ? `<div class="err-box"><i class="fa-solid fa-circle-exclamation"></i><span>Some items in your cart are no longer available. <a href="/cart" style="text-decoration:underline">Review your cart</a>.</span></div>` : ''}
        <section class="co-card"><h2><span class="n">1</span> Your details</h2>
          <div class="form-row">
            <div class="form-group"><label class="form-label" for="f-name">Full name</label><input class="form-input" id="f-name" autocomplete="name" value="${escapeHTML(f.name)}" required><span class="form-error" id="e-name"></span></div>
            <div class="form-group"><label class="form-label" for="f-phone">Phone</label><input class="form-input" id="f-phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="07XX XXX XXX" value="${escapeHTML(f.phone)}" required><span class="form-error" id="e-phone"></span></div>
          </div>
          <div class="form-group"><label class="form-label" for="f-email">Email <span class="optional">(optional, for your receipt)</span></label><input class="form-input" id="f-email" type="email" autocomplete="email" value="${escapeHTML(f.email)}"><span class="form-error" id="e-email"></span></div>
        </section>
        <section class="co-card"><h2><span class="n">2</span> Delivery</h2>
          <div class="opts" role="radiogroup" aria-label="Delivery area">${cfg.zones.map((z) => `
            <label class="opt"><input type="radio" name="zone" value="${z.id}" ${f.zone === z.id ? 'checked' : ''}><span class="opt-box"><b><i class="fa-solid fa-location-dot"></i>${escapeHTML(z.name)}</b><span>${escapeHTML(z.eta || '')}</span><em data-fee="${z.id}"></em></span></label>`).join('')}</div>
          <div class="form-group"><button type="button" class="btn btn-secondary" id="pin-btn"><i class="fa-solid fa-map-location-dot"></i> <span id="pin-txt">${f.lat != null ? 'Change pin on map' : 'Pin my location on the map'}</span></button><span class="form-hint" id="pin-note" style="display:block;margin-top:6px">${f.lat != null ? '<i class="fa-solid fa-circle-check" style="color:var(--success,#1fa855)"></i> Pin saved. The rider will see your exact spot.' : 'Optional, but it helps the rider find you faster.'}</span></div>
          <div class="form-group"><label class="form-label" for="f-street">Street, area or landmark</label><input class="form-input" id="f-street" autocomplete="street-address" placeholder="e.g. Ntinda, near Capital Shoppers" value="${escapeHTML(f.street)}" required><span class="form-error" id="e-street"></span></div>
          <div class="form-group"><label class="form-label" for="f-notes">Notes for the rider <span class="optional">(optional)</span></label><input class="form-input" id="f-notes" maxlength="300" value="${escapeHTML(f.notes)}"></div>
        </section>
        <section class="co-card"><h2><span class="n">3</span> Payment</h2>
          <div class="opts" role="radiogroup" aria-label="Payment method">${cfg.paymentMethods.map((m) => { const ic = PAY_ICON[m.id] || ['', 'fa-wallet']; const brand = ic[1].startsWith('fa-brands'); return `
            <label class="opt"><input type="radio" name="pay" value="${m.id}" ${f.pay === m.id ? 'checked' : ''}><span class="opt-box"><b><span class="pay-ic ${ic[0]}"><i class="${brand ? ic[1] : 'fa-solid ' + ic[1]}"></i></span>${escapeHTML(m.name)}</b><span>${escapeHTML(m.hint || '')}</span></span></label>`; }).join('')}</div>
          <p class="form-hint"><i class="fa-solid fa-lock"></i> You won't pay on this page. We confirm your order, set your delivery date, and you pay when it arrives. Every step shows on your tracking page.</p>
        </section>
        <div class="err-box" id="co-error" hidden></div>
        <button class="btn btn-primary btn-lg btn-block" type="submit" id="place-btn" ${gone ? 'disabled' : ''}><i class="fa-solid fa-lock"></i> Place order · <span id="btn-total"></span></button>
        <p class="form-hint" style="text-align:center">By placing your order you agree to our <a href="/terms" style="text-decoration:underline">Terms</a> and <a href="/returns" style="text-decoration:underline">Returns policy</a>.</p>
      </form>

      <aside class="co-summary"><div class="summary" aria-label="Order summary">
        <h2>Order summary</h2>
        <div class="co-items" id="co-items"></div>
        <div class="coupon"><input class="form-input" id="f-coupon" placeholder="Discount code" aria-label="Discount code" autocomplete="off"><button class="btn btn-dark" type="button" id="coupon-btn">Apply</button></div>
        <div class="coupon-msg" id="coupon-msg" role="status"></div>
        <div id="co-totals"></div>
      </div></aside>
    </div>`;
    items(); totals(); bind();
    const user = window.AuthService && AuthService.getCurrentUser && AuthService.getCurrentUser();
    document.getElementById('signin-nudge').hidden = user !== null && user !== undefined ? !!user : true;
    if (user) prefillFromAccount(user);
  }

  function items() {
    const el = document.getElementById('co-items'); if (!el) return;
    el.innerHTML = Cart.getAvailableItems().map((i) => `<div class="co-item"><div class="ph"><img src="${escapeHTML(WT.img(i.image))}" data-fallback="${escapeHTML(WT.imgOriginal(i.image))}" alt=""><span class="q">${i.quantity}</span></div><div class="nm">${escapeHTML(i.name)}</div><b>${formatPrice(i.price * i.quantity)}</b></div>`).join('');
  }

  const zone = () => cfg.zones.find((z) => z.id === f.zone) || cfg.zones[0];
  function deliveryFee(sub) { const z = zone(); if (z.quote) return null; return z.freeOverThreshold && sub >= cfg.freeDeliveryThreshold ? 0 : Number(z.fee) || 0; }
  function calc() {
    const sub = Cart.getTotal(); const disc = coupon ? Math.min(coupon.discount, sub) : 0; const fee = deliveryFee(sub);
    return { sub, disc, fee, total: Math.max(0, sub - disc + (fee || 0)) };
  }
  function totals() {
    const el = document.getElementById('co-totals'); if (!el) return;
    // coupon discount may change when the cart changes
    const { sub, disc, fee, total } = calc();
    el.innerHTML = `
      <div class="sum-row"><span>Subtotal</span><b>${formatPrice(sub)}</b></div>
      ${disc ? `<div class="sum-row disc"><span>Code ${escapeHTML(coupon.code)}</span><b>− ${formatPrice(disc)}</b></div>` : ''}
      <div class="sum-row"><span>Delivery (${escapeHTML(zone().name)})</span><b>${fee === null ? 'We set the fee after you order' : fee === 0 ? 'Free' : formatPrice(fee)}</b></div>
      <div class="sum-total"><span>Total</span><strong>${formatPrice(total)}</strong></div>
      ${fee === null ? '<p class="fine">We will set the delivery fee and show it on your tracking page before you pay.</p>' : ''}`;
    const bt = document.getElementById('btn-total'); if (bt) bt.textContent = formatPrice(total);
    cfg.zones.forEach((z) => { const e = document.querySelector(`[data-fee="${z.id}"]`); if (!e) return; const fz = z.quote ? 'Fee set after you order' : (z.freeOverThreshold && sub >= cfg.freeDeliveryThreshold ? 'Free' : formatPrice(z.fee)); e.textContent = fz; });
  }

  function saveDraft() { try { sessionStorage.setItem(DRAFT, JSON.stringify(f)); } catch (e) { /* ignore */ } }
  function bind() {
    const map = { 'f-name': 'name', 'f-phone': 'phone', 'f-email': 'email', 'f-street': 'street', 'f-notes': 'notes' };
    Object.entries(map).forEach(([id, key]) => document.getElementById(id).addEventListener('input', (e) => { f[key] = e.target.value; e.target.classList.remove('invalid'); const er = document.getElementById('e-' + key); if (er) er.textContent = ''; saveDraft(); }));
    document.querySelectorAll('input[name=zone]').forEach((r) => r.addEventListener('change', () => { f.zone = r.value; saveDraft(); totals(); }));
    document.querySelectorAll('input[name=pay]').forEach((r) => r.addEventListener('change', () => { f.pay = r.value; saveDraft(); }));
    document.getElementById('pin-btn').addEventListener('click', async () => {
      const pick = await WT.pickLocation({ lat: f.lat, lng: f.lng, zones: cfg.zones }); if (!pick) return;
      f.lat = pick.lat; f.lng = pick.lng;
      if (pick.zoneId && pick.zoneId !== f.zone) { f.zone = pick.zoneId; const rd = document.querySelector(`input[name=zone][value="${pick.zoneId}"]`); if (rd) rd.checked = true; totals(); }
      const st = document.getElementById('f-street'); if (pick.label && !st.value.trim()) { st.value = pick.label; f.street = pick.label; }
      document.getElementById('pin-txt').textContent = 'Change pin on map';
      document.getElementById('pin-note').innerHTML = '<i class="fa-solid fa-circle-check" style="color:var(--success,#1fa855)"></i> Pin saved' + (pick.zoneId ? ' and delivery area set.' : '.') + ' Add a landmark below so the rider can find the gate.';
      saveDraft();
    });
    document.getElementById('coupon-btn').addEventListener('click', applyCoupon);
    document.getElementById('f-coupon').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); applyCoupon(); } });
    document.getElementById('co-form').addEventListener('submit', submit);
  }

  async function applyCoupon() {
    const code = document.getElementById('f-coupon').value.trim(); const msg = document.getElementById('coupon-msg');
    if (!code) { coupon = null; msg.textContent = ''; return totals(); }
    const btn = document.getElementById('coupon-btn'); btn.disabled = true;
    try {
      const r = await window.apiFetch('/shop/coupons/validate', { method: 'POST', body: JSON.stringify({ code, subtotal: Cart.getTotal() }) });
      coupon = { code: r.code, discount: r.discount }; msg.className = 'coupon-msg ok'; msg.innerHTML = `<i class="fa-solid fa-circle-check"></i> ${escapeHTML(r.description || 'Code applied')}`;
    } catch (e) { coupon = null; msg.className = 'coupon-msg bad'; msg.textContent = e.message || 'That code is not valid'; }
    btn.disabled = false; totals();
  }

  function validate() {
    const errs = {};
    if (f.name.trim().length < 2) errs.name = 'Please enter your name';
    const d = String(f.phone).replace(/\D/g, '');
    if (d.length < 9 || d.length > 15) errs.phone = 'Enter a phone number we can reach, e.g. 0751 924 844';
    if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) errs.email = 'That email does not look right';
    if (f.street.trim().length < 3) errs.street = 'Tell us where to deliver';
    Object.keys({ name: 1, phone: 1, email: 1, street: 1 }).forEach((k) => { const e = document.getElementById('e-' + k), i = document.getElementById('f-' + k); if (e) e.textContent = errs[k] || ''; if (i) i.classList.toggle('invalid', !!errs[k]); });
    const first = Object.keys(errs)[0]; if (first) document.getElementById('f-' + first).focus();
    return !first;
  }

  async function submit(e) {
    e.preventDefault(); if (busy || !validate()) return;
    const btn = document.getElementById('place-btn'), err = document.getElementById('co-error'); err.hidden = true;
    busy = true; btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Placing your order…';
    try {
      const data = await window.apiFetch('/orders', { method: 'POST', body: JSON.stringify({
        items: Cart.getAvailableItems().map((i) => ({ productId: i.productId, quantity: i.quantity })),
        customerName: f.name.trim(), customerPhone: f.phone.trim(), customerEmail: f.email.trim() || undefined,
        deliveryZone: f.zone, shippingAddress: { street: f.street.trim(), city: zone().name, ...(f.lat != null ? { lat: f.lat, lng: f.lng } : {}) }, paymentMethod: f.pay, couponCode: coupon ? coupon.code : undefined, notes: f.notes.trim() || undefined }) });
      try { sessionStorage.setItem('wt-last-order', JSON.stringify({ order: data.order, quote: !!data.deliveryQuote })); sessionStorage.removeItem(DRAFT); localStorage.setItem(SAVED, JSON.stringify({ name: f.name, phone: f.phone, email: f.email, zone: f.zone, street: f.street, pay: f.pay, lat: f.lat, lng: f.lng })); } catch (x) { /* ignore */ }
      Cart.clear(); location.href = '/order-confirmation';
    } catch (ex) {
      busy = false; btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-lock"></i> Place order · <span id="btn-total"></span>'; totals();
      const offline = !ex.status; // network failure / backend down
      err.hidden = false;
      err.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i><span>${escapeHTML(offline ? 'We couldn\'t reach our server just now. Your details are saved, please try again in a moment.' : ex.message || 'Something went wrong.')}</span>`;
      err.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }
})();
