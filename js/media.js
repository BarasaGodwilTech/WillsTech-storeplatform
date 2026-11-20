/**
 * media.js — the video library, the phone-frame component used in the hero, and the full-screen player.
 * Clips live in /public/videos (optimised MP4s + poster JPGs). Add a new clip by adding one entry below.
 * `keywords` link a clip to a catalogue product by name (e.g. shows a Watch tab on its product page).
 */
(function () {
  'use strict';
  const V = (id, title, tagline, kw, extra) => Object.assign({
    id, title, tagline, keywords: kw,
    src: `public/videos/${id}.mp4`, poster: `public/videos/posters/${id}.jpg`, orientation: 'portrait',
  }, extra || {});

  const VIDEOS = [
    V('iphone-17-pro', 'iPhone 17 Pro', 'Pro cameras in cosmic orange', ['iphone 17', 'iphone17']),
    V('macbook-neo', 'MacBook Neo', 'Hello, Neo. Four colours, all day battery', ['macbook neo', 'macbook']),
    V('ipad-colors', 'iPad', 'Bright colours, built for everyday', ['ipad']),
    V('iphone-16-pro-camera', 'iPhone 16 Pro', 'Meet the new Camera Control', ['iphone 16', 'iphone']),
    V('apple-hello', 'Hello from Apple', 'The Apple range, on request', [], { orientation: 'landscape' }),
  ];

  const Media = (WT.Media = window.Media = { videos: VIDEOS });
  Media.get = (id) => VIDEOS.find((v) => v.id === id);
  Media.reels = () => VIDEOS.filter((v) => v.orientation === 'portrait');
  Media.url = (v, key) => WT.root + v[key || 'src'];

  // Videos whose keywords appear in the product name (most specific keyword first).
  Media.forProduct = function (p) {
    const name = String((p && p.name) || '').toLowerCase();
    return VIDEOS.filter((v) => v.keywords.some((k) => name.includes(k)));
  };

  // Where should the "shop this" button go? A matching catalogue product if there is one, otherwise the contact form.
  Media.cta = function (v) {
    const hit = (window.Products ? Products.active() : []).find((p) => v.keywords.some((k) => p.name.toLowerCase().includes(k)));
    if (hit) return { label: `View ${hit.name.slice(0, 28)}`, href: Products.href(hit), wa: false, icon: 'fa-bag-shopping' };
    return { label: `Ask about the ${v.title}`, href: `${WT.page('contact.html')}?subject=${encodeURIComponent('Product question')}&message=${encodeURIComponent(`Hi! I saw the ${v.title} video. Is it available, and what's the price?`)}`, wa: false, icon: 'fa-envelope' };
  };

  // Clean rounded video card (no device frame) used by the hero slider.
  Media.videoCard = function (v) {
    return `<div class="vid-card" aria-hidden="true"><video muted loop playsinline preload="none" poster="${WT.root + v.poster}" data-src="${WT.root + v.src}" tabindex="-1"></video></div>`;
  };
  // Where an enquiry about a clip should go when the catalogue has no matching product: the on-site form.
  Media.enquiryUrl = (v) => `${WT.page('contact.html')}?subject=${encodeURIComponent('Product question')}&message=${encodeURIComponent(`Hi! I'd like the price and availability of the ${v.title}.`)}`;
  Media.play = (video) => { if (!video) return; if (!video.src && video.dataset.src) video.src = video.dataset.src; const p = video.play(); if (p && p.catch) p.catch(() => {}); };
  Media.pause = (video) => { if (video) video.pause(); };

  // ── Full-screen player ─────────────────────────────────
  let modal = null, list = [], idx = 0, lastFocus = null;
  function render() {
    const v = list[idx]; const cta = Media.cta(v);
    modal.querySelector('.player-stage').innerHTML = `<video src="${Media.url(v)}" poster="${Media.url(v, 'poster')}" autoplay loop playsinline controls controlsList="nodownload noplaybackrate"></video>`;
    modal.querySelector('.player-title').textContent = v.title;
    modal.querySelector('.player-tagline').textContent = v.tagline;
    const a = modal.querySelector('.player-cta'); a.href = cta.href; a.className = 'btn btn-lg player-cta ' + (cta.wa ? 'btn-wa' : 'btn-primary');
    a.innerHTML = `<i class="${cta.wa ? 'fa-brands' : 'fa-solid'} ${cta.icon}"></i> ${escapeHTML(cta.label)}`;
    if (cta.wa) { a.target = '_blank'; a.rel = 'noopener'; } else { a.removeAttribute('target'); }
    modal.querySelector('.player-count').textContent = `${idx + 1} / ${list.length}`;
    const vid = modal.querySelector('video'); const pr = vid.play(); if (pr && pr.catch) pr.catch(() => { vid.muted = true; vid.play().catch(() => {}); });
  }
  function close() {
    if (!modal) return; modal.remove(); modal = null; document.body.style.overflow = ''; document.removeEventListener('keydown', onKey);
    if (lastFocus) lastFocus.focus();
  }
  function step(d) { idx = (idx + d + list.length) % list.length; render(); }
  function onKey(e) { if (e.key === 'Escape') close(); else if (e.key === 'ArrowRight') step(1); else if (e.key === 'ArrowLeft') step(-1); }

  Media.openPlayer = function (id, items) {
    list = items || Media.reels(); idx = Math.max(0, list.findIndex((v) => v.id === id));
    lastFocus = document.activeElement;
    modal = createElement('div', 'wt-modal player');
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-label', 'Video player');
    modal.innerHTML = `
      <button class="wt-modal-close" aria-label="Close video"><i class="fa-solid fa-xmark"></i></button>
      <button class="player-nav prev" aria-label="Previous video"><i class="fa-solid fa-chevron-left"></i></button>
      <div class="player-card">
        <div class="player-stage"></div>
        <div class="player-info">
          <div><div class="player-title"></div><div class="player-tagline"></div></div>
          <span class="player-count"></span>
        </div>
        <a class="player-cta"></a>
      </div>
      <button class="player-nav next" aria-label="Next video"><i class="fa-solid fa-chevron-right"></i></button>`;
    document.body.appendChild(modal); document.body.style.overflow = 'hidden';
    modal.addEventListener('click', (e) => { if (e.target === modal) close(); });
    modal.querySelector('.wt-modal-close').addEventListener('click', close);
    modal.querySelector('.prev').addEventListener('click', () => step(-1));
    modal.querySelector('.next').addEventListener('click', () => step(1));
    document.addEventListener('keydown', onKey);
    // swipe up/down or left/right on touch
    let sx = 0, sy = 0;
    modal.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
    modal.addEventListener('touchend', (e) => {
      const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dy) > 70 && Math.abs(dy) > Math.abs(dx)) step(dy < 0 ? 1 : -1); else if (Math.abs(dx) > 70) step(dx < 0 ? 1 : -1);
    }, { passive: true });
    render(); modal.querySelector('.wt-modal-close').focus();
  };
})();
