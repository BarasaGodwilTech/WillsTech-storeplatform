// Admin-only endpoints for the shop: dashboard numbers, contact inbox, newsletter list, discount codes.
// Orders are managed through /api/orders (see orders.routes.js).
const express = require('express');
const { pool } = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();
router.use(requireAdmin);

router.get('/summary', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE status = 'pending')::int                                   AS pending,
        COUNT(*) FILTER (WHERE status IN ('confirmed','shipped'))::int                    AS in_progress,
        COUNT(*) FILTER (WHERE created_at >= date_trunc('day', now()))::int               AS today,
        COALESCE(SUM(total) FILTER (WHERE status = 'completed' AND created_at >= date_trunc('month', now())), 0)::float AS month_revenue
      FROM orders`);
    const m = await pool.query(`SELECT COUNT(*)::int AS n FROM contact_messages WHERE status = 'new'`);
    const s = await pool.query(`SELECT COUNT(*)::int AS n FROM newsletter_subscribers`);
    res.json({ ...rows[0], newMessages: m.rows[0].n, subscribers: s.rows[0].n });
  } catch (e) { res.status(500).json({ error: 'Could not load summary' }); }
});

// ── Contact messages ────────────────────────────────────
router.get('/messages', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM contact_messages ORDER BY created_at DESC LIMIT 300');
    res.json({ messages: rows });
  } catch (e) { res.status(500).json({ error: 'Could not load messages' }); }
});
router.patch('/messages/:id', async (req, res) => {
  const status = req.body && req.body.status;
  if (!['new', 'read', 'done'].includes(status)) return res.status(400).json({ error: 'status must be new, read or done' });
  try {
    const { rowCount } = await pool.query('UPDATE contact_messages SET status = $1 WHERE id::text = $2', [status, req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Message not found' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Could not update message' }); }
});

// ── Newsletter ──────────────────────────────────────────
router.get('/subscribers', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT email, source, created_at FROM newsletter_subscribers ORDER BY created_at DESC');
    if (req.query.format === 'csv') {
      res.type('text/csv').set('Content-Disposition', 'attachment; filename="subscribers.csv"');
      return res.send('email,source,subscribed_at\n' + rows.map((r) => `${r.email},${r.source || ''},${new Date(r.created_at).toISOString()}`).join('\n'));
    }
    res.json({ subscribers: rows });
  } catch (e) { res.status(500).json({ error: 'Could not load subscribers' }); }
});

// ── Discount codes ──────────────────────────────────────
router.get('/coupons', async (req, res) => {
  try { res.json({ coupons: (await pool.query('SELECT * FROM coupons ORDER BY created_at DESC')).rows }); }
  catch (e) { res.status(500).json({ error: 'Could not load coupons' }); }
});
router.post('/coupons', async (req, res) => {
  try {
    const b = req.body || {};
    const code = String(b.code || '').trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
    const value = Number(b.value);
    if (code.length < 3) return res.status(400).json({ error: 'Code must be at least 3 letters or numbers' });
    if (!['percent', 'fixed'].includes(b.type)) return res.status(400).json({ error: 'Type must be percent or fixed' });
    if (!(value > 0) || (b.type === 'percent' && value > 100)) return res.status(400).json({ error: 'Enter a valid discount value' });
    await pool.query(
      `INSERT INTO coupons (code, type, value, min_subtotal, max_uses, expires_at, description)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [code, b.type, value, Number(b.minSubtotal) || 0, b.maxUses ? Math.floor(Number(b.maxUses)) : null, b.expiresAt || null, String(b.description || '').slice(0, 160) || null]);
    res.status(201).json({ ok: true, code });
  } catch (e) {
    if (e.code === '23505') return res.status(409).json({ error: 'That code already exists' });
    res.status(500).json({ error: 'Could not create coupon' });
  }
});
router.patch('/coupons/:code', async (req, res) => {
  try {
    const { rowCount } = await pool.query('UPDATE coupons SET active = $1 WHERE code = $2', [!!(req.body && req.body.active), String(req.params.code).toUpperCase()]);
    if (!rowCount) return res.status(404).json({ error: 'Coupon not found' });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: 'Could not update coupon' }); }
});
router.delete('/coupons/:code', async (req, res) => {
  try { await pool.query('DELETE FROM coupons WHERE code = $1', [String(req.params.code).toUpperCase()]); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: 'Could not delete coupon' }); }
});

module.exports = router;
