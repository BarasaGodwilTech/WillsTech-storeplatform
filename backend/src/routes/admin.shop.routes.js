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

// ── Analytics for the dashboard (one round trip) ────────
router.get('/analytics', async (req, res) => {
  try {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 30, 7), 180);
    const daily = await pool.query(
      `SELECT to_char(d::date,'YYYY-MM-DD') AS day,
              COALESCE(SUM(o.total) FILTER (WHERE o.status <> 'cancelled'),0)::float AS revenue,
              COUNT(o.id)::int AS orders
         FROM generate_series(date_trunc('day', now()) - ($1::int - 1) * interval '1 day', date_trunc('day', now()), interval '1 day') d
         LEFT JOIN orders o ON date_trunc('day', o.created_at) = d
        GROUP BY d ORDER BY d`, [days]);
    const cur = await pool.query(
      `SELECT COALESCE(SUM(total) FILTER (WHERE status <> 'cancelled' AND created_at >= now() - ($1::int * interval '1 day')),0)::float AS rev,
              COUNT(*) FILTER (WHERE created_at >= now() - ($1::int * interval '1 day'))::int AS ord,
              COALESCE(SUM(total) FILTER (WHERE status <> 'cancelled' AND created_at < now() - ($1::int * interval '1 day') AND created_at >= now() - (2 * $1::int * interval '1 day')),0)::float AS prev_rev,
              COUNT(*) FILTER (WHERE created_at < now() - ($1::int * interval '1 day') AND created_at >= now() - (2 * $1::int * interval '1 day'))::int AS prev_ord
         FROM orders`, [days]);
    const status = await pool.query(`SELECT status, COUNT(*)::int AS n FROM orders WHERE created_at >= now() - ($1::int * interval '1 day') GROUP BY status`, [days]);
    const prod = await pool.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE stock = 'limited')::int AS low,
              COUNT(*) FILTER (WHERE stock = 'out-of-stock')::int AS out,
              COUNT(*) FILTER (WHERE status <> 'active')::int AS hidden FROM products`);
    const lowList = await pool.query(`SELECT id::text AS id, name, stock FROM products WHERE stock IN ('limited','out-of-stock') ORDER BY stock DESC, name LIMIT 6`);
    const top = await pool.query(
      `SELECT COALESCE(i->>'name','Item') AS name, SUM(COALESCE((i->>'quantity')::int,(i->>'qty')::int,1))::int AS units
         FROM orders o, jsonb_array_elements(COALESCE(o.items,'[]'::jsonb)) i
        WHERE o.status <> 'cancelled' AND o.created_at >= now() - ($1::int * interval '1 day')
        GROUP BY 1 ORDER BY units DESC LIMIT 5`, [days]);
    const msgs = await pool.query(`SELECT COUNT(*)::int AS n FROM contact_messages WHERE status = 'new'`);
    const exp = await pool.query(`SELECT code, expires_at, used_count, max_uses FROM coupons WHERE active AND expires_at IS NOT NULL AND expires_at > now() AND expires_at < now() + interval '7 days' ORDER BY expires_at LIMIT 3`);
    const dl = await pool.query(`SELECT COUNT(*) FILTER (WHERE status IN ('confirmed','shipped') AND delivery_date IS NULL)::int AS unscheduled, COUNT(*) FILTER (WHERE status IN ('confirmed','shipped') AND delivery_date = CURRENT_DATE)::int AS today, COUNT(*) FILTER (WHERE status IN ('confirmed','shipped') AND delivery_date < CURRENT_DATE)::int AS overdue, COUNT(*) FILTER (WHERE status = 'completed' AND payment_status = 'unpaid')::int AS unpaid FROM orders`);
    res.json({ days, delivery: dl.rows[0], daily: daily.rows, totals: cur.rows[0], status: status.rows, products: prod.rows[0], lowStock: lowList.rows, topProducts: top.rows, newMessages: msgs.rows[0].n, expiringCoupons: exp.rows });
  } catch (e) { console.error('[admin] analytics:', e.message); res.status(500).json({ error: 'Could not load analytics' }); }
});

// ── Customers (built from orders, grouped by phone) ─────
router.get('/customers', async (req, res) => {
  try {
    const { rows } = await pool.query(
      `SELECT MAX(customer_name) AS name, MAX(customer_email) AS email, customer_phone AS phone,
              COUNT(*)::int AS orders, COALESCE(SUM(total) FILTER (WHERE status <> 'cancelled'),0)::float AS spent,
              MAX(created_at) AS last_order
         FROM orders WHERE customer_phone IS NOT NULL AND customer_phone <> ''
        GROUP BY customer_phone ORDER BY spent DESC LIMIT 500`);
    res.json({ customers: rows });
  } catch (e) { res.status(500).json({ error: 'Could not load customers' }); }
});

// ── Order timeline ──────────────────────────────────────
router.get('/orders/:id/events', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT status, note, created_at FROM order_events WHERE order_id::text = $1 ORDER BY created_at', [req.params.id]);
    res.json({ events: rows });
  } catch (e) { res.status(500).json({ error: 'Could not load timeline' }); }
});

// ── Bulk product actions ────────────────────────────────
router.post('/products/bulk', async (req, res) => {
  try {
    const { ids, action } = req.body || {};
    if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'No products selected' });
    const list = ids.map((i) => String(i));
    if (action === 'delete') await pool.query('DELETE FROM products WHERE id::text = ANY($1)', [list]);
    else if (action === 'hide' || action === 'show') await pool.query('UPDATE products SET status = $1, date_updated = now() WHERE id::text = ANY($2)', [action === 'hide' ? 'inactive' : 'active', list]);
    else if (action === 'feature' || action === 'unfeature') await pool.query('UPDATE products SET featured = $1, date_updated = now() WHERE id::text = ANY($2)', [action === 'feature', list]);
    else if (action === 'category') {
      const cat = String((req.body && req.body.value) || '').trim().toLowerCase().slice(0, 60);
      if (!cat) return res.status(400).json({ error: 'Type the category name' });
      await pool.query('UPDATE products SET category = $1, date_updated = now() WHERE id::text = ANY($2)', [cat, list]);
    }
    else if (['in-stock', 'limited', 'out-of-stock', 'pre-order'].includes(action)) await pool.query('UPDATE products SET stock = $1, date_updated = now() WHERE id::text = ANY($2)', [action, list]);
    else return res.status(400).json({ error: 'Unknown action' });
    res.json({ ok: true, count: list.length });
  } catch (e) { console.error('[admin] bulk:', e.message); res.status(500).json({ error: 'Bulk action failed' }); }
});

module.exports = router;
