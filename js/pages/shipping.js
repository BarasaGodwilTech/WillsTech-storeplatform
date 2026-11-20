/** pages/shipping.js — fills the delivery table from /api/shop/config so it always matches checkout. */
(async function () {
  let cfg = null;
  try { cfg = await window.apiFetch('/shop/config'); } catch (e) { /* offline: keep defaults below */ }
  cfg = cfg || { freeDeliveryThreshold: SITE.freeDeliveryThreshold, zones: [{ name: 'Kampala', fee: 0, quote: true, eta: 'Same day for orders before 3 pm' }, { name: 'Mbale', fee: 0, quote: true, eta: 'Next day' }, { name: 'Elsewhere in Uganda', quote: true, eta: 'Courier' }],
    paymentMethods: [{ name: 'MTN MoMo', hint: 'Pay on delivery or send first' }, { name: 'Airtel Money', hint: 'Pay on delivery or send first' }, { name: 'Cash on delivery', hint: 'Pay the rider' }] };
  const th = Number(cfg.freeDeliveryThreshold) || 0;
  document.getElementById('zones-body').innerHTML = cfg.zones.map((z) => {
    const fee = z.quote ? 'Set after you order' : Number(z.fee) === 0 ? 'Free' : (z.freeOverThreshold && th > 0 ? `${formatPrice(z.fee)} (free over ${formatPrice(th)})` : formatPrice(z.fee));
    return `<tr><td><b style="color:var(--text-primary)">${escapeHTML(z.name)}</b></td><td>${escapeHTML(z.eta || '')}</td><td>${fee}</td></tr>`;
  }).join('');
  document.getElementById('pay-list').innerHTML = cfg.paymentMethods.map((m) => `<li><b>${escapeHTML(m.name)}</b>${m.hint ? ': ' + escapeHTML(m.hint) : ''}</li>`).join('') + '<li><b>WhatsApp</b>: talk to us first and we\'ll agree the best way to pay</li>';
})();
