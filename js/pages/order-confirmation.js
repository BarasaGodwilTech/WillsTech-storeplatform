/** pages/order-confirmation.js — shown right after checkout (reads the order saved by checkout.js). */
(function () {
  'use strict';
  const root = document.getElementById('confirm-root');
  let data = null; try { data = JSON.parse(sessionStorage.getItem('wt-last-order') || 'null'); } catch (e) { /* ignore */ }
  if (!data || !data.order) {
    root.innerHTML = `<div class="notfound" style="padding-top:40px"><h1 style="font-size:36px">No recent order here</h1><p class="text-muted">If you just placed one, you can look it up with your order number.</p><div class="form-actions" style="justify-content:center"><a class="btn btn-primary btn-lg" href="/track-order">Track an order</a><a class="btn btn-secondary btn-lg" href="/shop">Keep shopping</a></div></div>`;
    return;
  }
  const o = data.order, first = String(o.customerName || '').split(' ')[0];
  const addr = o.shippingAddress || {};
  const pay = {
    momo: ['fa-mobile-screen-button', 'Pay with MTN MoMo', 'Pay when your order arrives. We will tell you if we need anything first.'],
    airtel: ['fa-mobile-screen-button', 'Pay with Airtel Money', 'Pay when your order arrives. We will tell you if we need anything first.'],
    cod: ['fa-money-bill-wave', 'Pay the rider', 'Have cash ready when your order arrives.'],
    bank: ['fa-building-columns', 'Bank transfer', 'We will show the account details on your tracking page.'],
  }[o.paymentMethod] || [];
  const ic = (c) => (c.startsWith('fa-brands') ? c : 'fa-solid ' + c);

  root.innerHTML = `
    <div class="confirm-hero">
      <div class="tick"><i class="fa-solid fa-check"></i></div>
      <h1>Thank you${first ? ', ' + escapeHTML(first) : ''}!</h1>
      <p class="text-muted" style="font-size:18px">Your order is in. Your order number is</p>
      <div class="order-no"><span id="ono">${escapeHTML(o.orderNumber)}</span><button id="copy-ono" aria-label="Copy order number"><i class="fa-regular fa-copy"></i></button></div>
    </div>
    ${data.quote ? '<div class="callout"><i class="fa-solid fa-truck"></i><span>We will confirm your delivery fee and show it on your tracking page before anything is paid.</span></div>' : ''}
    <div class="panel"><h2>What happens next</h2><ul class="next-steps">
      <li><i class="fa-solid fa-circle-check"></i><div><b>We confirm your order</b><br><span class="text-muted">We check stock and set your delivery date. You will see every update on your tracking page.</span></div></li>
      ${pay.length ? `<li><i class="${ic(pay[0])}"></i><div><b>${pay[1]}</b><br><span class="text-muted">${pay[2]}</span></div></li>` : ''}
      <li><i class="fa-solid fa-truck-fast"></i><div><b>We deliver</b><br><span class="text-muted">Track it any time with your order number and phone. No need to message us.</span></div></li></ul></div>
    <div class="panel"><h2>Your order</h2>${WT.orderLines(o.items)}${WT.orderTotals(o)}
      <div style="display:grid;gap:6px;margin-top:20px;padding-top:18px;border-top:1px solid var(--border);font-size:15px;color:var(--text-secondary)">
        <div><b style="color:var(--text-primary)">Deliver to:</b> ${escapeHTML(o.customerName)}, ${escapeHTML(o.customerPhone)}</div>
        <div>${escapeHTML(o.deliveryZone || '')}${addr.street ? ', ' + escapeHTML(addr.street) : ''}</div>
        <div><b style="color:var(--text-primary)">Payment:</b> ${escapeHTML(WT.payLabel(o.paymentMethod))}</div></div></div>
    <div class="form-actions" style="justify-content:center"><a class="btn btn-dark btn-lg" href="/track-order?number=${encodeURIComponent(o.orderNumber)}&contact=${encodeURIComponent(o.customerPhone)}"><i class="fa-solid fa-truck-fast"></i> Track this order</a><a class="btn btn-secondary btn-lg" href="/shop">Keep shopping</a></div>`;
  document.getElementById('copy-ono').addEventListener('click', async () => { try { await navigator.clipboard.writeText(o.orderNumber); showNotification('Order number copied', 'success'); } catch (e) { showNotification(o.orderNumber, 'info'); } });
})();
