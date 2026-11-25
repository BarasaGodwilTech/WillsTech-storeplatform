/**
 * ui.js — HeroSlider (sliding products + video spotlights, story-style progress) and Rail (horizontal scroll rows).
 */
(function () {
  'use strict';

  // ── Rail: scroll-snap row with prev/next buttons ───────
  WT.rail = function (track, prev, next) {
    if (!track) return;
    const step = () => Math.max(240, track.clientWidth * 0.85);
    const upd = () => {
      if (prev) prev.disabled = track.scrollLeft < 8;
      if (next) next.disabled = track.scrollLeft + track.clientWidth >= track.scrollWidth - 8;
    };
    if (prev) prev.addEventListener('click', () => track.scrollBy({ left: -step(), behavior: 'smooth' }));
    if (next) next.addEventListener('click', () => track.scrollBy({ left: step(), behavior: 'smooth' }));
    track.addEventListener('scroll', upd, { passive: true }); addEventListener('resize', upd); setTimeout(upd, 60);
  };

  // ── HeroSlider ─────────────────────────────────────────
  const DURATION = 7000;
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  // "Galaxy A17 5G -4GB RAM/ 128GB ROM Android 15 - Black" -> "Galaxy A17 5G"
  const shortName = (n) => {
    let s = String(n || '').split(/\s[-–—]\s|\s-(?=\d)|[,|(/]/)[0].replace(/\s+/g, ' ').trim();
    const words = s.split(' ');
    while (s.length > 26 && words.length > 2) { words.pop(); s = words.join(' '); }
    return s || String(n || '').slice(0, 26);
  };
  const titleSize = (t) => (t.length <= 12 ? '' : t.length <= 19 ? ' md' : ' sm');
  // A short, readable line for the slide. Skips spec-sheet text ("Camera:Back Camera -50MP…").
  const readable = (t) => { t = String(t || '').replace(/\s+/g, ' ').trim(); const words = t.split(' ').length; const digits = (t.match(/\d/g) || []).length; return t.length >= 24 && words >= 5 && !t.includes(':') && digits / t.length < 0.12; };
  const pitch = (p) => {
    const sentences = String(p.description || '').split(/(?<=[.!?])\s+/);
    const cands = [...(Array.isArray(p.features) ? p.features : []), ...sentences].filter((t) => typeof t === 'string');
    const t = cands.find(readable);
    let out = t || '';
    if (out.length > 112) out = out.slice(0, 112).replace(/\s+\S*$/, '').replace(/[\s,.;:–-]+$/, '') + '…';
    else out = out.replace(/[\s,;:–-]+$/, '');
    return out || `Genuine ${p.category || 'tech'}, sealed and backed by our guarantee.`;
  };
  const chipsFor = (p) => {
    const c = [];
    (Array.isArray(p.features) ? p.features : []).forEach((f) => { if (typeof f === 'string' && f.length >= 4 && f.length <= 24 && c.length < 2) c.push(f); });
    if (p.rating) c.push(`${Number(p.rating).toFixed(1)} rated`);
    return c.slice(0, 3);
  };
  const TRUST = '<div class="hs-trust" style="--i:5"><span><i class="fa-solid fa-circle-check"></i>Authentic</span><span><i class="fa-solid fa-circle-check"></i>Delivery nationwide</span><span><i class="fa-solid fa-circle-check"></i>Pay on delivery</span></div>';

  function productSlide(p, i) {
    const pct = Products.discountPct(p);
    const label = pct >= 20 ? `Deal · save ${pct}%` : (p.badges || []).includes('bestseller') ? 'Best seller' : (p.badges || []).includes('new') ? 'New arrival' : WT.cap(p.category || 'Featured');
    const img = (p.images || [])[0] || '';
    const chips = chipsFor(p).map((c, k) => `<span class="hs-chip c${k + 1}">${escapeHTML(c)}</span>`).join('');
    const name = shortName(p.name);
    return `
      <div class="hs-copy">
        <span class="hs-tag" style="--i:0">${pct >= 20 ? '<i class="fa-solid fa-tag"></i>' : ''}${escapeHTML(label)}</span>
        <h2 class="hs-title${titleSize(name)}" style="--i:1">${escapeHTML(name)}</h2>
        <p class="hs-blurb" style="--i:2">${escapeHTML(pitch(p))}</p>
        <div class="hs-price" style="--i:3"><strong>${formatPrice(p.price)}</strong>${pct > 0 ? `<s>${formatPrice(p.originalPrice)}</s><span class="badge badge-flame">−${pct}%</span>` : ''}</div>
        <div class="hs-actions" style="--i:4">
          <button class="btn btn-dark btn-lg add-to-cart-btn" data-id="${p.id}"><i class="fa-solid fa-bag-shopping"></i> Add to cart</button>
          <a class="btn btn-secondary btn-lg" href="${Products.href(p)}">View details</a>
        </div>
        ${TRUST}
      </div>
      <div class="hs-art">
        <div class="hs-ring"><span class="hs-orbit"></span></div><div class="hs-disc"></div>
        <img class="hs-img" src="${escapeHTML(WT.img(img))}" data-fallback="${escapeHTML(WT.imgOriginal(img))}" alt="${escapeHTML(p.name)}" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">
        ${chips}
      </div>`;
  }

  function videoSlide(v) {
    const hit = (window.Products ? Products.active() : []).find((p) => v.keywords.some((k) => p.name.toLowerCase().includes(k)));
    const title = escapeHTML(v.title);
    return `
      <div class="hs-copy">
        <span class="hs-tag" style="--i:0"><i class="fa-brands fa-apple"></i>Spotlight</span>
        <h2 class="hs-title${titleSize(v.title)}" style="--i:1">${title}</h2>
        <p class="hs-blurb" style="--i:2">${escapeHTML(v.tagline)}. ${hit ? 'In stock now.' : 'Ask us for today\'s price and availability.'}</p>
        <div class="hs-actions" style="--i:4">
          <a class="btn btn-dark btn-lg" href="${hit ? Products.href(hit) : Media.enquiryUrl(v)}"><i class="fa-solid ${hit ? 'fa-bag-shopping' : 'fa-paper-plane'}"></i> ${hit ? 'Shop now' : 'Enquire now'}</a>
          <button class="btn btn-secondary btn-lg" data-watch="${v.id}"><i class="fa-solid fa-play"></i> Watch with sound</button>
        </div>
        ${TRUST}
      </div>
      <div class="hs-art hs-art-video">
        <div class="hs-ring"><span class="hs-orbit"></span></div><div class="hs-disc"></div>
        ${Media.videoCard(v)}
        <button class="hs-chip c1 hs-chip-btn" data-watch="${v.id}"><i class="fa-solid fa-circle-play"></i> Tap to watch</button>
      </div>`;
  }

  WT.HeroSlider = function (root, slides) {
    if (!root || !slides.length) return;
    const n = slides.length;
    root.innerHTML = `
      <div class="hero-stage" id="hero-stage" tabindex="0" aria-live="off">
        ${slides.map((s, i) => `<article class="hero-slide${i === 0 ? ' is-active' : ''}" data-tint="${s.tint}" data-kind="${s.kind}" role="group" aria-roledescription="slide" aria-label="${i + 1} of ${n}" ${i ? 'aria-hidden="true"' : ''}>${s.html}</article>`).join('')}
        <div class="hero-bar">
          <div class="hero-segs" role="tablist" aria-label="Choose slide">
            ${slides.map((s, i) => `<button class="seg${i === 0 ? ' is-active' : ''}" role="tab" aria-selected="${i === 0}" data-go="${i}" aria-label="${escapeHTML(s.label)}" title="${escapeHTML(s.label)}"><i></i></button>`).join('')}
          </div>
          <div class="hero-now"><b id="hero-cur">01</b><span id="hero-name">${escapeHTML(slides[0].label)}</span></div>
          <div class="hero-arrows"><button class="hero-arrow" id="hero-prev" aria-label="Previous slide"><i class="fa-solid fa-arrow-left"></i></button><button class="hero-arrow" id="hero-next" aria-label="Next slide"><i class="fa-solid fa-arrow-right"></i></button><button class="hero-arrow" id="hero-pause" aria-label="Pause slideshow"><i class="fa-solid fa-pause"></i></button></div>
        </div>
      </div>`;

    const stage = root.querySelector('#hero-stage');
    const els = [...root.querySelectorAll('.hero-slide')], segs = [...root.querySelectorAll('.seg')];
    const cur = root.querySelector('#hero-cur'), nameEl = root.querySelector('#hero-name');
    let idx = -1, elapsed = 0, paused = false, userPaused = false, last = performance.now(), dir = 1;

    function go(to, direction) {
      to = (to + n) % n; if (to === idx) return;
      dir = direction || (to > idx ? 1 : -1);
      const prevEl = els[idx];
      if (prevEl) { prevEl.classList.remove('is-active'); prevEl.classList.add('is-leaving'); prevEl.setAttribute('aria-hidden', 'true'); Media.pause(prevEl.querySelector('video')); setTimeout(() => prevEl.classList.remove('is-leaving'), 500); }
      idx = to; const el = els[idx];
      el.classList.add('is-active'); el.removeAttribute('aria-hidden');
      stage.style.setProperty('--tint', `var(--tint-${el.dataset.tint})`); stage.dataset.dir = dir > 0 ? 'next' : 'prev';
      segs.forEach((t, k) => { t.classList.toggle('is-active', k === idx); t.setAttribute('aria-selected', k === idx); t.querySelector('i').style.width = k < idx ? '100%' : '0'; });
      cur.textContent = String(idx + 1).padStart(2, '0'); nameEl.textContent = slides[idx].label; elapsed = 0;
      const v = el.querySelector('video'); if (v) Media.play(v);
      const nv = els[(idx + 1) % n].querySelector('video'); if (nv && !nv.src) nv.src = nv.dataset.src;   // warm up the next clip
    }
    function tick(now) {
      const dt = now - last; last = now;
      if (!paused && !userPaused && !reduce) { elapsed += dt; segs[idx].querySelector('i').style.width = Math.min(100, elapsed / DURATION * 100) + '%'; if (elapsed >= DURATION) go(idx + 1, 1); }
      requestAnimationFrame(tick);
    }
    root.querySelector('#hero-prev').addEventListener('click', () => go(idx - 1, -1));
    root.querySelector('#hero-next').addEventListener('click', () => go(idx + 1, 1));
    const pb = root.querySelector('#hero-pause');
    pb.addEventListener('click', () => { userPaused = !userPaused; pb.innerHTML = `<i class="fa-solid ${userPaused ? 'fa-play' : 'fa-pause'}"></i>`; pb.setAttribute('aria-label', userPaused ? 'Play slideshow' : 'Pause slideshow'); });
    segs.forEach((t) => t.addEventListener('click', () => go(+t.dataset.go)));
    stage.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight') go(idx + 1, 1); else if (e.key === 'ArrowLeft') go(idx - 1, -1); });
    root.addEventListener('click', (e) => { const w = e.target.closest('[data-watch]'); if (w) Media.openPlayer(w.dataset.watch); });
    stage.addEventListener('mouseenter', () => { paused = true; }); stage.addEventListener('mouseleave', () => { paused = false; });
    stage.addEventListener('focusin', () => { paused = true; }); stage.addEventListener('focusout', () => { paused = false; });
    let sx = 0, sy = 0, down = false;
    stage.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') return; down = true; sx = e.clientX; sy = e.clientY; paused = true; });
    stage.addEventListener('pointerup', (e) => { if (!down) return; down = false; paused = false; const dx = e.clientX - sx, dy = e.clientY - sy; if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) go(idx + (dx < 0 ? 1 : -1), dx < 0 ? 1 : -1); });
    stage.addEventListener('pointercancel', () => { down = false; paused = false; });
    new IntersectionObserver((en) => en.forEach((x) => { paused = !x.isIntersecting; const v = els[idx] && els[idx].querySelector('video'); if (v) (x.isIntersecting ? Media.play(v) : Media.pause(v)); }), { threshold: 0.2 }).observe(root);
    go(0, 1); last = performance.now(); requestAnimationFrame(tick);
  };
  WT.heroSlides = { productSlide, videoSlide };
})();
