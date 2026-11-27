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

const { stamp } = require('./build');
const seo = require('./seo');
const cache = new Map();
function readFile(rel) {
  if (isProd && cache.has(rel)) return cache.get(rel);
  const t = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  if (isProd) cache.set(rel, t);
  return t;
}

// The browser-tab icon, Google-results icon and home-screen icon. The same block goes on every page so Google always sees one
// consistent set. Keep these URLs stable: changing them makes Google re-learn the icon from scratch.
const ICON_TAGS = [
  '<link rel="icon" href="/favicon.ico?v=4" sizes="48x48">',
  '<link rel="icon" type="image/svg+xml" href="/favicon.svg?v=4" sizes="any">',
  '<link rel="icon" type="image/png" sizes="96x96" href="/favicon-96x96.png?v=4">',
  '<link rel="icon" type="image/png" sizes="192x192" href="/web-app-manifest-192x192.png">',
  '<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png?v=4">',
  '<link rel="manifest" href="/site.webmanifest">',
  '<meta name="theme-color" content="#2a1262">',
];

// Replace every title/description/Open Graph/Twitter/canonical tag in the page with a fresh, complete set.
//   m.ogTitle / m.ogDescription  what WhatsApp, Facebook, X and Telegram show (can differ from the Google title)
//   m.jsonld                     structured-data objects (schema.org) added to the page
//   m.dropLd                     remove the page's own hard-coded structured data first
//   m.beforeMainEnd              extra HTML placed at the end of <main> (used for the crawlable catalogue)
function withMeta(html, m) {
  const own = (re) => { const x = re.exec(html); return x ? x[1] : ''; };
  const title = m.title || own(/<title>([^<]*)<\/title>/i).replace(/&amp;/g, '&') || "Will's Tech Store";
  const desc = m.description || own(/<meta\s+name="description"\s+content="([^"]*)"/i).replace(/&amp;/g, '&') || 'Authentic smartphones, audio and gadgets in Uganda. Pay on delivery with MTN MoMo, Airtel Money or cash.';
  const ogDesc = m.ogDescription || desc;
  const tags = [
    `<meta name="description" content="${esc(desc)}">`,
    `<link rel="canonical" href="${esc(m.url)}">`,
    ...(m.noindex ? ['<meta name="robots" content="noindex, follow">'] : [
      '<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">',
      `<link rel="alternate" hreflang="en-ug" href="${esc(m.url)}">`, `<link rel="alternate" hreflang="x-default" href="${esc(m.url)}">`]),
    `<meta name="application-name" content="Will's Tech Store">`,
    `<meta name="apple-mobile-web-app-title" content="Will's Tech">`,
    `<meta property="og:type" content="${m.type || 'website'}">`,
    `<meta property="og:site_name" content="Will's Tech Store">`,
    `<meta property="og:locale" content="en_UG">`,
    `<meta property="og:url" content="${esc(m.url)}">`,
    `<meta property="og:title" content="${esc(m.ogTitle || title)}">`,
    `<meta property="og:description" content="${esc(ogDesc)}">`,
    `<meta property="og:image" content="${esc(m.image)}">`,
    `<meta property="og:image:secure_url" content="${esc(m.image)}">`,
    `<meta property="og:image:type" content="${m.imageType || 'image/jpeg'}">`,
    `<meta property="og:image:width" content="${m.imageW || 1200}">`,
    `<meta property="og:image:height" content="${m.imageH || 630}">`,
    `<meta property="og:image:alt" content="${esc(m.imageAlt || title)}">`,
    `<meta name="twitter:card" content="summary_large_image">`,
    `<meta name="twitter:title" content="${esc(m.ogTitle || title)}">`,
    `<meta name="twitter:description" content="${esc(ogDesc)}">`,
    `<meta name="twitter:image" content="${esc(m.image)}">`,
    `<meta name="twitter:image:alt" content="${esc(m.imageAlt || title)}">`,
    ...ICON_TAGS,
    ...(m.extra || []),
    ...(m.jsonld || []).map((o) => `<script type="application/ld+json">${seo.ldJson(o)}</script>`),
  ].join('\n  ');
  let out = html
    .replace(/<title>[^<]*<\/title>/i, `<title>${esc(title)}</title>`)
    .replace(/\s*<meta\s+(?:name|property)="(?:description|og:[^"]*|twitter:[^"]*|robots)"[^>]*>/gi, '')
    .replace(/\s*<link\s+rel="canonical"[^>]*>/gi, '')
    .replace(/\s*<link\s+rel="(?:icon|shortcut icon|apple-touch-icon|manifest)"[^>]*>/gi, '')
    .replace(/\s*<meta\s+name="(?:theme-color|application-name|apple-mobile-web-app-title)"[^>]*>/gi, '');
  if (m.dropLd) out = out.replace(/\s*<script type="application\/ld\+json">[\s\S]*?<\/script>/gi, '');
  out = out.replace(/<\/head>/i, `  ${tags}\n</head>`);
  if (m.beforeMainEnd) out = out.replace(/<\/main>/i, () => `${m.beforeMainEnd}\n</main>`);
  return out;
}

function sendHtml(res, html, status) {
  res.status(status || 200).type('html').set('Cache-Control', 'no-cache').send(stamp(html));   // stamp = the cache bump (?v=BUILD on every script/style)
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
const HOME_TITLE = "Will's Tech Store | Authentic Phones, Laptops & Gadgets in Uganda";
const HOME_DESC = 'Authentic smartphones, laptops, consoles and gadgets in Uganda. Delivery in Kampala, Mbale and nationwide. Pay on delivery with MTN MoMo, Airtel Money or cash.';

// Share-card size. 1200x630 is the size WhatsApp, Facebook, X, Telegram and LinkedIn all show as a full-width preview.
const CARD_W = 1200, CARD_H = 630;
const CARD_VERSION = 3;   // bump to make every platform fetch a fresh share image

async function loadCategoryRows(slug) {
  const rows = await seo.activeProducts();
  return rows.filter((r) => seo.catSlug(r.category) === slug);
}

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
  app.get('/', async (req, res) => {
    const base = origin(req);
    const [info, rows] = await Promise.all([seo.siteInfo(), seo.activeProducts()]);
    sendHtml(res, withMeta(readFile('index.html'), {
      title: HOME_TITLE, description: HOME_DESC, ogTitle: "Will's Tech Store · Authentic phones, laptops & gadgets in Uganda",
      ogDescription: 'Genuine, sealed tech delivered across Uganda. Pay on delivery with MTN MoMo, Airtel Money or cash.',
      url: base + '/', image: abs(req, DEFAULT_IMAGE), imageAlt: "Will's Tech Store: authentic phones, audio and gadgets in Uganda",
      dropLd: true, jsonld: [seo.orgGraph(base, info)],
      beforeMainEnd: rows.length ? seo.catalogueHtml(rows, { title: 'Shop by category', sub: 'Everything we stock in Uganda, priced in UGX, with pay on delivery.', limit: 8 }) : '',
    }));
  });

  // ── Plain pages ─────────────────────────────────────────────────────
  Object.keys(PAGES).forEach((route) => {
    app.get(route, async (req, res) => {
      const base = origin(req);
      const html = readFile(PAGES[route]);
      const meta = { url: base + route, image: abs(req, DEFAULT_IMAGE), noindex: PRIVATE.has(route) };

      if (route === '/shop') {
        // /shop?category=audio → /shop/audio (one clean address per category, so each can rank on its own)
        const wanted = seo.catSlug(req.query.category);
        if (wanted) {
          const rows = await loadCategoryRows(wanted);
          if (rows.length) {
            const rest = new URLSearchParams(qsOf(req)); rest.delete('category');
            return res.redirect(301, '/shop/' + wanted + (rest.toString() ? '?' + rest : ''));
          }
        }
        const rows = await seo.activeProducts();
        meta.title = "Shop Phones, Laptops, Speakers & Gadgets in Uganda | Will's Tech Store";
        meta.description = `Browse ${rows.length || 'all our'} authentic smartphones, speakers, power banks and creator gear in Uganda. Filter by category, brand and price. Pay on delivery.`;
        meta.jsonld = [seo.breadcrumbLd([['Home', base + '/'], ['Shop', base + '/shop']])];
        meta.beforeMainEnd = rows.length ? seo.catalogueHtml(rows, { title: 'All products by category', sub: 'Authentic, brand-new stock with delivery across Uganda.' }) : '';
      } else if (!meta.noindex) {
        const t = (/<title>([^<]*)<\/title>/i.exec(html) || [])[1] || '';
        const label = t.split('|')[0].replace(/&amp;/g, '&').trim();
        if (label) meta.jsonld = [seo.breadcrumbLd([['Home', base + '/'], [label, base + route]])];
      }
      sendHtml(res, withMeta(html, meta));
    });
  });

  // ── Category pages: /shop/<category> ────────────────────────────────
  app.get('/shop/:category', async (req, res) => {
    const base = origin(req), slug = seo.catSlug(req.params.category);
    if (slug !== req.params.category) return res.redirect(301, '/shop/' + slug + qsOf(req));
    const rows = await loadCategoryRows(slug);
    if (!rows.length) return res.redirect(302, '/shop');
    const cm = seo.categoryMeta(rows[0].category, rows), path = '/shop/' + slug;
    let html = readFile('pages/shop.html')
      .replace(/(<h1 id="shop-title">)[^<]*(<\/h1>)/, `$1${esc(cm.label)}$2`)
      .replace(/(<p id="shop-sub">)[^<]*(<\/p>)/, `$1${esc(`Authentic ${cm.label.toLowerCase()} in Uganda, delivered to your door. Pay on delivery.`)}$2`)
      .replace(/(<span id="crumb">)[^<]*(<\/span>)/, `$1${esc(cm.label)}$2`);
    const first = rows.find((r) => (r.images || [])[0]);
    sendHtml(res, withMeta(html, {
      title: cm.title, description: cm.description, ogTitle: `${cm.label} in Uganda · Will's Tech Store`, ogDescription: `${rows.length} authentic ${cm.label.toLowerCase()} with delivery across Uganda. Pay on delivery.`,
      url: base + path, image: first ? `${base}/share/product/${first.id}.jpg?c=${CARD_VERSION}` : abs(req, DEFAULT_IMAGE), imageAlt: `${cm.label} at Will's Tech Store`,
      extra: [`<script>window.__CATEGORY__=${JSON.stringify(slug)};window.__SEO_TITLE__=${JSON.stringify(cm.title)}</script>`],
      jsonld: [seo.breadcrumbLd([['Home', base + '/'], ['Shop', base + '/shop'], [cm.label, base + path]]), seo.collectionLd(base, path, cm.label, rows)],
      beforeMainEnd: seo.catalogueHtml(rows, { title: `All ${cm.label.toLowerCase()} in Uganda`, sub: `${rows.length} authentic ${rows.length === 1 ? 'product' : 'products'}, delivered across Uganda. Pay on delivery.` }),
    }));
  });

  // ── Product pages ───────────────────────────────────────────────────
  app.get('/product/:slug', async (req, res) => {
    const id = idFromSlug(req.params.slug);
    const row = id ? await loadProduct(id) : null;
    const html = readFile('pages/product.html');
    if (!row || row.status !== 'active') {
      return sendHtml(res, withMeta(html, { title: "Product not found | Will's Tech Store", url: origin(req) + req.path, image: abs(req, DEFAULT_IMAGE), noindex: true }), 404);
    }
    const base = origin(req), canonical = productPath(row);
    if (decodeURIComponent(req.path) !== canonical) return res.redirect(301, canonical + qsOf(req));   // old/short link → full link

    const v = row.date_updated ? new Date(row.date_updated).getTime() : 1;
    const image = `${base}/share/product/${row.id}.jpg?v=${v}&c=${CARD_VERSION}`;
    const crumbs = [['Home', base + '/'], ['Shop', base + '/shop']];
    if (row.category) crumbs.push([seo.cap(row.category), `${base}/shop/${seo.catSlug(row.category)}`]);
    crumbs.push([row.name, base + canonical]);

    // Put the real product content into the HTML (the storefront script swaps it for the interactive page once it loads).
    const a = html.indexOf('<div id="pdp-root">'), b = html.indexOf('<section class="section" id="related-section"');
    const withContent = a > -1 && b > a ? html.slice(0, a) + `<div id="pdp-root">${seo.productHtml(base, row, canonical)}</div>\n\n  ` + html.slice(b) : html;

    sendHtml(res, withMeta(withContent, {
      title: seo.productTitle(row.name), description: seo.productDescription(row),
      ogTitle: `${row.name} · ${seo.money(row.price)}`, ogDescription: seo.productShareDescription(row), type: 'product',
      url: base + canonical, image, imageAlt: row.name,
      extra: [
        `<meta property="product:price:amount" content="${Number(row.price)}">`, `<meta property="product:price:currency" content="UGX">`,
        `<meta property="product:availability" content="${row.stock === 'out-of-stock' ? 'out of stock' : 'in stock'}">`,
        `<meta property="product:condition" content="new">`,
        ...(row.brand ? [`<meta property="product:brand" content="${esc(row.brand)}">`] : []),
        `<script>window.__PRODUCT_ID__=${JSON.stringify(String(row.id))}</script>`,
      ],
      jsonld: [seo.productLd(base, row, canonical), seo.breadcrumbLd(crumbs)],
    }));
  });

  // ── Share card ──────────────────────────────────────────────────────
  // A full-width 1200×630 picture: the product photo, edge to edge in height (no circle, no frame), with a blurred copy of the
  // same photo filling the sides and a small logo badge. The sharp photo and the logo stay inside the area WhatsApp never crops.
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
  let badge = null;   // the logo on a purple pill, built once
  async function logoBadge() {
    if (badge !== null) return badge;
    try {
      const logo = await sharp(path.join(ROOT, 'IMAGES', 'logo-white.png')).resize({ width: 124 }).png().toBuffer();
      const meta = await sharp(logo).metadata(), w = meta.width + 40, h = meta.height + 32;
      const pill = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="24" fill="#2a1262"/></svg>`);
      badge = { input: await sharp(pill).composite([{ input: logo, left: 20, top: 16 }]).png().toBuffer(), w, h };
    } catch (e) { badge = false; }
    return badge;
  }
  async function buildCard(coverUrl) {
    const side = (CARD_W - CARD_H) / 2;
    const photo = sharp(await sourceBuffer(coverUrl), { failOn: 'none' }).rotate().flatten({ background: '#ffffff' });
    const square = await photo.resize(CARD_H, CARD_H, { fit: 'contain', background: '#ffffff' }).jpeg({ quality: 88 }).toBuffer();
    // Fill the sides by continuing the photo's own edge colours outwards (seamless on white backgrounds, a soft wash on dark ones),
    // then lay the sharp photo back over the middle. No circle, no frame.
    const wide = await sharp(square).extend({ left: side, right: side, extendWith: 'copy' }).blur(45).jpeg({ quality: 80 }).toBuffer();
    const pill = await logoBadge();
    const layers = [{ input: square, left: side, top: 0 }];
    if (pill) layers.push({ input: pill.input, left: 36, top: CARD_H - pill.h - 36 });
    return sharp(wide).composite(layers).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
  }
  app.get('/share/product/:file', async (req, res) => {
    const m = /^(\d+)\.jpg$/.exec(req.params.file);
    const fallback = () => res.redirect(302, DEFAULT_IMAGE);
    if (!m) return fallback();
    try {
      const row = await loadProduct(m[1]);
      if (!row || row.status !== 'active') return fallback();
      const cover = (row.images || [])[0];
      if (!cover || !sharp) return cover ? res.redirect(302, cover) : fallback();
      const key = `${CARD_VERSION}:${row.id}:${row.date_updated}:${cover}`;
      let jpg = cards.get(key);
      if (!jpg) {
        jpg = await buildCard(cover);
        if (cards.size > 300) cards.delete(cards.keys().next().value);
        cards.set(key, jpg);
      }
      res.type('image/jpeg').set('Cache-Control', 'public, max-age=86400').send(jpg);
    } catch (e) { console.warn('[share] card failed:', e.message); fallback(); }
  });

  // ── Files for search engines and AI assistants ──────────────────────
  app.get('/llms.txt', async (req, res) => {
    try { res.type('text/plain; charset=utf-8').set('Cache-Control', 'public, max-age=3600').send(await seo.llmsTxt(origin(req))); }
    catch (e) { res.status(500).type('text/plain').send('unavailable'); }
  });
  app.get('/feeds/google-merchant.xml', async (req, res) => {
    try { res.type('application/xml').set('Cache-Control', 'public, max-age=3600').send(await seo.merchantFeed(origin(req))); }
    catch (e) { res.status(500).type('text/plain').send('unavailable'); }
  });
  // IndexNow ownership file: /<INDEXNOW_KEY>.txt must contain the key itself.
  app.get(/^\/([A-Za-z0-9-]{8,128})\.txt$/, (req, res, next) => {
    const key = seo.indexNowKey();
    if (key && req.params[0] === key) return res.type('text/plain').send(key);
    next();
  });

  // ── Admin ───────────────────────────────────────────────────────────
  const adminFile = (file) => (req, res) => { res.set('X-Robots-Tag', 'noindex'); sendHtml(res, readFile(file)); };
  app.get('/admin', adminFile('admin.html'));
  app.get('/admin/login', adminFile('admin-login.html'));
  app.get('/admin/orders', (req, res) => res.redirect(302, '/admin#orders'));
}

function notFound(req, res) {
  if (req.accepts('html')) {
    const html = withMeta(readFile('pages/404.html'), { title: "Page not found | Will's Tech Store", url: origin(req) + req.path, image: abs(req, DEFAULT_IMAGE), noindex: true });
    return sendHtml(res, html, 404);   // same no-cache + build stamp as every other page
  }
  res.status(404).json({ error: 'Not found' });
}

module.exports = { install, notFound, PAGES, slugify, productPath, origin };
