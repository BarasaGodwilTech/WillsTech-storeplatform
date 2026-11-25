/** pages/order.js — shared order helpers: status timeline, line items, totals. */
(function () {
  'use strict';
  const STEPS = [
    ['pending', 'Order placed', 'We have your order'],
    ['confirmed', 'Confirmed', 'We have confirmed your order and are planning delivery'],
    ['shipped', 'Out for delivery', 'On its way to you'],
    ['completed', 'Delivered', 'Enjoy your new gear'],
  ];
  WT.statusLabel = (s) => ({ pending: 'Order placed', confirmed: 'Confirmed', shipped: 'Out for delivery', completed: 'Delivered', cancelled: 'Cancelled' }[s] || WT.cap(s));
  WT.statusPill = (s) => `<span class="status-pill ${escapeHTML(s)}"><i class="fa-solid ${{ pending: 'fa-clock', confirmed: 'fa-circle-check', shipped: 'fa-truck-fast', completed: 'fa-box-open', cancelled: 'fa-ban' }[s] || 'fa-circle'}"></i>${WT.statusLabel(s)}</span>`;

  WT.orderTimeline = function (status, events) {
    const at = {}; (events || []).forEach((e) => { if (!at[e.status]) at[e.status] = e.at; });
    const steps = status === 'cancelled' ? [STEPS[0], ['cancelled', 'Cancelled', (events || []).find((e) => e.status === 'cancelled')?.note || 'This order was cancelled']] : STEPS;
    const cur = steps.findIndex((s) => s[0] === status);
    return `<div class="timeline">${steps.map(([k, label, sub], i) => {
      const state = status === 'completed' || i < cur ? 'done' : i === cur ? (status === 'cancelled' ? 'done' : 'now') : 'todo';
      const when = at[k] ? `${WT.date(at[k], { weekday: 'short', day: 'numeric', month: 'short' })}, ${WT.time(at[k])}` : (state === 'todo' ? 'Pending' : '');
      return `<div class="tl ${state}${k === 'cancelled' ? ' cancelled' : ''}"><div class="rail"><span class="dot">${state === 'done' ? '<i class="fa-solid fa-check"></i>' : ''}</span><span class="bar"></span></div><div class="txt"><b>${label}</b><span>${escapeHTML(state === 'todo' ? sub : (when || sub))}</span></div></div>`;
    }).join('')}</div>`;
  };

  WT.orderLines = (items) => `<div class="order-lines">${(items || []).map((i) => `<div class="order-line"><img src="${escapeHTML(WT.img(i.image))}" data-fallback="${escapeHTML(WT.imgOriginal(i.image))}" alt=""><div><b style="font-size:15px">${escapeHTML(i.name)}</b><div class="text-muted" style="font-size:13.5px">Qty ${i.quantity} × ${formatPrice(i.price)}</div></div><b>${formatPrice(i.price * i.quantity)}</b></div>`).join('')}</div>`;

  WT.orderTotals = (o) => `<div style="display:grid;gap:10px;margin-top:18px;padding-top:18px;border-top:1px solid var(--border)">
    <div class="sum-row"><span>Subtotal</span><b>${formatPrice(o.subtotal)}</b></div>
    ${o.discount ? `<div class="sum-row disc"><span>Discount${o.couponCode ? ` (${escapeHTML(o.couponCode)})` : ''}</span><b>− ${formatPrice(o.discount)}</b></div>` : ''}
    <div class="sum-row"><span>Delivery${o.deliveryZone ? ` (${escapeHTML(o.deliveryZone)})` : ''}</span><b>${o.deliveryFee ? formatPrice(o.deliveryFee) : 'To be confirmed'}</b></div>
    <div class="sum-total"><span>Total</span><strong>${formatPrice(o.total)}</strong></div></div>`;

  WT.payLabel = (m) => ({ momo: 'MTN MoMo', airtel: 'Airtel Money', cod: 'Cash on delivery', bank: 'Bank transfer' }[m] || WT.cap(m));
})();
