/** pages/track.js — guest order lookup by order number + phone/email. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const q = new URLSearchParams(location.search);
  let last = null; try { last = JSON.parse(sessionStorage.getItem('wt-last-order') || 'null'); } catch (e) { /* ignore */ }
  $('t-number').value = q.get('number') || (last && last.order.orderNumber) || '';
  $('t-contact').value = q.get('contact') || (last && last.order.customerPhone) || '';

  async function lookup(e) {
    if (e) e.preventDefault();
    const number = $('t-number').value.trim(), contact = $('t-contact').value.trim(), err = $('t-error'), btn = $('t-btn');
    err.hidden = true; $('track-result').innerHTML = '';
    if (!number || !contact) { err.hidden = false; err.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i><span>Please fill in both fields.</span>'; return; }
    btn.disabled = true; btn.innerHTML = '<span class="spinner"></span> Looking…'; $('track-result').innerHTML = '<div class="skeleton" style="height:300px;border-radius:32px"></div><div class="skeleton" style="height:200px;border-radius:32px"></div>';
    try {
      const d = await window.apiFetch(`/orders/track?number=${encodeURIComponent(number)}&contact=${encodeURIComponent(contact)}`);
      const o = d.order;
      $('track-result').innerHTML = `
        <div class="panel"><div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:6px"><div><div class="text-muted" style="font-size:14px;font-weight:600">Order ${escapeHTML(o.orderNumber)}</div><div style="font:800 28px var(--font-display);letter-spacing:-.03em;margin-top:2px">${WT.statusLabel(o.status)}</div></div>${WT.statusPill(o.status)}</div>
          <p class="text-muted" style="margin-bottom:22px">Placed ${WT.date(o.createdAt)} · ${escapeHTML(WT.payLabel(o.paymentMethod))}</p>${WT.orderTimeline(o.status, d.events)}</div>
        <div class="panel"><h2>Items</h2>${WT.orderLines(o.items)}${WT.orderTotals(o)}</div>
        <div class="form-actions" style="justify-content:center"><a class="btn btn-secondary btn-lg" href="${WT.page('contact.html')}?subject=${encodeURIComponent('Order support')}&message=${encodeURIComponent(`Hi! I'm checking on order ${o.orderNumber}.`)}"><i class="fa-regular fa-comment-dots"></i> Need help with this order?</a></div>`;
      $('track-result').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (ex) { $('track-result').innerHTML = ''; err.hidden = false; err.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i><span>${escapeHTML(ex.status ? ex.message : "We couldn't reach our server. Please try again, or message us on WhatsApp.")}</span>`; }
    btn.disabled = false; btn.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i> Find my order';
  }
  $('track-form').addEventListener('submit', lookup);
  if (q.get('number') && q.get('contact')) lookup();
})();
