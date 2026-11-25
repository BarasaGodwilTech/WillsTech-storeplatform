/** map-picker.js — "Choose on map" modal. WT.pickLocation({lat,lng,zones}) → Promise<{lat,lng,label,zoneId}|null>
 *  Leaflet + OpenStreetMap, loaded only when the modal is first opened. Search is limited to Uganda. */
(function () {
  'use strict';
  window.WT = window.WT || {};
  const LEAF_JS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js', LEAF_CSS = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css';
  const UG = { lat: [-1.6, 4.4], lng: [29.4, 35.1] }, KLA = [0.3476, 32.5825];
  let loading = null;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const inUganda = (la, ln) => la > UG.lat[0] && la < UG.lat[1] && ln > UG.lng[0] && ln < UG.lng[1];
  const km = (a, b, c, d) => { const R = 6371, r = (x) => x * Math.PI / 180, dl = r(c - a), dn = r(d - b), h = Math.sin(dl / 2) ** 2 + Math.cos(r(a)) * Math.cos(r(c)) * Math.sin(dn / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };

  /** The zone whose circle contains the point (closest centre wins); falls back to a zone with no circle ("elsewhere"). */
  WT.zoneForPoint = function (zones, lat, lng) {
    let best = null, bd = Infinity;
    (zones || []).forEach((z) => { if (z.lat == null || z.lng == null || !z.radiusKm) return; const d = km(lat, lng, Number(z.lat), Number(z.lng)); if (d <= z.radiusKm && d < bd) { best = z; bd = d; } });
    return best || (zones || []).find((z) => z.lat == null || !z.radiusKm) || null;
  };

  function load() {
    if (window.L) return Promise.resolve();
    if (loading) return loading;
    loading = new Promise((res, rej) => {
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = LEAF_CSS; document.head.appendChild(l);
      const s = document.createElement('script'); s.src = LEAF_JS; s.onload = res; s.onerror = () => { loading = null; rej(new Error('The map could not load. Check your connection.')); }; document.head.appendChild(s);
    });
    return loading;
  }

  function css() {
    if (document.getElementById('mp-css')) return;
    const s = document.createElement('style'); s.id = 'mp-css';
    s.textContent = `.mp-bg{position:fixed;inset:0;background:rgba(20,10,40,.6);z-index:9999;display:flex;align-items:flex-end;justify-content:center}
.mp{background:var(--bg-card,#fff);color:var(--text-primary,#1b1038);width:min(760px,100%);height:min(86vh,720px);border-radius:24px 24px 0 0;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 -10px 40px rgba(0,0,0,.3)}
@media(min-width:760px){.mp-bg{align-items:center}.mp{border-radius:24px}}
.mp-h{display:flex;align-items:center;gap:12px;padding:14px 18px;border-bottom:1px solid var(--border,#e4dfee)}.mp-h h2{margin:0;font-size:18px;flex:1}
.mp-x{border:0;background:none;font-size:22px;cursor:pointer;color:inherit;width:36px;height:36px}
.mp-s{display:flex;gap:8px;padding:12px 18px 0;flex-wrap:wrap}.mp-s input{flex:1;min-width:180px;padding:11px 14px;border:1.5px solid var(--border,#d6cfe6);border-radius:12px;font:inherit;background:var(--bg-card,#fff);color:inherit}
.mp-b{border:0;border-radius:12px;padding:11px 16px;font:600 14px inherit;cursor:pointer;background:var(--surface,#eeeaf6);color:inherit}.mp-b.pri{background:#FF8A1F;color:#2A1262}.mp-b:disabled{opacity:.5;cursor:default}
.mp-res{margin:6px 18px 0;border:1px solid var(--border,#e4dfee);border-radius:12px;overflow:hidden;max-height:160px;overflow-y:auto}.mp-res button{display:block;width:100%;text-align:left;border:0;border-top:1px solid var(--border,#e4dfee);background:none;padding:10px 14px;font:inherit;cursor:pointer;color:inherit}.mp-res button:first-child{border-top:0}.mp-res button:hover{background:var(--surface,#f4f0fa)}
.mp-map{flex:1;margin:12px 18px 0;border-radius:16px;overflow:hidden;min-height:200px;background:#e9e4f3}
.mp-f{padding:12px 18px 16px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}.mp-lbl{flex:1;min-width:200px;font-size:14px}.mp-lbl small{display:block;color:var(--text-muted,#766f90)}`;
    document.head.appendChild(s);
  }

  WT.pickLocation = function (opts) {
    opts = opts || {}; css();
    return new Promise((resolve) => {
      const bg = document.createElement('div'); bg.className = 'mp-bg'; bg.setAttribute('role', 'dialog'); bg.setAttribute('aria-label', 'Choose your delivery location');
      bg.innerHTML = `<div class="mp"><div class="mp-h"><h2>Pin your delivery location</h2><button class="mp-x" aria-label="Close">×</button></div>
        <div class="mp-s"><input id="mp-q" placeholder="Search a place, e.g. Ntinda, Kampala" autocomplete="off"><button class="mp-b" id="mp-go">Search</button><button class="mp-b" id="mp-me">Use my location</button></div><div class="mp-res" id="mp-res" hidden></div>
        <div class="mp-map" id="mp-map"></div>
        <div class="mp-f"><div class="mp-lbl" id="mp-lbl">Tap the map or drag the pin to the exact spot.</div><button class="mp-b" id="mp-cancel">Cancel</button><button class="mp-b pri" id="mp-ok" disabled>Use this location</button></div></div>`;
      document.body.appendChild(bg); const prevOv = document.body.style.overflow; document.body.style.overflow = 'hidden';
      const $ = (id) => bg.querySelector('#' + id);
      let map, marker, pt = null, label = '';
      const close = (v) => { document.body.style.overflow = prevOv; document.removeEventListener('keydown', key); bg.remove(); resolve(v); };
      const key = (e) => { if (e.key === 'Escape') close(null); };
      document.addEventListener('keydown', key);
      bg.querySelector('.mp-x').onclick = $('mp-cancel').onclick = () => close(null);
      bg.addEventListener('mousedown', (e) => { if (e.target === bg) close(null); });
      const setPoint = async (la, ln, pan) => {
        if (!inUganda(la, ln)) { $('mp-lbl').innerHTML = 'That spot is outside Uganda. We only deliver within Uganda.'; return; }
        pt = { lat: Math.round(la * 1e6) / 1e6, lng: Math.round(ln * 1e6) / 1e6 }; label = '';
        if (!marker) { marker = L.marker([la, ln], { draggable: true }).addTo(map); marker.on('dragend', () => { const p = marker.getLatLng(); setPoint(p.lat, p.lng, false); }); } else marker.setLatLng([la, ln]);
        if (pan) map.setView([la, ln], Math.max(map.getZoom(), 16));
        $('mp-ok').disabled = false;
        const z = WT.zoneForPoint(opts.zones, pt.lat, pt.lng);
        $('mp-lbl').innerHTML = `<b>Pin placed</b>${z ? `<small>Delivery area: ${esc(z.name)}</small>` : ''}`;
        try { const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=17&lat=${pt.lat}&lon=${pt.lng}`, { headers: { Accept: 'application/json' } }); const d = await r.json(); if (pt && pt.lat === Math.round(la * 1e6) / 1e6) { label = d.name || (d.display_name || '').split(',').slice(0, 3).join(',').trim(); if (label) $('mp-lbl').innerHTML = `<b>${esc(label)}</b>${z ? `<small>Delivery area: ${esc(z.name)}</small>` : ''}`; } } catch (e) { /* label is optional */ }
      };
      const search = async () => {
        const q = $('mp-q').value.trim(); if (q.length < 3) return; const box = $('mp-res'); box.hidden = false; box.innerHTML = '<button disabled>Searching…</button>';
        try {
          const r = await fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&countrycodes=ug&limit=6&q=${encodeURIComponent(q)}`, { headers: { Accept: 'application/json' } }); const list = await r.json();
          box.innerHTML = list.length ? list.map((x, i) => `<button data-i="${i}">${esc(x.display_name.split(',').slice(0, 4).join(','))}</button>`).join('') : '<button disabled>No results. Try a nearby area, then move the pin.</button>';
          box.onclick = (e) => { const b = e.target.closest('[data-i]'); if (!b) return; const x = list[+b.dataset.i]; box.hidden = true; setPoint(+x.lat, +x.lon, true); };
        } catch (e) { box.innerHTML = '<button disabled>Search is unavailable right now. Tap the map instead.</button>'; }
      };
      $('mp-go').onclick = search; $('mp-q').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); search(); } };
      $('mp-me').onclick = () => {
        if (!navigator.geolocation) return ($('mp-lbl').textContent = 'Your browser cannot share its location. Tap the map instead.');
        $('mp-me').disabled = true; $('mp-lbl').textContent = 'Finding you…';
        navigator.geolocation.getCurrentPosition((p) => { $('mp-me').disabled = false; setPoint(p.coords.latitude, p.coords.longitude, true); }, () => { $('mp-me').disabled = false; $('mp-lbl').textContent = 'We could not get your location. Allow location access, or tap the map.'; }, { enableHighAccuracy: true, timeout: 12000 });
      };
      $('mp-ok').onclick = () => { if (!pt) return; const z = WT.zoneForPoint(opts.zones, pt.lat, pt.lng); close({ lat: pt.lat, lng: pt.lng, label, zoneId: z ? z.id : null }); };
      load().then(() => {
        const start = opts.lat != null && opts.lng != null && inUganda(+opts.lat, +opts.lng) ? [+opts.lat, +opts.lng] : KLA;
        map = L.map($('mp-map'), { zoomControl: true }).setView(start, opts.lat != null ? 16 : 12);
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
        map.on('click', (e) => setPoint(e.latlng.lat, e.latlng.lng, false));
        if (opts.lat != null && opts.lng != null && inUganda(+opts.lat, +opts.lng)) setPoint(+opts.lat, +opts.lng, false);
        setTimeout(() => map.invalidateSize(), 150);
      }).catch((e) => { $('mp-map').innerHTML = `<div style="padding:24px">${esc(e.message)}</div>`; });
    });
  };
})();
