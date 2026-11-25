/** pages/shop.js — filtering, sorting, search and "show more", with the state kept in the URL. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const PAGE = 12;
  const slug = (v) => String(v || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');   // same rule as the server's category addresses
  const catName = (sl) => { const c = (Products.categories() || []).find((x) => slug(x.name) === sl); return c ? c.name : sl; };
  const state = { category: '', collection: '', q: '', sort: 'featured', min: '', max: '', instock: false, brands: [], shown: PAGE };

  const COLLECTIONS = [['', 'All products'], ['new', 'New arrivals'], ['bestseller', 'Best sellers'], ['sale', 'On sale']];
  const SORTS = {
    featured: (a, b) => Number(b.featured) - Number(a.featured) || (b.rating || 0) - (a.rating || 0),
    newest: (a, b) => new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0),
    'price-asc': (a, b) => a.price - b.price, 'price-desc': (a, b) => b.price - a.price,
    rating: (a, b) => (b.rating || 0) - (a.rating || 0) || (b.reviewCount || 0) - (a.reviewCount || 0),
    discount: (a, b) => Products.discountPct(b) - Products.discountPct(a),
  };

  function readURL() {
    const q = new URLSearchParams(location.search);
    // Category lives in the address (/shop/smartphones); ?category= is the old form, still understood.
    const pm = /^\/shop\/([^/]+)\/?$/.exec(location.pathname);
    state.category = (pm ? decodeURIComponent(pm[1]) : (q.get('category') || '')).toLowerCase();
    state.collection = q.get('filter') || ''; state.q = q.get('q') || ''; state.sort = SORTS[q.get('sort')] ? q.get('sort') : 'featured';
    state.min = q.get('min') || ''; state.max = q.get('max') || ''; state.instock = q.get('stock') === '1'; state.brands = (q.get('brand') || '').split(',').filter(Boolean);
  }
  function writeURL() {
    const q = new URLSearchParams();
    if (state.collection) q.set('filter', state.collection);
    if (state.q) q.set('q', state.q); if (state.sort !== 'featured') q.set('sort', state.sort);
    if (state.min) q.set('min', state.min); if (state.max) q.set('max', state.max); if (state.instock) q.set('stock', '1'); if (state.brands.length) q.set('brand', state.brands.join(','));
    const path = state.category ? '/shop/' + encodeURIComponent(state.category) : '/shop';
    history.replaceState(null, '', path + (q.toString() ? '?' + q : ''));
  }

  function matches(p) {
    if (state.category && slug(p.category) !== slug(state.category)) return false;
    if (state.collection === 'new' && !(p.badges || []).includes('new')) return false;
    if (state.collection === 'bestseller' && !(p.badges || []).includes('bestseller')) return false;
    if (state.collection === 'sale' && Products.discountPct(p) <= 0) return false;
    if (state.instock && (Products.isOut(p) || p.stock === 'pre-order')) return false;
    if (state.brands.length && !state.brands.includes(Products.brand(p))) return false;
    if (state.min !== '' && p.price < Number(state.min)) return false;
    if (state.max !== '' && p.price > Number(state.max)) return false;
    if (state.q) { const hay = `${p.name} ${p.category} ${p.sku || ''} ${p.description || ''}`.toLowerCase(); if (!state.q.toLowerCase().split(/\s+/).every((w) => hay.includes(w))) return false; }
    return true;
  }

  function sidebar(all) {
    $('f-collections').innerHTML = COLLECTIONS.map(([k, label]) => `<button class="filter-opt${state.collection === k ? ' active' : ''}" data-col="${k}">${label}</button>`).join('');
    const cats = Products.categories();
    $('f-categories').innerHTML = `<button class="filter-opt${state.category === '' ? ' active' : ''}" data-cat="">All categories <span>${all.length}</span></button>` +
      cats.map((c) => `<button class="filter-opt${slug(state.category) === slug(c.name) ? ' active' : ''}" data-cat="${escapeHTML(slug(c.name))}">${escapeHTML(WT.cap(c.name))} <span>${c.count}</span></button>`).join('');
  }

  function brandsAndQuick() {
    const br = Products.brands();
    $('f-brands').innerHTML = br.map((b) => `<button class="filter-opt${state.brands.includes(b.name) ? ' active' : ''}" data-brand="${escapeHTML(b.name)}"><b class="fl"><span class="box"><i class="fa-solid fa-check"></i></span>${escapeHTML(b.name)}</b><span>${b.count}</span></button>`).join('') || '<p class="form-hint">No brands yet</p>';
    const qc = [['max200', 'Under UGX 200,000', state.max === '200000' && state.min === ''], ['new', 'New in', state.collection === 'new'], ['bestseller', 'Best sellers', state.collection === 'bestseller'], ['sale', 'On sale', state.collection === 'sale']];
    $('quick-chips').innerHTML = '<span class="lead">Popular:</span>' + qc.map(([k, l, on]) => `<button class="chip${on ? ' active' : ''}" data-qc="${k}">${l}</button>`).join('') +
      br.slice(0, 4).map((b) => `<button class="chip${state.brands.length === 1 && state.brands[0] === b.name ? ' active' : ''}" data-qc="brand:${escapeHTML(b.name)}">${escapeHTML(b.name)}</button>`).join('');
  }

  function chips() {
    const out = [];
    const add = (label, clear) => out.push(`<button class="chip" data-clear="${clear}">${escapeHTML(label)} <i class="fa-solid fa-xmark"></i></button>`);
    if (state.category) add(WT.cap(catName(slug(state.category))), 'category'); if (state.collection) add((COLLECTIONS.find((c) => c[0] === state.collection) || [0, state.collection])[1], 'collection');
    state.brands.forEach((b) => add(b, 'brand:' + b));
    if (state.q) add(`“${state.q}”`, 'q'); if (state.min !== '' || state.max !== '') add(`UGX ${state.min || 0} – ${state.max || '∞'}`, 'price'); if (state.instock) add('In stock', 'instock');
    $('active-filters').innerHTML = out.join('');
  }

  function render() {
    const all = Products.active();
    const list = all.filter(matches).sort(SORTS[state.sort]);
    sidebar(all); brandsAndQuick(); chips(); writeURL();
    const title = state.collection ? (COLLECTIONS.find((c) => c[0] === state.collection) || [0, 'Shop'])[1] : state.category ? WT.cap(catName(slug(state.category))) : 'Shop';
    $('shop-title').textContent = title; $('crumb').textContent = title; document.title = (window.__SEO_TITLE__ && !state.collection && state.category === window.__CATEGORY__) ? window.__SEO_TITLE__ : `${title} | Will's Tech Store`;   // keep the search-optimised title the server wrote
    $('shop-count').textContent = `${list.length} product${list.length === 1 ? '' : 's'}`;
    $('filters-apply').textContent = `Show ${list.length} result${list.length === 1 ? '' : 's'}`;
    const empty = `<div class="empty-state"><i class="fa-solid fa-magnifying-glass"></i><h3>No matches</h3><p>Try removing a filter, or tell us what you're after.</p>
      <div class="form-actions" style="justify-content:center"><button class="btn btn-dark" id="empty-reset">Clear filters</button><a class="btn btn-wa" target="_blank" rel="noopener" href="${WT.waLink('Hi! I\'m looking for something I couldn\'t find on your site.')}"><i class="fa-brands fa-whatsapp"></i> Ask on WhatsApp</a></div></div>`;
    Products.render($('shop-grid'), list.slice(0, state.shown), empty);
    const more = $('load-more'); more.hidden = list.length <= state.shown;
    more.textContent = `Show more (${list.length - state.shown} left)`;
  }
  const change = (fn) => { fn(); state.shown = PAGE; render(); };

  WT.ready(() => {
    readURL();
    $('shop-q').value = state.q; $('shop-sort').value = state.sort; $('f-min').value = state.min; $('f-max').value = state.max; $('f-stock').checked = state.instock;
    render();
    document.addEventListener('wt:products-refreshed', render);   // cached catalogue was replaced by the live one

    $('f-collections').addEventListener('click', (e) => { const b = e.target.closest('[data-col]'); if (b) change(() => { state.collection = b.dataset.col; }); });
    $('f-categories').addEventListener('click', (e) => { const b = e.target.closest('[data-cat]'); if (b) change(() => { state.category = b.dataset.cat; }); });
    $('f-brands').addEventListener('click', (e) => { const b = e.target.closest('[data-brand]'); if (!b) return; change(() => { const n = b.dataset.brand, i = state.brands.indexOf(n); if (i >= 0) state.brands.splice(i, 1); else state.brands.push(n); }); });
    $('quick-chips').addEventListener('click', (e) => {
      const b = e.target.closest('[data-qc]'); if (!b) return; const k = b.dataset.qc;
      change(() => {
        if (k === 'max200') { const on = state.max === '200000' && !state.min; state.min = ''; state.max = on ? '' : '200000'; }
        else if (k.startsWith('brand:')) { const n = k.slice(6); state.brands = state.brands.length === 1 && state.brands[0] === n ? [] : [n]; }
        else state.collection = state.collection === k ? '' : k;
        $('f-min').value = state.min; $('f-max').value = state.max;
      });
    });
    $('shop-sort').addEventListener('change', (e) => change(() => { state.sort = e.target.value; }));
    $('shop-q').addEventListener('input', debounce((e) => change(() => { state.q = e.target.value.trim(); }), 200));
    const price = debounce(() => change(() => { state.min = $('f-min').value; state.max = $('f-max').value; }), 350);
    $('f-min').addEventListener('input', price); $('f-max').addEventListener('input', price);
    $('f-stock').addEventListener('change', (e) => change(() => { state.instock = e.target.checked; }));
    $('load-more').addEventListener('click', () => { state.shown += PAGE; render(); });
    const reset = () => { Object.assign(state, { category: '', collection: '', q: '', min: '', max: '', instock: false, brands: [], shown: PAGE }); $('shop-q').value = ''; $('f-min').value = ''; $('f-max').value = ''; $('f-stock').checked = false; render(); };
    $('filters-reset').addEventListener('click', reset);
    document.addEventListener('click', (e) => { if (e.target.id === 'empty-reset') reset(); });
    $('active-filters').addEventListener('click', (e) => {
      const b = e.target.closest('[data-clear]'); if (!b) return; const k = b.dataset.clear;
      change(() => { if (k.startsWith('brand:')) { state.brands = state.brands.filter((x) => x !== k.slice(6)); } else if (k === 'price') { state.min = state.max = ''; $('f-min').value = $('f-max').value = ''; } else if (k === 'instock') { state.instock = false; $('f-stock').checked = false; } else if (k === 'q') { state.q = ''; $('shop-q').value = ''; } else state[k] = ''; });
    });
    // mobile filter sheet
    const sheet = $('filters'), scrim = document.getElementById('scrim');
    const open = () => { sheet.classList.add('open'); scrim.classList.add('show'); document.body.style.overflow = 'hidden'; };
    const close = () => { sheet.classList.remove('open'); scrim.classList.remove('show'); document.body.style.overflow = ''; };
    $('filter-open').addEventListener('click', open); $('filters-close').addEventListener('click', close); $('filters-apply').addEventListener('click', close);
    scrim.addEventListener('click', () => sheet.classList.remove('open'));
  });
})();
