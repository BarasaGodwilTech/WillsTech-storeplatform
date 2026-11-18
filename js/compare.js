/**
 * compare.js — pick up to 3 products from any card and compare them side by side.
 */
(function () {
  'use strict';
  const MAX = 3, KEY = 'wt-compare';
  const C = (WT.Compare = { ids: [] });
  const load = () => { try { C.ids = JSON.parse(sessionStorage.getItem(KEY) || '[]').slice(0, MAX); } catch (e) { C.ids = []; } };
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(C.ids)); } catch (e) { /* ignore */ } };
  const prod = (id) => Products.getProductById(id);
  const humanize = (k) => String(k).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  let bar = null;

  C.toggle = function (id) {
    id = String(id); const i = C.ids.indexOf(id);
    if (i >= 0) C.ids.splice(i, 1);
    else { if (C.ids.length >= MAX) return showNotification(`You can compare up to ${MAX} products. Remove one first.`, 'info'); C.ids.push(id); }
    save(); sync();
  };
  function sync() {
    document.querySelectorAll('[data-compare]').forEach((b) => { const on = C.ids.includes(String(b.dataset.compare)); b.classList.toggle('active', on); b.setAttribute('aria-pressed', on ? 'true' : 'false'); const l = b.querySelector('.cmp-label'); if (l) l.textContent = on ? 'In compare' : 'Compare'; });
    if (!bar) { bar = createElement('div', 'cmp-bar'); bar.setAttribute('role', 'region'); bar.setAttribute('aria-label', 'Compare products'); document.body.appendChild(bar); bar.addEventListener('click', onBar); }
    const list = C.ids.map(prod).filter(Boolean);
    bar.classList.toggle('show', list.length > 0);
    document.body.classList.toggle('has-cmp', list.length > 0);
    bar.innerHTML = `<div class="cmp-items">${list.map((p) => `<span class="cmp-chip"><img src="${escapeHTML(WT.img((p.images || [])[0]))}" alt=""><button data-rm="${p.id}" aria-label="Remove ${escapeHTML(p.name)}"><i class="fa-solid fa-xmark"></i></button></span>`).join('')}
      ${Array.from({ length: MAX - list.length }, () => '<span class="cmp-chip empty"><i class="fa-solid fa-plus"></i></span>').join('')}</div>
      <div class="cmp-text"><b>${list.length} selected</b><span>${list.length < 2 ? 'Pick at least 2' : 'Ready to compare'}</span></div>
      <button class="btn btn-primary btn-sm" data-open ${list.length < 2 ? 'disabled' : ''}>Compare</button><button class="link-btn" data-clear>Clear</button>`;
  }
  function onBar(e) {
    const rm = e.target.closest('[data-rm]'); if (rm) return C.toggle(rm.dataset.rm);
    if (e.target.closest('[data-clear]')) { C.ids = []; save(); return sync(); }
    if (e.target.closest('[data-open]')) open();
  }
  function open() {
    const list = C.ids.map(prod).filter(Boolean); if (list.length < 2) return;
    const keys = []; list.forEach((p) => Object.keys(p.specifications || {}).forEach((k) => { if (!keys.includes(k) && (p.specifications[k] !== '' && p.specifications[k] !== null)) keys.push(k); }));
    const row = (label, fn, cls) => `<tr class="${cls || ''}"><th scope="row">${label}</th>${list.map((p) => `<td>${fn(p)}</td>`).join('')}</tr>`;
    const m = createElement('div', 'wt-modal'); m.setAttribute('role', 'dialog'); m.setAttribute('aria-modal', 'true'); m.setAttribute('aria-label', 'Compare products');
    m.innerHTML = `<div class="wt-modal-card cmp-card"><button class="wt-modal-close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button><h2 style="font-size:26px;margin-bottom:18px">Compare</h2>
      <div class="table-wrap" style="margin:0"><table class="cmp-table"><tbody>
      ${row('', (p) => `<a href="${Products.href(p)}"><img class="cmp-img" src="${escapeHTML(WT.img((p.images || [])[0]))}" alt=""></a><a class="cmp-name" href="${Products.href(p)}">${escapeHTML(p.name)}</a>`, 'cmp-head')}
      ${row('Price', (p) => `<b>${formatPrice(p.price)}</b>${Products.discountPct(p) ? `<br><s>${formatPrice(p.originalPrice)}</s>` : ''}`)}
      ${row('Brand', (p) => escapeHTML(Products.brand(p)))}${row('Category', (p) => escapeHTML(WT.cap(p.category || '')))}
      ${row('Rating', (p) => (p.rating ? `${Number(p.rating).toFixed(1)} (${p.reviewCount || 0})` : '–'))}
      ${row('Availability', (p) => ({ 'in-stock': 'In stock', limited: 'Low stock', 'pre-order': 'Pre-order', 'out-of-stock': 'Sold out' }[p.stock] || '–'))}
      ${keys.slice(0, 10).map((k) => row(escapeHTML(humanize(k)), (p) => escapeHTML(p.specifications && p.specifications[k] !== undefined && p.specifications[k] !== '' ? p.specifications[k] : '–'))).join('')}
      ${row('', (p) => (Products.isOut(p) ? '' : `<button class="btn btn-primary btn-sm add-to-cart-btn" data-id="${p.id}">Add to cart</button>`))}
      </tbody></table></div></div>`;
    document.body.appendChild(m); document.body.style.overflow = 'hidden';
    const close = () => { m.remove(); document.body.style.overflow = ''; document.removeEventListener('keydown', k); };
    const k = (e) => { if (e.key === 'Escape') close(); }; document.addEventListener('keydown', k);
    m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('.wt-modal-close')) close(); });
  }
  document.addEventListener('click', (e) => { const b = e.target.closest('[data-compare]'); if (b) { e.preventDefault(); C.toggle(b.dataset.compare); } });
  document.addEventListener('wt:cards-rendered', sync);
  C.init = () => { load(); WT.ready(sync); };
})();
