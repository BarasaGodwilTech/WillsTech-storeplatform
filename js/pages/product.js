/** pages/product.js — product detail page. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const humanize = (k) => String(k).replace(/([a-z])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  let product, qty = 1, media = [], cur = 0;

  WT.ready(() => {
    const id = WT.productIdFromUrl();
    product = Products.getProductById(id);
    if (!product || product.status !== 'active') return notFound();
    WT.recent.add(product.id);
    seo(); build(); related(); document.dispatchEvent(new CustomEvent('wt:sync-wishlist'));
    // This page may have been drawn from the cached catalogue. If the live one disagrees on price/stock/name, reload once
    // (the cache is already refreshed by then, so the reload shows the live data and cannot loop).
    const drawn = JSON.stringify([product.name, product.price, product.originalPrice, product.stock, product.status]);
    document.addEventListener('wt:products-refreshed', () => {
      const now = Products.getProductById(product.id);
      const live = now ? JSON.stringify([now.name, now.price, now.originalPrice, now.stock, now.status]) : null;
      if (live === drawn) return;
      try { if (Date.now() - Number(sessionStorage.getItem('wt-pdp-reload') || 0) < 30000) return; sessionStorage.setItem('wt-pdp-reload', String(Date.now())); } catch (e) { /* ignore */ }
      location.reload();
    });
  });

  function notFound() {
    $('pdp-root').innerHTML = `<div class="notfound"><h1 style="font-size:40px">We couldn't find that product</h1><p class="text-muted">It may have sold out or moved.</p><div class="form-actions" style="justify-content:center"><a class="btn btn-primary btn-lg" href="/shop">Browse the shop</a></div></div>`;
    $('crumb-name').textContent = 'Not found';
  }

  function seo() {
    document.title = `${product.name} | Will's Tech Store`;
    const d = String(product.description || '').replace(/\s+/g, ' ').slice(0, 155);
    let m = document.querySelector('meta[name="description"]'); if (m) m.content = d;
    $('crumb-cat').textContent = WT.cap(product.category); $('crumb-cat').href = `/shop?category=${encodeURIComponent(product.category)}`; $('crumb-name').textContent = product.name.slice(0, 40);
    if (document.getElementById('ld-product')) return;   // the server already added the structured data
    const ld = document.createElement('script'); ld.type = 'application/ld+json';
    ld.textContent = JSON.stringify({ '@context': 'https://schema.org', '@type': 'Product', name: product.name, image: (product.images || []).map(WT.img), description: d, sku: product.sku,
      offers: { '@type': 'Offer', priceCurrency: 'UGX', price: Number(product.price), availability: Products.isOut(product) ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock' },
      ...(product.rating ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: product.rating, reviewCount: product.reviewCount || 1 } } : {}) });
    document.head.appendChild(ld);
  }

  function stockHTML() {
    return { 'in-stock': '<span class="stock in"><i class="fa-solid fa-circle"></i> In stock, ships from Kampala</span>', limited: '<span class="stock low"><i class="fa-solid fa-circle"></i> Low stock, order soon</span>',
      'pre-order': '<span class="stock pre"><i class="fa-solid fa-circle"></i> ' + escapeHTML(product.leadTime || 'Pre-order. We will show the arrival date on your order') + '</span>', 'out-of-stock': '<span class="stock out"><i class="fa-solid fa-circle"></i> Sold out</span>' }[product.stock] || '';
  }

  // YouTube and Vimeo links must be shown in their own player (an <iframe>); only real video files go in a <video> tag.
  function videoItem(u) {
    const yt = /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/|v\/))([A-Za-z0-9_-]{11})/.exec(u);
    if (yt) return { type: 'video', kind: 'embed', src: `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0&modestbranding=1&playsinline=1`, poster: `https://i.ytimg.com/vi/${yt[1]}/hqdefault.jpg` };
    const vm = /vimeo\.com\/(?:video\/)?(\d{6,12})/.exec(u);
    if (vm) return { type: 'video', kind: 'embed', src: `https://player.vimeo.com/video/${vm[1]}`, poster: '' };
    return { type: 'video', kind: 'file', src: /^https?:/.test(u) ? u : WT.root + u.replace(/^\//, ''), poster: '' };
  }

  // The clean address people should share (no query string or #hash).
  const shareUrl = () => location.origin + WT.productPath(product);

  function build() {
    const p = product, pct = Products.discountPct(p), out = Products.isOut(p);
    media = (p.images || []).map((u) => ({ type: 'img', src: WT.img(u), fb: WT.imgOriginal(u) }));
    (Array.isArray(p.videos) ? p.videos : []).filter(Boolean).forEach((u) => media.push(videoItem(u)));
    Media.forProduct(p).forEach((v) => media.push({ type: 'video', src: Media.url(v), poster: Media.url(v, 'poster'), title: v.title }));
    if (!media.length) media = [{ type: 'img', src: WT.img(''), fb: '' }];
    const desc = String(p.description || '').split(/\n+/).filter(Boolean);
    const lead = (desc[0] || '').slice(0, 220) + ((desc[0] || '').length > 220 ? '…' : '');
    const features = Array.isArray(p.features) ? p.features.filter(Boolean) : [];
    const specs = p.specifications && typeof p.specifications === 'object' ? Object.entries(p.specifications).filter(([, v]) => v !== '' && v !== null) : [];

    $('pdp-root').innerHTML = `
    <div class="pdp">
      <div class="gallery">
        <div class="gallery-main" id="g-main" aria-roledescription="carousel" aria-label="Product photos">
          <div class="badges">${pct > 0 ? `<span class="badge badge-flame">−${pct}%</span>` : ''}${(p.badges || []).includes('bestseller') ? '<span class="badge badge-sun"><i class="fa-solid fa-fire"></i> Best seller</span>' : ''}</div>
          ${media.length > 1 ? '<button class="gallery-nav prev" id="g-prev" aria-label="Previous photo"><i class="fa-solid fa-chevron-left"></i></button><button class="gallery-nav next" id="g-next" aria-label="Next photo"><i class="fa-solid fa-chevron-right"></i></button>' : ''}
          <div id="g-view" style="display:contents"></div>
        </div>
        ${media.length > 1 ? `<div class="thumbs" id="g-thumbs" role="tablist">${media.map((m, i) => `<button class="thumb${m.type === 'video' ? ' video' : ''}${i === 0 ? ' active' : ''}" data-i="${i}" aria-label="${m.type === 'video' ? 'Play video' : 'Photo ' + (i + 1)}">${m.type === 'video' ? `<img src="${escapeHTML(m.poster || WT.img(''))}" alt="" data-fallback="${escapeHTML(WT.img(''))}"><i class="fa-solid fa-circle-play" style="position:absolute;inset:0;margin:auto;width:24px;height:24px;color:#fff;font-size:24px;text-shadow:0 1px 6px rgba(0,0,0,.6)"></i>` : `<img src="${escapeHTML(m.src)}" data-fallback="${escapeHTML(m.fb)}" alt="">`}</button>`).join('')}</div>` : ''}
      </div>

      <div class="pdp-info">
        <span class="pdp-cat">${escapeHTML(p.category || '')}</span>
        <h1 class="pdp-title">${escapeHTML(p.name)}</h1>
        ${p.rating && p.reviewCount > 0 ? `<div class="pdp-rating">${WT.stars(p.rating)}<b>${Number(p.rating).toFixed(1)}</b><a href="#reviews" data-tab="reviews">${p.reviewCount || 0} reviews</a></div>` : ''}
        <div class="pdp-price"><strong>${formatPrice(p.price)}</strong>${pct > 0 ? `<s>${formatPrice(p.originalPrice)}</s><span class="badge badge-flame">Save ${formatPrice(p.originalPrice - p.price)}</span>` : ''}</div>
        ${stockHTML()}
        ${lead ? `<p class="pdp-lead">${escapeHTML(lead)}</p>` : ''}
        ${features.length ? `<ul class="why">${features.slice(0, 3).map((f) => `<li><i class="fa-solid fa-circle-check"></i><span>${escapeHTML(f)}</span></li>`).join('')}</ul>` : ''}
        ${specs.length ? `<div class="keyspecs">${specs.slice(0, 4).map(([k, v]) => `<div class="keyspec"><small>${escapeHTML(humanize(k))}</small><b>${escapeHTML(typeof v === 'object' ? '' : String(v).slice(0, 38))}</b></div>`).join('')}</div>` : ''}
        <div class="buy-row" id="buy-row">
          ${out ? `<a class="btn btn-secondary btn-lg" style="flex:1" href="${WT.page('/contact')}?subject=${encodeURIComponent('Back in stock')}&message=${encodeURIComponent(`Please let me know when "${p.name}" is back in stock.`)}"><i class="fa-regular fa-bell"></i> Ask when it's back</a>`
            : `<div class="qty" aria-label="Quantity"><button id="q-dec" aria-label="Decrease quantity"><i class="fa-solid fa-minus"></i></button><span id="q-val">1</span><button id="q-inc" aria-label="Increase quantity"><i class="fa-solid fa-plus"></i></button></div>
               <button class="btn btn-primary btn-lg" id="add-btn"><i class="fa-solid fa-bag-shopping"></i> ${p.stock === 'pre-order' ? 'Pre-order now' : 'Add to cart'}</button>`}
          <button class="wishlist-btn-detail" data-product-id="${p.id}" aria-pressed="false"><i class="fa-regular fa-heart"></i><span class="wl-label">Save to wishlist</span></button>
          <button class="wishlist-btn-detail cmp-detail" data-compare="${p.id}" aria-pressed="false"><i class="fa-solid fa-code-compare"></i><span class="cmp-label">Compare</span></button>
        </div>
        <p class="ask-line"><i class="fa-regular fa-comment-dots"></i> Questions about this product? <a href="${WT.page('/contact')}?subject=${encodeURIComponent('Product question')}&message=${encodeURIComponent(`Hi! I have a question about ${p.name}.`)}">Ask us</a></p>
        <div class="assure">
          <div><i class="fa-solid fa-shield-halved"></i><p><b>Authentic and sealed</b><span>Brand-new, straight from the supplier.</span></p></div>
          <div><i class="fa-solid fa-truck-fast"></i><p><b>We deliver everywhere in Uganda</b><span>${SITE.freeDeliveryThreshold > 0 ? `Free over ${formatPrice(SITE.freeDeliveryThreshold)}.` : 'To your door, anywhere in Uganda.'} <a href="/shipping" style="text-decoration:underline">Delivery details</a></span></p></div>
          <div><i class="fa-solid fa-rotate-left"></i><p><b>Easy returns if it's faulty</b><span><a href="/returns" style="text-decoration:underline">Read our returns policy</a></span></p></div>
        </div>
        <div class="share-row"><span>Share</span>
          <a href="${WT.waLink(`${p.name}: ${shareUrl()}`)}" target="_blank" rel="noopener" aria-label="Share on WhatsApp"><i class="fa-brands fa-whatsapp"></i></a>
          <a href="https://x.com/intent/post?text=${encodeURIComponent(p.name)}&url=${encodeURIComponent(shareUrl())}" target="_blank" rel="noopener" aria-label="Share on X"><i class="fa-brands fa-x-twitter"></i></a>
          <button id="copy-link" aria-label="Copy link"><i class="fa-solid fa-link"></i></button></div>
      </div>
    </div>

    <div class="tabs" role="tablist" id="tabs">
      <button class="tab active" role="tab" data-tab="desc">Description</button>
      ${specs.length ? '<button class="tab" role="tab" data-tab="specs">Specifications</button>' : ''}
      <button class="tab" role="tab" data-tab="reviews" id="reviews">Reviews${p.reviewCount ? ` (${p.reviewCount})` : ''}</button>
    </div>
    <div class="tab-panel" id="tp-desc">
      ${desc.map((d) => `<p class="pdp-lead" style="margin-bottom:14px">${escapeHTML(d)}</p>`).join('') || '<p class="text-muted">No description yet. Send us a message and we will tell you more.</p>'}
      ${features.length ? `<ul class="feature-list">${features.map((f) => `<li><i class="fa-solid fa-circle-check"></i><span>${escapeHTML(f)}</span></li>`).join('')}</ul>` : ''}
    </div>
    ${specs.length ? `<div class="tab-panel" id="tp-specs" hidden><table class="spec-table"><tbody>${specs.map(([k, v]) => `<tr><th>${escapeHTML(humanize(k))}</th><td>${escapeHTML(typeof v === 'object' ? JSON.stringify(v) : v)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    <div class="tab-panel" id="tp-reviews" hidden>
      <div class="review-summary">
        <div><div class="review-big">${p.rating ? Number(p.rating).toFixed(1) : '–'}</div>${p.rating ? WT.stars(p.rating) : ''}<div class="text-muted" style="font-size:14px;margin-top:4px">${p.reviewCount || 0} rating${p.reviewCount === 1 ? '' : 's'}</div></div>
        <p class="text-muted" style="max-width:44ch">Reviews from customers who bought from us. Signed-in customers can add their own below.</p>
      </div>
      <div id="review-list"><div class="skeleton" style="height:80px"></div></div>
      <div id="review-form-slot"></div>
    </div>`;

    // buy bar (mobile)
    $('bb-price').textContent = formatPrice(p.price); document.body.classList.add('has-buy-bar');
    const bar = $('buy-bar'); bar.setAttribute('aria-hidden', 'false');
    if (out) bar.style.display = 'none';
    const row = $('buy-row');
    new IntersectionObserver((en) => bar.classList.toggle('show', !en[0].isIntersecting && en[0].boundingClientRect.top < 0), { threshold: 0 }).observe(row);

    wire(); show(0);
  }

  // ── Gallery ────────────────────────────────────────────
  function show(i) {
    cur = (i + media.length) % media.length; const m = media[cur], v = $('g-view');
    v.innerHTML = m.kind === 'embed' ? `<iframe src="${escapeHTML(m.src)}" title="${escapeHTML(product.name)} video" allow="accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy" referrerpolicy="strict-origin-when-cross-origin" style="width:100%;height:100%;border:0;border-radius:inherit;background:#000"></iframe>` : m.type === 'video' ? `<video src="${escapeHTML(m.src)}" ${m.poster ? `poster="${escapeHTML(m.poster)}"` : ''} controls playsinline autoplay muted loop></video>` : `<img src="${escapeHTML(m.src)}" data-fallback="${escapeHTML(m.fb || '')}" alt="${escapeHTML(product.name)}" fetchpriority="high">`;
    document.querySelectorAll('#g-thumbs .thumb').forEach((t, k) => t.classList.toggle('active', k === cur));
    $('g-main').style.cursor = m.type === 'video' ? 'default' : 'zoom-in';
  }
  function lightbox() {
    const m = media[cur]; if (m.type !== 'img') return;
    const el = createElement('div', 'wt-modal'); el.style.cursor = 'zoom-out';
    el.innerHTML = `<button class="wt-modal-close" aria-label="Close"><i class="fa-solid fa-xmark"></i></button><img src="${escapeHTML(m.src)}" alt="" style="max-height:92vh;max-width:min(92vw,900px);object-fit:contain;background:var(--plate);border-radius:24px;padding:16px">`;
    el.addEventListener('click', () => el.remove()); document.body.appendChild(el);
    const k = (e) => { if (e.key === 'Escape') { el.remove(); document.removeEventListener('keydown', k); } }; document.addEventListener('keydown', k);
  }

  function wire() {
    const g = $('g-main');
    g.addEventListener('click', (e) => { if (!e.target.closest('button') && !e.target.closest('video') && !e.target.closest('iframe')) lightbox(); });
    if ($('g-prev')) { $('g-prev').addEventListener('click', (e) => { e.stopPropagation(); show(cur - 1); }); $('g-next').addEventListener('click', (e) => { e.stopPropagation(); show(cur + 1); }); }
    if ($('g-thumbs')) $('g-thumbs').addEventListener('click', (e) => { const t = e.target.closest('.thumb'); if (t) show(+t.dataset.i); });
    let sx = 0; g.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
    g.addEventListener('touchend', (e) => { const dx = e.changedTouches[0].clientX - sx; if (Math.abs(dx) > 50 && media.length > 1) show(cur + (dx < 0 ? 1 : -1)); }, { passive: true });

    const upd = () => { $('q-val').textContent = qty; };
    if ($('q-dec')) { $('q-dec').addEventListener('click', () => { qty = Math.max(1, qty - 1); upd(); }); $('q-inc').addEventListener('click', () => { qty = Math.min(Cart.MAX_QTY, qty + 1); upd(); }); }
    const add = () => Cart.addItem(product, qty);
    if ($('add-btn')) $('add-btn').addEventListener('click', add); if ($('bb-add')) $('bb-add').addEventListener('click', add);
    $('copy-link').addEventListener('click', async () => { try { await navigator.clipboard.writeText(shareUrl()); showNotification('Link copied', 'success'); } catch (e) { showNotification(shareUrl(), 'info'); } });

    const tabs = $('tabs');
    const openTab = (name) => { tabs.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name)); ['desc', 'specs', 'reviews'].forEach((n) => { const el = $('tp-' + n); if (el) el.hidden = n !== name; }); if (name === 'reviews') loadReviews(); };
    tabs.addEventListener('click', (e) => { const t = e.target.closest('.tab'); if (t) openTab(t.dataset.tab); });
    document.querySelector('.pdp-rating a[data-tab]')?.addEventListener('click', (e) => { e.preventDefault(); openTab('reviews'); tabs.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    if (location.hash === '#reviews') openTab('reviews');
  }

  // ── Reviews ────────────────────────────────────────────
  let reviewsLoaded = false;
  async function loadReviews() {
    if (reviewsLoaded) return; reviewsLoaded = true; fetchReviews();
    const slot = $('review-form-slot');
    const user = window.AuthService && AuthService.getCurrentUser && AuthService.getCurrentUser();
    slot.innerHTML = user ? `
      <form class="review-form" id="review-form"><h3 style="font-size:20px">Write a review</h3>
        <div class="star-input" role="radiogroup" aria-label="Your rating">${[5, 4, 3, 2, 1].map((n) => `<input type="radio" name="rating" id="rt${n}" value="${n}"><label for="rt${n}" title="${n} stars"><i class="fa-solid fa-star"></i></label>`).join('')}</div>
        <div class="form-group" style="margin:0"><label class="form-label" for="rv-title">Headline <span class="optional">(optional)</span></label><input class="form-input" id="rv-title" maxlength="120"></div>
        <div class="form-group" style="margin:0"><label class="form-label" for="rv-body">Your review</label><textarea class="form-input" id="rv-body" maxlength="2000" placeholder="What did you like? Anything to know before buying?"></textarea></div>
        <button class="btn btn-dark" type="submit" style="justify-self:start">Post review</button></form>`
      : `<div class="callout"><i class="fa-regular fa-comment-dots"></i><span>Bought this from us? <a href="/login?redirect=${encodeURIComponent(location.pathname + location.search)}">Sign in</a> to leave a review.</span></div>`;
    const f = $('review-form');
    if (f) f.addEventListener('submit', async (e) => {
      e.preventDefault(); const rating = (f.querySelector('input[name=rating]:checked') || {}).value;
      if (!rating) return showNotification('Please choose a star rating.', 'error');
      const btn = f.querySelector('button'); btn.disabled = true;
      try { await window.apiFetch(`/shop/reviews/${product.id}`, { method: 'POST', body: JSON.stringify({ rating: Number(rating), title: $('rv-title').value, body: $('rv-body').value }) }); showNotification('Thank you! Your review is live.', 'success'); f.reset(); fetchReviews(); }
      catch (err) { showNotification(err.message || 'Could not post your review.', 'error'); } finally { btn.disabled = false; }
    });
  }
  async function fetchReviews() {
    const list = $('review-list');
    try {
      const data = await window.apiFetch(`/shop/reviews/${product.id}`);
      const rs = data.reviews || [];
      list.innerHTML = rs.length ? rs.map((r) => `<article class="review"><div class="review-head">${WT.stars(r.rating)}<b>${escapeHTML(r.author)}</b>${r.verified ? '<span class="badge badge-signal"><i class="fa-solid fa-check"></i> Verified purchase</span>' : ''}<time>${WT.date(r.createdAt)}</time></div>${r.title ? `<b>${escapeHTML(r.title)}</b>` : ''}${r.body ? `<p class="text-muted" style="color:var(--text-secondary)">${escapeHTML(r.body)}</p>` : ''}</article>`).join('')
        : '<p class="text-muted" style="padding:12px 0">No written reviews yet. Be the first!</p>';
    } catch (e) { list.innerHTML = '<p class="text-muted" style="padding:12px 0">Written reviews are unavailable right now.</p>'; }
  }

  function related() {
    const rel = Products.related(product, 8); if (!rel.length) return;
    Products.render($('related-track'), rel); $('related-section').hidden = false; WT.rail($('related-track'), $('rel-prev'), $('rel-next'));
  }
})();
