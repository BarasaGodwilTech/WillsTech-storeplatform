// server.js — Will's Tech Store backend.
// Serves the storefront (an explicit allowlist of public files/folders) AND
// the JSON API under /api from one Node process/port.
require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const compression = require('compression');
const fs = require('fs');

const isProd = process.env.NODE_ENV === 'production';

// ── Fail fast on unsafe secrets ─────────────────────────
const jwtSecret = process.env.JWT_SECRET || '';
if (!jwtSecret || jwtSecret.startsWith('replace_this') || jwtSecret.length < 32) {
  const msg = '[server] JWT_SECRET is missing, too short (<32 chars) or still the example value.\n' +
    '        Generate one: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"';
  if (isProd) { console.error(msg); process.exit(1); }
  console.warn('\n' + msg + '\n        (allowed in development only)\n');
}
if (isProd && process.env.ADMIN_PASSWORD === 'ChangeMe123!') {
  console.warn('[server] WARNING: ADMIN_PASSWORD is still the default. Change it from the admin panel.');
}

const { pool } = require('./src/db');
const { rateLimit } = require('./src/middleware/rateLimit');

const authRoutes = require('./src/routes/auth.routes');
const adminRoutes = require('./src/routes/admin.routes');
const adminShopRoutes = require('./src/routes/admin.shop.routes');
const adminCatalogRoutes = require('./src/routes/admin.catalog.routes');
const { getStoreSettings } = require('./src/shopConfig');
const productRoutes = require('./src/routes/products.routes');
const orderRoutes = require('./src/routes/orders.routes');
const uploadRoutes = require('./src/routes/uploads.routes');
const accountRoutes = require('./src/routes/account.routes');
const shopRoutes = require('./src/routes/shop.routes');
const pagesLib = require('./src/lib/pages');
const seoLib = require('./src/lib/seo');

// Express 4 does not catch rejected promises. Log them instead of letting Node (v15+) kill the whole server.
process.on('unhandledRejection', (err) => console.error('[server] Unhandled rejection:', err && err.stack || err));
process.on('uncaughtException', (err) => console.error('[server] Uncaught exception:', err && err.stack || err));

const app = express();
const PORT = process.env.PORT || 4000;
const FRONTEND_ROOT = path.join(__dirname, '..');

app.disable('x-powered-by');
app.set('trust proxy', 1); // correct client IPs behind Railway/Render/nginx

app.use(compression());   // gzip JSON/JS/CSS
app.use(morgan(isProd ? 'combined' : 'dev'));

// Basic security headers (no extra dependency needed).
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(self)');
  if (isProd) res.setHeader('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
  next();
});

// CORS: same-origin by default. Set CORS_ORIGIN (comma-separated) only if the
// frontend is hosted on a different origin.
const allowedOrigins = (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean);
app.use('/api', cors({
  origin: allowedOrigins.length ? allowedOrigins : false,
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// ── API ─────────────────────────────────────────────────
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', db: 'up', time: new Date().toISOString() });
  } catch (e) {
    res.status(503).json({ status: 'degraded', db: 'down' });
  }
});

// Brute-force protection on credential endpoints.
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: 'Too many attempts. Please try again in a few minutes.' });
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);
app.use('/api/admin/login', authLimiter);
// Stop spam on public forms.
['/api/shop/newsletter', '/api/shop/contact'].forEach((route) => app.use(route, (req, res, next) => (req.method === 'POST'
  ? rateLimit({ windowMs: 10 * 60 * 1000, max: 8, message: 'Too many submissions. Please try again later.' })(req, res, next)
  : next())));
// Stop order spam from guests.
app.use('/api/orders', (req, res, next) => (req.method === 'POST'
  ? rateLimit({ windowMs: 10 * 60 * 1000, max: 30, message: 'Too many orders. Please slow down.' })(req, res, next)
  : next()));

// The build ID changes whenever the site's code changes (see src/lib/build.js). Open tabs poll this to notice a new deploy.
app.get('/api/version', (req, res) => res.set('Cache-Control', 'no-store').json({ build: require('./src/lib/build').BUILD }));

app.use('/api/auth', authRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/admin', adminShopRoutes);
app.use('/api/admin', adminCatalogRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/account', accountRoutes);
app.use('/api/shop', shopRoutes);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

// /js/site.js = the static constants file PLUS whatever the owner saved in Admin → Store settings,
// so phone, email and social-link changes show up on every page without editing code.
app.get('/js/site.js', async (req, res, next) => {
  try {
    const base = fs.readFileSync(path.join(FRONTEND_ROOT, 'js', 'site.js'), 'utf8');
    const o = await getStoreSettings();
    const extra = Object.keys(o).length
      ? `\n;(function(o){var S=window.SITE;Object.keys(o).forEach(function(k){if(k==='social'){S.social=Object.assign({},S.social,o.social)}else{S[k]=o[k]}})})(${JSON.stringify(o).replace(/</g, '\\u003c')});\n` : '';
    res.type('application/javascript').set('Cache-Control', 'no-cache').send(base + extra);
  } catch (e) { next(); }
});

// ── Static frontend (ALLOWLIST ONLY) ────────────────────
// Previously the whole project root was served, which exposed backend/ source,
// backend/.env, firestore.rules and data/images (ID photos). Now only public
// assets are reachable.
// Scripts and styles are re-checked on every load (a cheap 304 when unchanged) so a deploy can never leave a visitor
// with an old script talking to new pages. Photos and videos are cached for a day.
const staticOpts = { dotfiles: 'ignore', index: false, maxAge: isProd ? '1d' : 0 };
const codeOpts = { dotfiles: 'ignore', index: false, etag: true, setHeaders: (res) => res.setHeader('Cache-Control', 'no-cache') };
['css', 'js'].forEach((dir) => app.use('/' + dir, express.static(path.join(FRONTEND_ROOT, dir), codeOpts)));
['IMAGES', 'public'].forEach((dir) => {
  app.use('/' + dir, express.static(path.join(FRONTEND_ROOT, dir), staticOpts));
});
// Product images get a long cache (filenames are timestamped, never reused).
app.use('/public/images/products', express.static(path.join(FRONTEND_ROOT, 'public', 'images', 'products'), { maxAge: '30d', dotfiles: 'ignore' }));

const PUBLIC_FILES = [
  'robots.txt', 'site.webmanifest',
  'favicon.ico', 'favicon.svg', 'favicon-16x16.png', 'favicon-32x32.png', 'favicon-48x48.png', 'favicon-96x96.png',
  'apple-touch-icon.png',
  'web-app-manifest-192x192.png', 'web-app-manifest-512x512.png', 'web-app-manifest-512x512-maskable.png',
];
PUBLIC_FILES.forEach((f) => app.get('/' + f, (req, res) => res.sendFile(path.join(FRONTEND_ROOT, f))));
// Static catalogue the storefront falls back to when /api/products is unreachable (js/products.js). Only this one file of data/ is public.
app.get('/data/site-config.json', (req, res) => res.set('Cache-Control', 'no-cache').sendFile(path.join(FRONTEND_ROOT, 'data', 'site-config.json')));
// Clean URLs (/shop, /product/<name>-<id>, /admin …), old .html redirects and link-preview tags live in src/lib/pages.js.
pagesLib.install(app);
// Dynamic sitemap: static pages + category pages + every active product (with its photos, for Google Images).
app.get('/sitemap.xml', async (req, res) => {
  try {
    const base = pagesLib.origin(req);
    const rows = await seoLib.activeProducts();
    const day = (d) => new Date(d).toISOString().slice(0, 10);
    const newest = rows.reduce((m, r) => (r.date_updated && new Date(r.date_updated) > m ? new Date(r.date_updated) : m), new Date(0));
    const lastmod = (d) => (d && new Date(d).getTime() > 0 ? `<lastmod>${day(d)}</lastmod>` : '');
    const entry = (loc, d, freq, prio, extra) => `<url><loc>${seoLib.escXml(loc)}</loc>${lastmod(d)}<changefreq>${freq}</changefreq><priority>${prio}</priority>${extra || ''}</url>`;
    const cats = new Map();
    rows.forEach((r) => { if (!r.category) return; const k = seoLib.catSlug(r.category); const d = r.date_updated ? new Date(r.date_updated) : new Date(0); if (!cats.has(k) || d > cats.get(k)) cats.set(k, d); });
    const staticPages = [['', 'daily', '1.0', newest], ['shop', 'daily', '0.9', newest], ['about', 'monthly', '0.5'], ['contact', 'monthly', '0.5'], ['faq', 'monthly', '0.6'], ['shipping', 'monthly', '0.5'], ['returns', 'monthly', '0.4'], ['privacy', 'yearly', '0.2'], ['terms', 'yearly', '0.2']];
    const urls = [
      ...staticPages.map(([p, f, pr, d]) => entry(`${base}/${p}`, d, f, pr)),
      ...[...cats.entries()].map(([slug, d]) => entry(`${base}/shop/${slug}`, d, 'daily', '0.8')),
      ...rows.map((r) => entry(`${base}${pagesLib.productPath(r)}`, r.date_updated, 'weekly', '0.7',
        (r.images || []).filter(Boolean).slice(0, 6).map((u) => `<image:image><image:loc>${seoLib.escXml(seoLib.absUrl(base, u))}</image:loc><image:title>${seoLib.escXml(r.name)}</image:title></image:image>`).join(''))),
    ];
    res.type('application/xml').set('Cache-Control', 'public, max-age=1800')
      .send(`<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">${urls.join('')}</urlset>`);
  } catch (e) { res.status(500).type('text/plain').send('sitemap unavailable'); }
});

// Friendly 404 page for browsers; JSON for everything else.
app.use(pagesLib.notFound);

// ── Error handler ───────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[server] Unhandled error:', err);
  const status = err.status || (err.code === 'LIMIT_FILE_SIZE' ? 413 : 500);
  // Don't leak internals on 5xx in production.
  const message = status >= 500 && isProd ? 'Something went wrong' : (err.message || 'Something went wrong');
  res.status(status).json({ error: message });
});

const server = app.listen(PORT, () => {
  console.log(`\n  Will's Tech Store backend running:`);
  console.log(`  → http://localhost:${PORT}          (storefront)`);
  console.log(`  → http://localhost:${PORT}/admin/login  (admin panel)`);
  console.log(`  → http://localhost:${PORT}/api/health         (API health check)\n`);
});

// Graceful shutdown (Docker/Railway send SIGTERM on deploy).
['SIGTERM', 'SIGINT'].forEach((sig) => process.on(sig, () => {
  console.log(`[server] ${sig} received, shutting down...`);
  server.close(() => pool.end().then(() => process.exit(0)));
  setTimeout(() => process.exit(1), 10000).unref();
}));
