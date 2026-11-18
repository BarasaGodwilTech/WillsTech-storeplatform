/** pages/order-confirmation.js — shown right after checkout (reads the order saved by checkout.js). */
(function () {
  'use strict';
  const root = document.getElementById('confirm-root');
  let data = null; try { data = JSON.parse(sessionStorage.getItem('wt-last-order') || 'null'); } catch (e) { /* ignore */ }
  if (!data || !data.order) {
    root.innerHTML = `<div class="notfound" style="padding-top:40px"><h1 style="font-size:36px">No recent order here</h1><p class="text-muted">If you just placed one, you can look it up with your order number.</p><div class="form-actions" style="justify-content:center"><a class="btn btn-primary btn-lg" href="track-order.html">Track an order</a><a class="btn btn-secondary btn-lg" href="shop.html">Keep shopping</a></div></div>`;
    return;
  }
  const o = data.order, first = String(o.customerName || '').split(' ')[0];
  const addr = o.shippingAddress || {};
  const msg = `Hi Will's Tech! I just placed order ${o.orderNumber}.\n` +
    o.items.map((i) => `• ${i.quantity} × ${i.name}`).join('\n') + `\nTotal: ${formatPrice(o.total)}\nDeliver to: ${o.deliveryZone}${addr.street ? ', ' + addr.street : ''}\nPayment: ${WT.payLabel(o.paymentMethod)}\nPlease confirm. Thank you!`;
  const next = {
    momo: ['fa-brands fa-whatsapp', 'We confirm on WhatsApp', 'We message you to confirm stock and delivery time.', 'fa-mobile-screen-button', 'Pay with MTN MoMo', 'Pay when it arrives, or send first if we ask you to.'],
    airtel: ['fa-brands fa-whatsapp', 'We confirm on WhatsApp', 'We message you to confirm stock and delivery time.', 'fa-mobile-screen-button', 'Pay with Airtel Money', 'Pay when it arrives, or send first if we ask you to.'],
    cod: ['fa-brands fa-whatsapp', 'We confirm on WhatsApp', 'We message you to confirm stock and delivery time.', 'fa-money-bill-wave', 'Pay the rider', 'Have cash ready when your order arrives.'],
    whatsapp: ['fa-brands fa-whatsapp', 'Chat with us', 'Send the message below so we can confirm everything.', 'fa-wallet', 'Pay your way', 'We\'ll agree how you\'d like to pay when we chat.'],
  }[o.paymentMethod] || [];
  const ic = (c) => (c.startsWith('fa-brands') ? c : 'fa-solid ' + c);

  root.innerHTML = `
    <div class="confirm-hero">
      <div class="tick"><i class="fa-solid fa-check"></i></div>
      <h1>Thank you${first ? ', ' + escapeHTML(first) : ''}!</h1>
      <p class="text-muted" style="font-size:18px">Your order is in. Your order number is</p>
      <div class="order-no"><span id="ono">${escapeHTML(o.orderNumber)}</span><button id="copy-ono" aria-label="Copy order number"><i class="fa-regular fa-copy"></i></button></div>
    </div>
    <div class="panel" style="text-align:center;display:grid;gap:14px;justify-items:center">
      <h2 style="margin:0">One last step: confirm on WhatsApp</h2>
      <p class="text-muted" style="max-width:52ch">It lets us check stock, agree a delivery time and answer any questions straight away.</p>
      <a class="btn btn-wa btn-lg" target="_blank" rel="noopener" href="${WT.waLink(msg)}"><i class="fa-brands fa-whatsapp"></i> Send my order on WhatsApp</a>
    </div>
    ${data.quote ? '<div class="callout"><i class="fa-solid fa-truck"></i><span>You chose delivery outside Kampala and Mbale. We\'ll message you the courier fee before you pay anything.</span></div>' : ''}
    <div class="panel"><h2>What happens next</h2><ul class="next-steps">
      ${next.length ? `<li><i class="${ic(next[0])}"></i><div><b>${next[1]}</b><br><span class="text-muted">${next[2]}</span></div></li><li><i class="${ic(next[3])}"></i><div><b>${next[4]}</b><br><span class="text-muted">${next[5]}</span></div></li>` : ''}
      <li><i class="fa-solid fa-truck-fast"></i><div><b>We deliver</b><br><span class="text-muted">Track it any time with your order number.</span></div></li></ul></div>
    <div class="panel"><h2>Your order</h2>${WT.orderLines(o.items)}${WT.orderTotals(o)}
      <div style="display:grid;gap:6px;margin-top:20px;padding-top:18px;border-top:1px solid var(--border);font-size:15px;color:var(--text-secondary)">
        <div><b style="color:var(--text-primary)">Deliver to:</b> ${escapeHTML(o.customerName)}, ${escapeHTML(o.customerPhone)}</div>
        <div>${escapeHTML(o.deliveryZone || '')}${addr.street ? ', ' + escapeHTML(addr.street) : ''}</div>
        <div><b style="color:var(--text-primary)">Payment:</b> ${escapeHTML(WT.payLabel(o.paymentMethod))}</div></div></div>
    <div class="form-actions" style="justify-content:center"><a class="btn btn-dark btn-lg" href="track-order.html?number=${encodeURIComponent(o.orderNumber)}&contact=${encodeURIComponent(o.customerPhone)}"><i class="fa-solid fa-truck-fast"></i> Track this order</a><a class="btn btn-secondary btn-lg" href="shop.html">Keep shopping</a></div>`;
  document.getElementById('copy-ono').addEventListener('click', async () => { try { await navigator.clipboard.writeText(o.orderNumber); showNotification('Order number copied', 'success'); } catch (e) { showNotification(o.orderNumber, 'info'); } });
})();
