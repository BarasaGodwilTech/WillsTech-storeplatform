// Admin-only endpoints for running the catalogue: SKUs, categories, reviews/ratings, photo storage (R2),
// settings (store details, delivery & payments, delivery templates) and the optional AI writing helper.
const express = require('express');
const { pool } = require('../db');
const { requireAdmin } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { backfillSkus, prefixFor } = require('../lib/sku');
const { recalcRating, recalcAll } = require('../lib/ratings');
const storage = require('../lib/storage');
const imageMigration = require('../lib/imageMigration');
const { DEFAULTS, DEFAULT_TEMPLATES, getShopConfig, getDeliveryTemplates, clearStoreCache, getStoreForAdmin, setting } = require('../shopConfig');

const router = express.Router();
router.use(requireAdmin);

// ── SKUs ────────────────────────────────────────────────
router.post('/products/backfill-skus', async (req, res) => {
  try { res.json({ ok: true, updated: await backfillSkus(pool, { renumberAll: !!(req.body && req.body.renumberAll) }) }); }
  catch (e) { console.error('[admin] backfill skus:', e.message); res.status(500).json({ error: 'Could not generate SKUs' }); }
});
// Preview the next SKU for a category without using it up (the real number is taken when the product is saved).
router.get('/products/next-sku', async (req, res) => {
  try {
    const prefix = prefixFor(req.query.category);
    const { rows } = await pool.query('SELECT last_n FROM sku_counters WHERE prefix = $1', [prefix]);
    res.json({ sku: `WT-${prefix}-${String(((rows[0] && rows[0].last_n) || 0) + 1).padStart(4, '0')}`, prefix });
  } catch (e) { res.status(500).json({ error: 'Could not preview SKU' }); }
});

// ── Categories ──────────────────────────────────────────
router.get('/categories', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT COALESCE(NULLIF(category,''),'(none)') AS name, COUNT(*)::int AS count,
      COUNT(*) FILTER (WHERE status = 'active')::int AS visible FROM products GROUP BY 1 ORDER BY count DESC, name`);
    res.json({ categories: rows });
  } catch (e) { res.status(500).json({ error: 'Could not load categories' }); }
});
// Rename a category (or merge it into another) for every product at once.
router.post('/categories/rename', async (req, res) => {
  try {
    const from = String(req.body && req.body.from || '').trim().toLowerCase();
    const to = String(req.body && req.body.to || '').trim().toLowerCase().slice(0, 60);
    if (!from || !to) return res.status(400).json({ error: 'Choose a category and a new name' });
    const r = await pool.query('UPDATE products SET category = $1, date_updated = now() WHERE category = $2', [to, from]);
    res.json({ ok: true, updated: r.rowCount });
  } catch (e) { res.status(500).json({ error: 'Could not rename category' }); }
});

// ── Reviews & ratings ───────────────────────────────────
router.get('/reviews', async (req, res) => {
  try {
    const { rows } = await pool.query(`SELECT r.id, r.product_id, p.name AS product_name, r.author_name, r.rating, r.title, r.body, r.verified, r.created_at
      FROM reviews r LEFT JOIN products p ON p.id = r.product_id ORDER BY r.created_at DESC LIMIT 500`);
    res.json({ reviews: rows });
  } catch (e) { res.status(500).json({ error: 'Could not load reviews' }); }
});
router.delete('/reviews/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('DELETE FROM reviews WHERE id::text = $1 RETURNING product_id', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Review not found' });
    await recalcRating(pool, rows[0].product_id);
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Could not delete review' }); }
});
router.post('/reviews/clear-all', async (req, res) => {
  try {
    if (!(req.body && req.body.confirm === 'CLEAR')) return res.status(400).json({ error: 'Please confirm' });
    const r = await pool.query('DELETE FROM reviews');
    await recalcAll(pool);
    res.json({ ok: true, deleted: r.rowCount });
  } catch (e) { res.status(500).json({ error: 'Could not clear reviews' }); }
});

// ── Photo storage (Cloudflare R2) ───────────────────────
const job = {
  state: 'idle', done: 0, total: 0, failed: 0, result: null, error: null,
  public() { return { state: this.state, done: this.done, total: this.total, failed: this.failed, result: this.result, error: this.error }; },
};
router.get('/storage', async (req, res) => {
  try {
    const st = await storage.status();
    const { rows } = await pool.query(`SELECT images FROM products`);
    let total = 0, onR2 = 0;
    rows.forEach((r) => (r.images || []).forEach((u) => { if (u) { total++; if (storage.isR2Url(u)) onR2++; } }));
    res.json({ ...st, photos: { total, onR2, toMove: total - onR2 }, job: job.public() });
  } catch (e) { res.status(500).json({ error: 'Could not read storage status' }); }
});
router.post('/storage/test', async (req, res) => { res.json(await storage.testConnection()); });
// The move runs in the background; the admin page polls GET /storage for progress.
router.post('/storage/migrate', (req, res) => {
  if (!storage.isR2()) return res.status(400).json({ error: 'R2 is not set up yet. Add the R2_* values to backend/.env and restart the server.' });
  if (job.state === 'running') return res.status(409).json({ error: 'A move is already running' });
  Object.assign(job, { state: 'running', done: 0, total: 0, failed: 0, result: null, error: null });
  imageMigration.migrate({ onProgress: (p) => Object.assign(job, p) })
    .then((result) => { job.result = result; job.state = 'done'; })
    .catch((e) => { job.error = e.message; job.state = 'error'; console.error('[storage] migrate failed:', e.message); });
  res.status(202).json({ ok: true });
});

// ── Settings: store details, delivery & payments, delivery templates ─────
const SECTIONS = ['store', 'shipping', 'delivery_templates'];
router.get('/settings/:section', async (req, res) => {
  const s = req.params.section;
  if (!SECTIONS.includes(s)) return res.status(404).json({ error: 'Unknown settings section' });
  try {
    if (s === 'shipping') return res.json({ value: await getShopConfig(), defaults: DEFAULTS });
    if (s === 'delivery_templates') return res.json({ value: await getDeliveryTemplates(), defaults: DEFAULT_TEMPLATES });
    res.json({ value: await getStoreForAdmin() });
  } catch (e) { res.status(500).json({ error: 'Could not load settings' }); }
});

function cleanSettings(s, v) {
  const bad = (m) => { const e = new Error(m); e.status = 400; throw e; };
  v = v || {};
  if (s === 'delivery_templates') {
    const out = (Array.isArray(v) ? v : v.templates || []).slice(0, 20).map((t, i) => ({
      id: String(t.id || 'tpl-' + i).slice(0, 40), name: String(t.name || '').trim().slice(0, 80),
      days: Math.max(0, Math.min(60, Math.floor(Number(t.days) || 0))), window: String(t.window || '').trim().slice(0, 60), note: String(t.note || '').trim().slice(0, 600),
    })).filter((t) => t.name);
    if (!out.length) bad('Keep at least one delivery template');
    return out;
  }
  if (s === 'shipping') {
    const zones = (Array.isArray(v.zones) ? v.zones : []).slice(0, 30).map((z) => {
      const o = { id: String(z.id || '').trim().slice(0, 40), name: String(z.name || '').trim().slice(0, 80), fee: Math.max(0, Number(z.fee) || 0), quote: !!z.quote, eta: String(z.eta || '').trim().slice(0, 120), freeOverThreshold: !!z.freeOverThreshold };
      if (z.lat !== '' && z.lng !== '' && z.lat != null && z.lng != null && Number.isFinite(Number(z.lat)) && Number.isFinite(Number(z.lng)) && Number(z.radiusKm) > 0) { o.lat = Number(z.lat); o.lng = Number(z.lng); o.radiusKm = Math.min(500, Number(z.radiusKm)); }
      return o;
    }).filter((z) => z.id && z.name);
    if (!zones.length) bad('Keep at least one delivery zone');
    const pays = (Array.isArray(v.paymentMethods) ? v.paymentMethods : []).filter((m) => m && ['momo', 'airtel', 'cod', 'bank'].includes(m.id)).map((m) => ({ id: m.id, name: String(m.name || m.id).slice(0, 60), hint: String(m.hint || '').slice(0, 120) }));
    if (!pays.length) bad('Keep at least one payment method on');
    return { freeDeliveryThreshold: Math.max(0, Number(v.freeDeliveryThreshold) || 0), zones, paymentMethods: pays };
  }
  const out = {};
  ['name', 'tagline', 'phone', 'email', 'whatsapp', 'location'].forEach((k) => { if (typeof v[k] === 'string') out[k] = v[k].trim().slice(0, 200); });
  if (out.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.email)) bad('That email address does not look right');
  out.social = {};
  ['instagram', 'x', 'tiktok', 'youtube', 'facebook'].forEach((k) => {
    const u = String((v.social || {})[k] || '').trim();
    if (u && !/^https?:\/\//i.test(u)) bad(`The ${k} link must start with https://`);
    out.social[k] = u.slice(0, 300);
  });
  return out;
}
router.put('/settings/:section', async (req, res) => {
  const s = req.params.section;
  if (!SECTIONS.includes(s)) return res.status(404).json({ error: 'Unknown settings section' });
  try {
    const value = cleanSettings(s, req.body);
    await pool.query(`INSERT INTO site_settings (key, value, updated_at) VALUES ($1,$2,now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [s, JSON.stringify(value)]);
    if (s === 'store') clearStoreCache();
    res.json({ ok: true, value });
  } catch (e) {
    if (e.status) return res.status(e.status).json({ error: e.message });
    console.error('[admin] settings:', e.message); res.status(500).json({ error: 'Could not save settings' });
  }
});

// ── Optional AI writing helper (only when ANTHROPIC_API_KEY is set in backend/.env) ──
router.get('/assist/status', (req, res) => res.json({ ai: !!process.env.ANTHROPIC_API_KEY }));

const SYSTEM = `You write product listings for Will's Tech Store, an online electronics shop in Uganda.
Rules:
- Use ONLY facts found in the information you are given. Never invent specifications, numbers, certifications, warranty terms, box contents or compatibility. If something is not stated, leave it out.
- Plain, friendly English a shopper can scan quickly. Benefits first, then detail. No hype words, no emojis, no ALL CAPS, no exclamation marks.
- "description": 2 to 4 short paragraphs separated by a blank line (about 900 characters at most).
- "shortDescription": ONE sentence, 160 characters at most.
- "features": 4 to 7 key features, 80 characters each at most, taken from the facts.
- "specifications": an object of label -> value, only for facts that are stated (e.g. "Storage": "128GB").
Respond with JSON only, in exactly this shape:
{"description":"","shortDescription":"","features":[],"specifications":{}}`;

router.post('/assist/describe', rateLimit({ windowMs: 60 * 1000, max: 12, message: 'Slow down a little, then try again.' }), async (req, res) => {
  if (!process.env.ANTHROPIC_API_KEY) return res.status(400).json({ error: 'The AI helper is not switched on. Add ANTHROPIC_API_KEY to backend/.env. The built-in writing guide works without it.' });
  try {
    const b = req.body || {};
    const facts = [
      `Product name: ${String(b.name || '').slice(0, 200)}`, b.brand ? `Brand: ${String(b.brand).slice(0, 60)}` : '', b.category ? `Category: ${String(b.category).slice(0, 60)}` : '',
      b.description ? `Current description / supplier text:\n${String(b.description).slice(0, 4000)}` : '',
      Array.isArray(b.features) && b.features.length ? `Current key features:\n- ${b.features.slice(0, 20).map((x) => String(x).slice(0, 160)).join('\n- ')}` : '',
      b.specifications && typeof b.specifications === 'object' ? `Current specifications:\n${Object.entries(b.specifications).slice(0, 40).map(([k, v]) => `${String(k).slice(0, 60)}: ${String(v).slice(0, 120)}`).join('\n')}` : '',
      b.notes ? `Extra notes from the shop owner:\n${String(b.notes).slice(0, 800)}` : '',
    ].filter(Boolean).join('\n\n');
    const r = await fetch(process.env.ANTHROPIC_API_URL || 'https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5', max_tokens: 1500, system: SYSTEM, messages: [{ role: 'user', content: `Write the listing for this product.\n\n${facts}` }] }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: 'The AI service said: ' + ((data.error && data.error.message) || r.status) });
    const text = (data.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
    const m = /\{[\s\S]*\}/.exec(text);
    if (!m) return res.status(502).json({ error: 'The AI answer could not be read. Please try again.' });
    const j = JSON.parse(m[0]);
    res.json({
      description: String(j.description || '').trim().slice(0, 4000), shortDescription: String(j.shortDescription || '').trim().slice(0, 240),
      features: (Array.isArray(j.features) ? j.features : []).map((x) => String(x).trim().slice(0, 120)).filter(Boolean).slice(0, 10),
      specifications: j.specifications && typeof j.specifications === 'object' ? Object.fromEntries(Object.entries(j.specifications).slice(0, 30).map(([k, v]) => [String(k).slice(0, 60), String(v).slice(0, 120)])) : {},
    });
  } catch (e) { console.error('[admin] assist:', e.message); res.status(502).json({ error: 'Could not reach the AI service: ' + e.message }); }
});

module.exports = router;
