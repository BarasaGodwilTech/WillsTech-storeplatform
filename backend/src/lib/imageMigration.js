// imageMigration.js — moves every product photo that is not on Cloudflare R2 yet onto R2 (optimised), then
// rewrites the links in products and in saved orders. Safe to run again: photos already on R2 are skipped,
// and nothing is deleted from the old location.
const fs = require('fs');
const path = require('path');
const storage = require('./storage');
const { pool } = require('../db');

const LOCAL_RE = /\/public\/images\/products\/([^/?#]+)$/;
const mimeOf = (f) => ({ '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' }[path.extname(f).toLowerCase()] || 'image/jpeg');

async function loadBuffer(url) {
  const m = LOCAL_RE.exec(url);
  if (m) {   // a file shipped with the project
    const file = path.join(storage.LOCAL_DIR, decodeURIComponent(m[1]));
    if (fs.existsSync(file)) return { buffer: fs.readFileSync(file), mime: mimeOf(file), name: path.parse(file).name };
  }
  if (/^https?:\/\//i.test(url)) {   // old absolute links (e.g. GitHub)
    const res = await fetch(url);
    if (!res.ok) throw new Error(`download failed (HTTP ${res.status})`);
    return { buffer: Buffer.from(await res.arrayBuffer()), mime: res.headers.get('content-type') || 'image/jpeg', name: m ? path.parse(decodeURIComponent(m[1])).name : null };
  }
  throw new Error('file not found on this server');
}

async function plan() {
  const { rows } = await pool.query(`SELECT images FROM products`);
  const urls = new Set();
  rows.forEach((r) => (r.images || []).forEach((u) => { if (u && !storage.isR2Url(u)) urls.add(u); }));
  return { total: urls.size, urls: [...urls] };
}

async function migrate({ onProgress } = {}) {
  if (!storage.isR2()) throw new Error('R2 is not set up. Add the R2_* values to backend/.env first.');
  const { urls } = await plan();
  const map = new Map(); const failed = []; let done = 0;
  for (const url of urls) {
    try {
      const { buffer, mime, name } = await loadBuffer(url);
      const saved = await storage.saveProductImage(buffer, mime, name || undefined);
      map.set(url, saved.url);
    } catch (e) { failed.push({ url, error: e.message }); }
    done++; if (onProgress) onProgress({ done, total: urls.length, failed: failed.length });
  }
  let productsUpdated = 0, ordersUpdated = 0;
  const { rows: prods } = await pool.query(`SELECT id, images FROM products`);
  for (const p of prods) {
    const next = (p.images || []).map((u) => map.get(u) || u);
    if (JSON.stringify(next) !== JSON.stringify(p.images || [])) { await pool.query(`UPDATE products SET images = $1, date_updated = now() WHERE id = $2`, [JSON.stringify(next), p.id]); productsUpdated++; }
  }
  const { rows: ords } = await pool.query(`SELECT id, items FROM orders`);
  for (const o of ords) {
    let changed = false;
    const items = (o.items || []).map((i) => { if (i && i.image && map.has(i.image)) { changed = true; return { ...i, image: map.get(i.image) }; } return i; });
    if (changed) { await pool.query(`UPDATE orders SET items = $1 WHERE id = $2`, [JSON.stringify(items), o.id]); ordersUpdated++; }
  }
  return { moved: map.size, failed, productsUpdated, ordersUpdated, total: urls.length };
}

module.exports = { plan, migrate };
