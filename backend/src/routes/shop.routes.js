const express = require('express');
const { pool } = require('../db');
const { requireAuth, optionalAuth } = require('../middleware/auth');
const { getShopConfig, getDeliveryTemplates, evaluateCoupon } = require('../shopConfig');
const { recalcRating } = require('../lib/ratings');

const router = express.Router();
const clean = (v, max) => (v === undefined || v === null ? null : String(v).trim().slice(0, max) || null);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// GET /api/shop/config — delivery zones, fees, payment options (single source of truth for checkout).
router.get('/config', async (req, res) => {
  try { res.json(await getShopConfig()); } catch (e) { res.status(500).json({ error: 'Could not load shop settings' }); }
});

// POST /api/shop/coupons/validate { code, subtotal }
router.post('/coupons/validate', async (req, res) => {
  try {
    const subtotal = Number(req.body && req.body.subtotal) || 0;
    const result = await evaluateCoupon(pool, req.body && req.body.code, subtotal);
    res.json({ valid: true, ...result });
  } catch (e) { res.status(400).json({ valid: false, error: e.message }); }
});

router.post('/newsletter', async (req, res) => {
  try {
    const email = clean(req.body && req.body.email, 160);
    if (!email || !EMAIL_RE.test(email)) return res.status(400).json({ error: 'Please enter a valid email address' });
    await pool.query('INSERT INTO newsletter_subscribers (email, source) VALUES ($1,$2) ON CONFLICT (email) DO NOTHING', [email.toLowerCase(), clean(req.body.source, 40) || 'website']);
    res.status(201).json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Could not subscribe right now' }); }
});

router.post('/contact', async (req, res) => {
  try {
    const b = req.body || {};
    const name = clean(b.name, 120); const message = clean(b.message, 4000);
    const email = clean(b.email, 160);
    if (!name || !message) return res.status(400).json({ error: 'Please add your name and a message' });
    if (email && !EMAIL_RE.test(email)) return res.status(400).json({ error: 'That email address does not look right' });
    await pool.query('INSERT INTO contact_messages (name, email, phone, subject, message) VALUES ($1,$2,$3,$4,$5)',
      [name, email, clean(b.phone, 40), clean(b.subject, 160), message]);
    res.status(201).json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Could not send your message right now. Please try again in a moment, or call us.' }); }
});

// Reviews
// Latest good reviews for the home page (only real ones; the home section stays hidden when there are none).
router.get('/reviews/latest', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT r.author_name, r.rating, r.title, r.body, r.verified, r.product_id, p.name AS product_name
         FROM reviews r JOIN products p ON p.id = r.product_id
        WHERE r.rating >= 4 AND length(coalesce(r.body, '')) >= 12 AND p.status = 'active'
        ORDER BY r.created_at DESC LIMIT 6`);
    res.json({ reviews: rows.map((r) => ({ author: r.author_name, rating: r.rating, title: r.title, body: r.body, verified: r.verified, productId: r.product_id, productName: r.product_name })) });
  } catch (e) { res.status(500).json({ error: 'Could not load reviews' }); }
});

router.get('/reviews/:productId', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, author_name, rating, title, body, verified, created_at FROM reviews WHERE product_id = $1 ORDER BY created_at DESC LIMIT 100', [req.params.productId]);
    res.json({ reviews: rows.map((r) => ({ id: r.id, author: r.author_name, rating: r.rating, title: r.title, body: r.body, verified: r.verified, createdAt: r.created_at })) });
  } catch (e) { res.status(500).json({ error: 'Could not load reviews' }); }
});

router.post('/reviews/:productId', requireAuth, async (req, res) => {
  let client = null;
  try {
    client = await pool.connect();
    const productId = Number(req.params.productId);
    const rating = Math.floor(Number(req.body && req.body.rating));
    if (!Number.isFinite(productId) || !(rating >= 1 && rating <= 5)) return res.status(400).json({ error: 'Please choose a star rating' });
    const { rows: u } = await client.query('SELECT name FROM users WHERE id = $1', [req.user.id]);
    if (!u.length) return res.status(401).json({ error: 'Please sign in again' });
    const { rows: p } = await client.query('SELECT id FROM products WHERE id = $1', [productId]);
    if (!p.length) return res.status(404).json({ error: 'Product not found' });
    // "Verified" = this customer has a completed order containing the product.
    const { rows: bought } = await client.query(
      `SELECT 1 FROM orders WHERE user_id = $1 AND status = 'completed' AND items @> $2::jsonb LIMIT 1`,
      [req.user.id, JSON.stringify([{ productId }])]);
    await client.query('BEGIN');
    await client.query(
      `INSERT INTO reviews (product_id, user_id, author_name, rating, title, body, verified)
       VALUES ($1,$2,$3,$4,$5,$6,$7)
       ON CONFLICT (product_id, user_id) WHERE user_id IS NOT NULL
       DO UPDATE SET rating = EXCLUDED.rating, title = EXCLUDED.title, body = EXCLUDED.body, created_at = now()`,
      [productId, req.user.id, u[0].name, rating, clean(req.body.title, 120), clean(req.body.body, 2000), bought.length > 0]);
    await recalcRating(client, productId);
    await client.query('COMMIT');
    res.status(201).json({ ok: true });
  } catch (e) {
    try { if (client) await client.query('ROLLBACK'); } catch (x) { /* ignore */ }
    console.error('[reviews] error:', e.message);
    res.status(500).json({ error: 'Could not save your review' });
  } finally { if (client) client.release(); }
});

module.exports = router;
