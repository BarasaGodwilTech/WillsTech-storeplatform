/** pages/contact.js — contact form: saves to the database, with a WhatsApp option and fallback. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const q = new URLSearchParams(location.search);
  if (q.get('subject')) { const s = $('c-subject'); [...s.options].forEach((o) => { if (o.text.toLowerCase().includes(q.get('subject').toLowerCase())) s.value = o.text; }); }
  if (q.get('message')) $('c-message').value = q.get('message');
  const data = () => ({ name: $('c-name').value.trim(), phone: $('c-phone').value.trim(), email: $('c-email').value.trim(), subject: $('c-subject').value, message: $('c-message').value.trim() });
  const waText = (d) => `Hi Will's Tech! (${d.subject})\n${d.message}\n\n– ${d.name}${d.phone ? ', ' + d.phone : ''}`;
  const err = $('c-error');
  const fail = (m) => { err.hidden = false; err.innerHTML = `<i class="fa-solid fa-circle-exclamation"></i><span>${m}</span>`; };
  const check = (d) => { err.hidden = true; if (!d.name || !d.message) { fail('Please add your name and a message.'); return false; } if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) { fail('That email address does not look right.'); return false; } return true; };

  $('c-wa').addEventListener('click', () => { const d = data(); if (check(d)) window.open(WT.waLink(waText(d)), '_blank', 'noopener'); });
  $('contact-form').addEventListener('submit', async (e) => {
    e.preventDefault(); const d = data(); if (!check(d)) return;
    const b = $('c-send'); b.disabled = true; b.innerHTML = '<span class="spinner"></span> Sending…';
    try {
      await window.apiFetch('/shop/contact', { method: 'POST', body: JSON.stringify(d) });
      $('contact-form').innerHTML = `<div class="confirm-hero" style="padding:20px 0"><div class="tick"><i class="fa-solid fa-check"></i></div><h2 style="font-size:28px">Message sent</h2><p class="text-muted">Thanks, ${escapeHTML(d.name.split(' ')[0])}. We'll get back to you soon. For something urgent, WhatsApp is quickest.</p><a class="btn btn-wa" target="_blank" rel="noopener" href="${WT.waLink('Hi! I just sent a message through the website.')}"><i class="fa-brands fa-whatsapp"></i> Chat now</a></div>`;
    } catch (ex) {
      b.disabled = false; b.innerHTML = '<i class="fa-solid fa-paper-plane"></i> Send message';
      fail(`${escapeHTML(ex.status ? ex.message : "We couldn't reach our server.")} You can send it on WhatsApp instead using the green button.`);
    }
  });
})();
