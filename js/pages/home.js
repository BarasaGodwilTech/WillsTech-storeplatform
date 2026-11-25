/** pages/home.js — hero slider + bento tiles, categories, rails, budgets, setup tiles, reels, Apple band, reviews. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const SHOP = WT.page('/shop');

  // Placeholders go in immediately so nothing pops in from empty space.
  $('best-track').innerHTML = `<div class="skel-row">${Products.skeletons(5)}</div>`;
  $('fresh-grid').innerHTML = Products.skeletons(8);

  WT.ready(() => {
    const P = Products.active();
    buildHero(P); buildBento(P); buildCategories(P); buildRails(P); buildBudgets(); buildNeeds(P);
    buildReels(); buildApple(); buildReviews(); buildRecent();
    // The page may have been drawn from a saved copy. When the live catalogue turns out to be different, redraw the
    // product sections (the hero slider and videos are left alone so nothing jumps).
    document.addEventListener('wt:products-refreshed', (e) => {
      if (e.detail && e.detail.changed === false) return;
      const P2 = Products.active();
      buildBento(P2); buildCategories(P2); buildRails(P2, true); buildNeeds(P2); buildRecent();
    });
  });

  // ── Hero ───────────────────────────────────────────────
  async function buildHero(P) {
    const pinned = (SITE.heroProductIds || []).map((id) => Products.getProductById(id)).filter(Boolean);
    const score = (p) => (Products.discountPct(p) >= 20 ? 100 : 0) + ((p.badges || []).includes('bestseller') ? 40 : 0) + (p.rating || 0) * 4 + Math.log(2 + (p.reviewCount || 0)) + (p.stock === 'in-stock' ? 10 : 0);
    const ranked = pinned.length ? pinned : [...P].filter((p) => (p.images || []).length && !Products.isOut(p)).sort((a, b) => score(b) - score(a));
    const probe = ranked.slice(0, 14);
    const clean = await Promise.all(probe.map((p) => WT.isCleanImage(WT.img(p.images[0]))));   // prefer clean studio shots
    const picks = [], seen = new Set();
    probe.forEach((p, i) => { const key = p.name.split(' ').slice(0, 2).join(' ').toLowerCase(); if (clean[i] && picks.length < 3 && !seen.has(key)) { picks.push(p); seen.add(key); } });
    probe.forEach((p) => { if (picks.length < 3 && !picks.includes(p)) picks.push(p); });
    const S = WT.heroSlides, slides = [];
    const v17 = Media.get('iphone-17-pro'), vIpad = Media.get('ipad-colors');
    if (picks[0]) slides.push({ kind: 'product', tint: 0, label: shortLabel(picks[0]), html: S.productSlide(picks[0], 0) });
    if (v17) slides.push({ kind: 'video', tint: 1, label: v17.title, html: S.videoSlide(v17) });
    if (picks[1]) slides.push({ kind: 'product', tint: 2, label: shortLabel(picks[1]), html: S.productSlide(picks[1], 1) });
    if (vIpad) slides.push({ kind: 'video', tint: 3, label: vIpad.title, html: S.videoSlide(vIpad) });
    if (picks[2]) slides.push({ kind: 'product', tint: 4, label: shortLabel(picks[2]), html: S.productSlide(picks[2], 2) });
    if (!slides.length) { $('hero').innerHTML = ''; return; }
    WT.HeroSlider($('hero'), slides);
  }
  const shortLabel = (p) => p.name.split(/\s[-–—]\s|\s-(?=\d)|[,|(/]/)[0].replace(/^jbl /i, 'JBL ').split(' ').slice(0, 3).join(' ');

  // ── Bento side tiles: budget + deal of the week ────────
  function buildBento(P) {
    const bud = Products.budgets().filter((b) => b.count > 0).slice(0, 3);
    const top = [...P].filter((p) => Products.discountPct(p) >= 15 && !Products.isOut(p)).sort((a, b) => Products.discountPct(b) - Products.discountPct(a))[0];
    const img = top && (top.images || [])[0];
    $('bento-side').innerHTML = `
      <div class="tile tile-budget"><span class="tile-eyebrow">Shop by budget</span><h3>Great tech at every price</h3>
        ${bud.map((b) => `<a class="t-link" href="${b.href}"><span>${b.label}</span><small>${b.count} items</small><i class="fa-solid fa-arrow-right"></i></a>`).join('')}</div>
      ${top ? `<a class="tile tile-deal" href="${Products.href(top)}"><span class="badge badge-flame" style="justify-self:start"><i class="fa-solid fa-tag"></i> Deal of the week · −${Products.discountPct(top)}%</span>
        <h3>${escapeHTML(top.name.split(/\s[-–—]\s|[,|(/]/)[0].slice(0, 34))}</h3>
        <div class="td-price">${formatPrice(top.price)}<s>${formatPrice(top.originalPrice)}</s></div>
        <span class="go">Shop the deal <i class="fa-solid fa-arrow-right"></i></span>
        <div class="td-img"><img src="${escapeHTML(WT.img(img))}" data-fallback="${escapeHTML(WT.imgOriginal(img))}" alt="" loading="lazy"></div></a>` : ''}`;
    WT.markLoaded($('bento-side'));
  }

  // ── Categories (with a product photo each) ─────────────
  function buildCategories(P) {
    const cats = Products.categories();
    const photo = (name) => { const p = P.find((x) => (x.category || '').toLowerCase() === name.toLowerCase() && (x.images || [])[0]); const u = p && p.images[0]; return u ? `<span class="cat-img"><img src="${escapeHTML(WT.img(u))}" data-fallback="${escapeHTML(WT.imgOriginal(u))}" alt="" loading="lazy"></span>` : ''; };
    const first = P.find((x) => (x.images || [])[0]);
    $('cats-grid').innerHTML = `
      <a class="cat-tile big" href="${SHOP}"><i class="fa-solid fa-arrow-right go"></i><span class="ic"><i class="fa-solid fa-bag-shopping"></i></span><div><h3>Shop everything</h3><p>${P.length} products to browse</p></div>${first ? `<span class="cat-img"><img src="${escapeHTML(WT.img(first.images[0]))}" data-fallback="${escapeHTML(WT.imgOriginal(first.images[0]))}" alt="" loading="lazy"></span>` : ''}</a>` +
      cats.map((c) => `<a class="cat-tile" href="${SHOP}?category=${encodeURIComponent(c.name)}"><i class="fa-solid fa-arrow-right go"></i><span class="ic"><i class="fa-solid ${WT.categoryIcon(c.name)}"></i></span><div><h3>${escapeHTML(WT.cap(c.name))}</h3><p>${c.count} item${c.count === 1 ? '' : 's'}</p></div>${photo(c.name)}</a>`).join('');
    WT.markLoaded($('cats-grid'));
  }

  // ── Rails & grids ──────────────────────────────────────
  function buildRails(P, redraw) {
    const best = P.filter((p) => (p.badges || []).includes('bestseller'));
    Products.render($('best-track'), (best.length >= 4 ? best : Products.trending(10)).slice(0, 10));
    if (!redraw) WT.rail($('best-track'), $('best-prev'), $('best-next'));   // arrows are wired once
    Products.render($('fresh-grid'), [...P].sort((a, b) => new Date(b.dateAdded || 0) - new Date(a.dateAdded || 0)).slice(0, 8));
  }

  // ── Budgets ────────────────────────────────────────────
  function buildBudgets() {
    const b = Products.budgets().filter((x) => x.count > 0);
    $('budgets').innerHTML = b.map((x) => `<a class="budget" href="${x.href}"><small>${x.hint}</small><b>${x.label}</b><span class="bgo"><span>${x.count} item${x.count === 1 ? '' : 's'}</span> Shop <i class="fa-solid fa-arrow-right"></i></span></a>`).join('');
    if (!b.length) $('budget-section').hidden = true;
  }

  // ── Complete your setup (shop by need) ─────────────────
  function buildNeeds(P) {
    const defs = [['Power banks', 'power bank', 'fa-battery-full'], ['Speakers', 'speaker', 'fa-volume-high'], ['Earphones', 'ear', 'fa-headphones'], ['Creator gear', 'dji', 'fa-camera']];
    const tiles = defs.map(([label, q, icon]) => {
      const re = new RegExp('\\b' + q, 'i'); const hits = P.filter((p) => re.test(p.name) && !Products.isOut(p));
      return hits.length ? { label, q, icon, hits } : null;
    }).filter(Boolean);
    if (!tiles.length) return;
    $('needs').innerHTML = tiles.map((t) => { const u = (t.hits[0].images || [])[0]; const min = Math.min(...t.hits.map((p) => p.price));
      return `<a class="need" href="${SHOP}?q=${encodeURIComponent(t.q)}"><span class="nimg"><img src="${escapeHTML(WT.img(u))}" data-fallback="${escapeHTML(WT.imgOriginal(u))}" alt="" loading="lazy"></span><b>${t.label}</b><small>${t.hits.length} item${t.hits.length === 1 ? '' : 's'} · from ${formatPrice(min)}</small><span class="add"><i class="fa-solid ${t.icon}"></i> Browse</span></a>`; }).join('');
    WT.markLoaded($('needs')); $('needs-section').hidden = false;
  }

  // ── Reels ──────────────────────────────────────────────
  function buildReels() {
    const reels = Media.reels();
    $('reels').innerHTML = reels.map((v) => `
      <button class="reel" data-id="${v.id}" aria-label="Play video: ${escapeHTML(v.title)}">
        <img src="${WT.root + v.poster}" alt="" loading="lazy">
        <span class="reel-live"><i class="fa-solid fa-circle"></i> ${v.title.includes('Pro') ? 'Pro' : 'New'}</span>
        <span class="reel-play"><i class="fa-solid fa-play"></i></span>
        <span class="reel-meta"><b>${escapeHTML(v.title)}</b><span>${escapeHTML(v.tagline)}</span></span>
      </button>`).join('');
    const canHover = matchMedia('(hover: hover)').matches;
    $('reels').addEventListener('click', (e) => { const r = e.target.closest('.reel'); if (r) Media.openPlayer(r.dataset.id, reels); });
    if (canHover) {
      $('reels').addEventListener('mouseover', (e) => {
        const r = e.target.closest('.reel'); if (!r || r.dataset.hover) return; r.dataset.hover = '1';
        const v = Media.get(r.dataset.id), el = document.createElement('video');
        Object.assign(el, { muted: true, loop: true, playsInline: true, src: WT.root + v.src }); r.prepend(el);
        el.play().then(() => r.classList.add('playing')).catch(() => {});
      });
      $('reels').addEventListener('mouseout', (e) => { const r = e.target.closest('.reel'); if (!r || r.contains(e.relatedTarget)) return; const el = r.querySelector('video'); if (el) { el.remove(); delete r.dataset.hover; r.classList.remove('playing'); } });
    }
  }

  // ── Apple band (enquiries go to the contact form, or straight to the product if we stock it) ──
  function buildApple() {
    const items = [['iPhone', 'iPhone', 'fa-mobile-screen'], ['iPad', 'iPad', 'fa-tablet-screen-button'], ['MacBook', 'MacBook', 'fa-laptop']];
    $('apple-chips').innerHTML = items.map(([label, q, ic]) => {
      const hit = Products.active().find((p) => p.name.toLowerCase().includes(q.toLowerCase()));
      const href = hit ? Products.href(hit) : `${WT.page('/contact')}?subject=${encodeURIComponent('Product question')}&message=${encodeURIComponent(`Hi! I'm looking for an ${q}. What do you have, and at what price?`)}`;
      return `<a href="${href}"><i class="fa-solid ${ic}"></i>${label}</a>`;
    }).join('');
    const vid = $('apple-video');
    new IntersectionObserver((en) => en.forEach((x) => (x.isIntersecting ? Media.play(vid) : Media.pause(vid))), { threshold: 0.35 }).observe(vid);
  }

  // ── Customer reviews (real ones only; hidden until there are some) ──
  async function buildReviews() {
    try {
      const d = await window.apiFetch('/shop/reviews/latest'); const rs = (d.reviews || []).slice(0, 3); if (!rs.length) return;
      $('reviews').innerHTML = rs.map((r) => `<article class="rv-card">${WT.stars(r.rating)}${r.title ? `<b>${escapeHTML(r.title)}</b>` : ''}<p>${escapeHTML(r.body)}</p>
        <div class="rv-meta"><span><b>${escapeHTML(r.author)}</b>${r.verified ? ' · <i class="fa-solid fa-circle-check" style="color:var(--signal)"></i> Verified' : ''}</span>${r.productId && r.productName ? `<a href="/product/${encodeURIComponent(r.productId)}#reviews">${escapeHTML(String(r.productName).split(/\s[-–—]\s|[,|(/]/)[0].slice(0, 26))}</a>` : ''}</div></article>`).join('');
      $('reviews-section').hidden = false;
    } catch (e) { /* offline or none: keep hidden */ }
  }

  function buildRecent() {
    const list = WT.recent.get().map((id) => Products.getProductById(id)).filter((p) => p && p.status === 'active').slice(0, 8);
    if (list.length < 2) return;
    Products.render($('recent-track'), list); $('recent').hidden = false;
  }
})();
