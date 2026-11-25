// pages.js — clean URLs + link-preview (Open Graph / Twitter) tags for the storefront.
//   /shop, /cart, /about …          → pages/<name>.html
//   /product/<name-slug>-<id>       → pages/product.html with the product's own title, description and cover image
//   /share/product/<id>.jpg         → 1200×630 share card built from the product's cover photo
// The old .html addresses still work: they 301 to the clean address, so links people already shared keep working.
const fs = require('fs');
const path = require('path');
const { pool } = require('../db');

const ROOT = path.join(__dirname, '..', '..', '..');
const isProd = process.env.NODE_ENV === 'production';

// clean path → file under the project root
const PAGES = {
  '/shop': 'pages/shop.html', '/about': 'pages/about.html', '/contact': 'pages/contact.html', '/faq': 'pages/faq.html',
  '/shipping': 'pages/shipping.html', '/returns': 'pages/returns.html', '/privacy': 'pages/privacy.html', '/terms': 'pages/terms.html',
  '/cookies': 'pages/cookies.html', '/cart': 'pages/cart.html', '/checkout': 'pages/checkout.html', '/order-confirmation': 'pages/order-confirmation.html',
  '/track-order': 'pages/track-order.html', '/wishlist': 'pages/wishlist.html', '/login': 'pages/login.html', '/register': 'pages/register.html',
  '/reset-password': 'pages/reset-password.html', '/account': 'pages/account.html',
};
// pages that should not show up in search results or link previews
const PRIVATE = new Set(['/cart', '/checkout', '/order-confirmation', '/wishlist', '/login', '/register', '/reset-password', '/account', '/track-order']);

 // Short, readable slug: the part of the name before the first " - " / "," / "(", cut at a whole word (max 60 chars).
// The slug is only cosmetic; the product is found by the id at the end, and any other slug 301-redirects to this one.
const baseSlug = (s) => String(s || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
const slugify = (name) => {
  let t = baseSlug(String(name || '').split(/\s[-–—]\s|[,|(]/)[0]) || baseSlug(name);
  if (t.length > 60) { t = t.slice(0, 60); const i = t.lastIndexOf('-'); if (i > 15) t = t.slice(0, i); }
  return t.replace(/-+$/, '');
};
const productPath = (p) => '/product/' + (slugify(p.name) ? slugify(p.name) + '-' : '') + p.id;
const idFromSlug = (slug) => { const m = /(?:^|-)(\d+)$/.exec(String(slug || '')); return m ? m[1] : null; };

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const oneLine = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t; };

function origin(req) {
  const env = (process.env.PUBLIC_URL || '').trim().replace(/\/$/, '');
  return env || `${req.protocol}://${req.get('host')}`;
}
const abs = (req, u) => (/^https?:\/\//i.test(u) ? u : origin(req) + (u.startsWith('/') ? u : '/' + u));

const cache = new Map();
function readFile(rel) {
  if (isProd && cache.has(rel)) return cache.get(rel);
  const t = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (isProd) cache.set(rel, t);
  return t;
}

// Replace every title/description/Open Graph/Twitter/canonical tag in the page with a fresh, complete set.
function withMeta(html, m) {
  const own = (re) => { const x = re.exec(html); return x ? x[1] : ''; };
  const title = m.title || own(/<title>([^<]*)<\/title>/i).replace(/&amp;/g, '&') || "Will's Tech Store";
  const desc = m.description || own(/<meta\s+name="description"\s+content="([^"]*)"/i).replace(/&amp;/g, '&') || 'Authentic smartphones, audio and gadgets in Uganda. Pay on delivery with MTN MoMo, Airtel Money or cash.';
  const tags = [
    `<meta name="description" content="${esc(desc)}">`,
    `<link rel="canonical" href="${esc(m.url)}">`,
    `<meta property="og:type" content="${m.type || 'website'}">`,
    `<meta property="og:site_name" content="Will's Tech Store">`,
    `<meta property="og:locale" content="en_UG">`,
    `<meta property="og:url" content="${esc(m.url)}">`,
    `<meta property="og:title" content="${esc(m.ogTitle || title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:image" content="${esc(m.image)}">`,
    `<meta property="og:image:secure_url" content="${esc(m.image)}">`,
    `<meta property="og:image:type" content="${m.imageType || 'image/jpeg'}">`,
    `<meta property="og:image:width" content="${m.imageW || 1200}">`,
    `<meta property="og:image:height" content="${m.imageH || 630}">`,
    `<meta property="og:image:alt" content="${esc(m.imageAlt || title)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(m.ogTitle || title)}">`,
    `<meta name="twitter:description" content="${esc(desc)}">`,
    `<meta name="twitter:image" content="${esc(m.image)}">`,
    `<meta name="twitter:image:alt" content="${esc(m.imageAlt || title)}">`,
    ...(m.extra || []),
    ...(m.noindex ? ['<meta name="robots" content="noindex">'] : []),
  ].join('\n  ');
  return html
    .replace(/<title>[^<]*<\/title>/i, `<title>${esc(title)}</title>`)
    .replace(/\s*<meta\s+(?:name|property)="(?:description|og:[^"]*|twitter:[^"]*|robots)"[^>]*>/gi, '')
    .replace(/\s*<link\s+rel="canonical"[^>]*>/gi, '')
    .replace(/<\/head>/i, `  ${tags}\n</head>`);
}

function sendHtml(res, html, status) {
  res.status(status || 200).type('html').set('Cache-Control', 'no-cache').send(html);
}

async function loadProduct(id) {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, description, short_description, price, original_price, images, category, brand, sku, stock, status, rating, review_count, date_updated
         FROM products WHERE id::text = $1`, [String(id)]);
    return rows[0] || null;
  } catch (e) { return null; }
}

const DEFAULT_IMAGE = '/IMAGES/social-share.jpg';

function install(app) {
  // ── Old addresses → clean ones (301, query string kept) ─────────────
  const qsOf = (req) => { const i = req.originalUrl.indexOf('?'); return i < 0 ? '' : req.originalUrl.slice(i); };
  app.use((req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const p = req.path;
    if (p.startsWith('/api/')) return next();
    if (p.length > 1 && p.endsWith('/')) return res.redirect(301, p.replace(/\/+$/, '') + qsOf(req));   // /shop/ → /shop
    if (p === '/index.html') return res.redirect(301, '/' + qsOf(req));
    if (p === '/admin.html') return res.redirect(301, '/admin' + qsOf(req));
    if (p === '/admin-login.html') return res.redirect(301, '/admin/login' + qsOf(req));
    if (p === '/admin-orders.html') return res.redirect(301, '/admin#orders');
    const m = /^\/(?:pages\/)?([a-z0-9-]+)\.html$/i.exec(p);
    if (m) {
      const clean = '/' + m[1].toLowerCase();
      if (clean === '/product') {
        const id = new URLSearchParams(qsOf(req)).get('id');
        if (!id) return res.redirect(301, '/shop');
        return loadProduct(id).then((row) => res.redirect(301, row ? productPath(row) : '/product/' + encodeURIComponent(id)), () => res.redirect(301, '/shop'));
      }
      if (clean === '/404') return res.redirect(301, '/');
      if (PAGES[clean]) return res.redirect(301, clean + qsOf(req));
    }
    next();
  });

  // ── Home ────────────────────────────────────────────────────────────
  app.get('/', (req, res) => {
    sendHtml(res, withMeta(readFile('index.html'), { url: origin(req) + '/', image: abs(req, DEFAULT_IMAGE), imageAlt: "Will's Tech Store" }));
  });

  // ── Plain pages ─────────────────────────────────────────────────────
  Object.keys(PAGES).forEach((route) => {
    app.get(route, (req, res) => {
      sendHtml(res, withMeta(readFile(PAGES[route]), { url: origin(req) + route, image: abs(req, DEFAULT_IMAGE), noindex: PRIVATE.has(route) }));
    });
  });

  // ── Product pages ───────────────────────────────────────────────────
  app.get('/product/:slug', async (req, res) => {
    const id = idFromSlug(req.params.slug);
    const row = id ? await loadProduct(id) : null;
    const html = readFile('pages/product.html');
    if (!row || row.status !== 'active') {
      return sendHtml(res, withMeta(html, { title: "Product not found | Will's Tech Store", url: origin(req) + req.path, image: abs(req, DEFAULT_IMAGE), noindex: true }), 404);
    }
    const canonical = productPath(row);
    if (decodeURIComponent(req.path) !== canonical) return res.redirect(301, canonical + qsOf(req));   // old/short link → full link

    const price = Number(row.price), was = row.original_price != null ? Number(row.original_price) : 0;
    const money = (n) => 'UGX ' + Math.round(n).toLocaleString('en-UG');
    const first = oneLine(row.short_description || row.description, 150);
    const description = `${money(price)}${was > price ? ` (was ${money(was)})` : ''}. ${first || 'Authentic, brand-new, delivered anywhere in Uganda. Pay on delivery.'}`;
    const v = row.date_updated ? new Date(row.date_updated).getTime() : 1;
    const image = `${origin(req)}/share/product/${row.id}.jpg?v=${v}`;
    const inStock = !['out-of-stock'].includes(row.stock);
    const ld = {
      '@context': 'https://schema.org', '@type': 'Product', name: row.name, image: [image], description: oneLine(row.description, 300) || undefined,
      sku: row.sku || undefined, brand: row.brand ? { '@type': 'Brand', name: row.brand } : undefined,
      offers: { '@type': 'Offer', url: origin(req) + canonical, priceCurrency: 'UGX', price, availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock' },
      ...(row.rating > 0 && row.review_count > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(row.rating), reviewCount: row.review_count } } : {}),
    };
    sendHtml(res, withMeta(html, {
      title: `${row.name} | Will's Tech Store`, ogTitle: `${row.name} · ${money(price)}`, description, type: 'product',
      url: origin(req) + canonical, image, imageAlt: row.name,
      extra: [
        `<meta property="product:price:amount" content="${price}">`, `<meta property="product:price:currency" content="UGX">`,
        `<meta property="product:availability" content="${inStock ? 'in stock' : 'out of stock'}">`,
        `<script>window.__PRODUCT_ID__=${JSON.stringify(String(row.id))}</script>`,
        `<script type="application/ld+json" id="ld-product">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
      ],
    }));
  });

  // ── Share card: the product's cover photo in a circle on a 1200×630 canvas ──
  let sharp = null; try { sharp = require('sharp'); } catch (e) { /* falls back to the raw cover photo */ }
  const cards = new Map();
  async function sourceBuffer(url) {
    const local = /\/public\/images\/products\/([^/?#]+)$/.exec(url || '');
    if (local) { const f = path.join(ROOT, 'public', 'images', 'products', path.basename(local[1])); if (fs.existsSync(f)) return fs.readFileSync(f); }
    if (/^\/public\//.test(url || '')) { const f = path.normalize(path.join(ROOT, url)); if (f.startsWith(path.join(ROOT, 'public')) && fs.existsSync(f)) return fs.readFileSync(f); }
    if (/^https?:\/\//i.test(url || '')) {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) throw new Error('image ' + r.status);
      const b = Buffer.from(await r.arrayBuffer());
      if (b.length > 12 * 1024 * 1024) throw new Error('image too large');
      return b;
    }
    throw new Error('no image');
  }
  app.get('/share/product/:file', async (req, res) => {
    const m = /^(\d+)\.jpg$/.exec(req.params.file);
    const fallback = () => res.redirect(302, DEFAULT_IMAGE);
    if (!m) return fallback();
    try {
      const row = await loadProduct(m[1]);
      if (!row || row.status !== 'active') return fallback();
      const cover = (row.images || [])[0];
      if (!cover || !sharp) return cover ? res.redirect(302, /^https?:/i.test(cover) ? cover : cover) : fallback();
      const key = `${row.id}:${row.date_updated}:${cover}`;
      let jpg = cards.get(key);
      if (!jpg) {
        const S = 540;
        const photo = await sharp(await sourceBuffer(cover), { failOn: 'none' }).rotate().flatten({ background: '#ffffff' })
          .resize(S, S, { fit: 'contain', background: '#ffffff' })
          .composite([{ input: Buffer.from(`<svg width="${S}" height="${S}"><circle cx="${S / 2}" cy="${S / 2}" r="${S / 2}"/></svg>`), blend: 'dest-in' }]).png().toBuffer();
        const bg = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#f3efff"/><stop offset="1" stop-color="#ddd2fb"/></linearGradient></defs><rect width="1200" height="630" fill="url(#g)"/><circle cx="600" cy="315" r="292" fill="#ffffff"/><circle cx="600" cy="315" r="292" fill="none" stroke="#2a1262" stroke-opacity=".12" stroke-width="3"/></svg>`);
        jpg = await sharp(bg).composite([{ input: photo, left: 330, top: 45 }]).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
        if (cards.size > 300) cards.delete(cards.keys().next().value);
        cards.set(key, jpg);
      }
      res.type('image/jpeg').set('Cache-Control', 'public, max-age=86400').send(jpg);
    } catch (e) { console.warn('[share] card failed:', e.message); fallback(); }
  });

  // ── Admin ───────────────────────────────────────────────────────────
  const adminFile = (file) => (req, res) => { res.set('X-Robots-Tag', 'noindex'); res.sendFile(path.join(ROOT, file)); };
  app.get('/admin', adminFile('admin.html'));
  app.get('/admin/login', adminFile('admin-login.html'));
  app.get('/admin/orders', (req, res) => res.redirect(302, '/admin#orders'));
}

function notFound(req, res) {
  if (req.accepts('html')) {
    const html = withMeta(readFile('pages/404.html'), { title: "Page not found | Will's Tech Store", url: origin(req) + req.path, image: abs(req, DEFAULT_IMAGE), noindex: true });
    return res.status(404).type('html').send(html);
  }
  res.status(404).json({ error: 'Not found' });
}

module.exports = { install, notFound, PAGES, slugify, productPath, origin };
