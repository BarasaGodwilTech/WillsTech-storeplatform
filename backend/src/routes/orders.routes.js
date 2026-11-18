const express = require('express');
const { pool } = require('../db');
const { optionalAuth, requireAuth, requireAdmin } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { getShopConfig, deliveryFor, evaluateCoupon } = require('../shopConfig');

const router = express.Router();

const PAYMENT_IDS = ['whatsapp', 'momo', 'airtel', 'cod', 'bank'];
const STATUSES = ['pending', 'confirmed', 'shipped', 'completed', 'cancelled'];

function toClientOrder(row) {
  return {
    id: row.id,
    orderNumber: row.order_number,
    userId: row.user_id,
    customerName: row.customer_name,
    customerEmail: row.customer_email,
    customerPhone: row.customer_phone,
    items: row.items || [],
    subtotal: Number(row.subtotal),
    deliveryFee: Number(row.delivery_fee || 0),
    discount: Number(row.discount || 0),
    couponCode: row.coupon_code,
    total: Number(row.total),
    status: row.status,
    deliveryZone: row.delivery_zone,
    shippingAddress: row.shipping_address || {},
    paymentMethod: row.payment_method,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// What a guest is allowed to see when tracking: no address, email or phone.
function toPublicOrder(row) {
  return {
    orderNumber: row.order_number,
    items: row.items || [],
    subtotal: Number(row.subtotal),
    deliveryFee: Number(row.delivery_fee || 0),
    discount: Number(row.discount || 0),
    total: Number(row.total),
    status: row.status,
    deliveryZone: row.delivery_zone,
    paymentMethod: row.payment_method,
    createdAt: row.created_at,
  };
}

const digits = (v) => String(v || '').replace(/\D/g, '');
const clean = (v, max) => (v === undefined || v === null ? null : String(v).trim().slice(0, max) || null);

async function addEvent(client, orderId, status, note) {
  await client.query('INSERT INTO order_events (order_id, status, note) VALUES ($1,$2,$3)', [orderId, status, note || null]);
}

// POST /api/orders — create an order (guests and signed-in customers).
// Prices, delivery fees and discounts are ALWAYS recalculated here; nothing the browser sends is trusted.
router.post('/', optionalAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const b = req.body || {};
    const { items, shippingAddress, notes, couponCode, deliveryZone } = b;

    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: 'Your cart is empty' });
    if (items.length > 50) return res.status(400).json({ error: 'Too many items in one order' });

    const customerName = clean(b.customerName, 120);
    const customerPhone = clean(b.customerPhone, 40);
    const customerEmail = clean(b.customerEmail, 160);
    if (!customerName) return res.status(400).json({ error: 'Please enter your name' });
    if (!customerPhone || digits(customerPhone).length < 9) return res.status(400).json({ error: 'Please enter a phone number we can reach you on' });
    if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) return res.status(400).json({ error: 'That email address does not look right' });

    const paymentMethod = PAYMENT_IDS.includes(b.paymentMethod) ? b.paymentMethod : 'whatsapp';

    const ids = [...new Set(items.map((i) => Number(i.productId ?? i.id)).filter(Number.isFinite))];
    if (!ids.length) return res.status(400).json({ error: 'Order items are invalid' });
    const { rows: prodRows } = await client.query(
      `SELECT id, name, price, images, stock FROM products WHERE id = ANY($1::bigint[]) AND status = 'active'`, [ids]);
    const byId = new Map(prodRows.map((p) => [Number(p.id), p]));

    const verifiedItems = [];
    for (const i of items) {
      const p = byId.get(Number(i.productId ?? i.id));
      const qty = Math.floor(Number(i.quantity || 1));
      if (!p || !(qty >= 1 && qty <= 99)) return res.status(400).json({ error: 'One or more items are unavailable. Please review your cart.' });
      if (p.stock === 'out-of-stock') return res.status(400).json({ error: `${p.name} is out of stock` });
      verifiedItems.push({ productId: Number(p.id), name: p.name, price: Number(p.price), quantity: qty, image: (p.images && p.images[0]) || null });
    }
    const subtotal = verifiedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

    const cfg = await getShopConfig();
    const zoneId = String(deliveryZone || '');
    const delivery = deliveryFor(cfg, zoneId, subtotal);
    if (!delivery) return res.status(400).json({ error: 'Please choose where we should deliver' });

    await client.query('BEGIN');
    let discount = 0; let appliedCode = null;
    if (couponCode) {
      try {
        const c = await evaluateCoupon(client, couponCode, subtotal);
        discount = c.discount; appliedCode = c.code;
        await client.query('UPDATE coupons SET used_count = used_count + 1 WHERE code = $1', [c.code]);
      } catch (e) { await client.query('ROLLBACK'); return res.status(400).json({ error: e.message }); }
    }
    const total = Math.max(0, subtotal - discount + delivery.fee);

    const { rows: seq } = await client.query(`SELECT nextval('order_number_seq') AS n`);
    const orderNumber = `WT-${new Date().getFullYear()}-${String(seq[0].n).padStart(5, '0')}`;

    const address = shippingAddress && typeof shippingAddress === 'object' ? shippingAddress : {};
    const safeAddress = { street: clean(address.street, 300), city: clean(address.city, 100) || delivery.zone.name, landmark: clean(address.landmark, 200) };

    const { rows } = await client.query(
      `INSERT INTO orders
        (user_id, customer_name, customer_email, customer_phone, items, subtotal, total,
         shipping_address, payment_method, notes, order_number, delivery_zone, delivery_fee, discount, coupon_code)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING *`,
      [req.user && req.user.role !== 'admin' ? req.user.id : null, customerName, customerEmail, customerPhone,
        JSON.stringify(verifiedItems), subtotal, total, JSON.stringify(safeAddress), paymentMethod,
        clean(notes, 1000), orderNumber, delivery.zone.name, delivery.fee, discount, appliedCode]);
    await addEvent(client, rows[0].id, 'pending', 'Order placed');
    await client.query('COMMIT');

    res.status(201).json({ order: toClientOrder(rows[0]), deliveryQuote: delivery.quote });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
    console.error('[orders] create error:', err.message);
    res.status(500).json({ error: 'We could not place your order. Please try again or message us on WhatsApp.' });
  } finally { client.release(); }
});

// GET /api/orders/track?number=WT-2026-00042&contact=0751924844  (phone or email used at checkout)
router.get('/track', rateLimit({ windowMs: 10 * 60 * 1000, max: 30, message: 'Too many lookups. Please wait a few minutes.' }), async (req, res) => {
  try {
    const number = String(req.query.number || '').trim().toUpperCase();
    const contact = String(req.query.contact || '').trim().toLowerCase();
    const notFound = () => res.status(404).json({ error: 'We could not find an order with those details. Check the order number and the phone or email you used.' });
    if (!number || !contact) return notFound();
    const { rows } = await pool.query('SELECT * FROM orders WHERE order_number = $1', [number]);
    const o = rows[0];
    if (!o) return notFound();
    const cd = digits(contact);
    const phoneOk = cd.length >= 9 && digits(o.customer_phone).endsWith(cd.slice(-9));
    const emailOk = contact.includes('@') && String(o.customer_email || '').toLowerCase() === contact;
    if (!phoneOk && !emailOk) return notFound();
    const { rows: events } = await pool.query('SELECT status, note, created_at FROM order_events WHERE order_id = $1 ORDER BY created_at ASC, id ASC', [o.id]);
    res.json({ order: toPublicOrder(o), events: events.map((e) => ({ status: e.status, note: e.note, at: e.created_at })) });
  } catch (err) {
    console.error('[orders] track error:', err.message);
    res.status(500).json({ error: 'Could not look up that order' });
  }
});

// GET /api/orders/mine — the signed-in customer's order history.
router.get('/mine', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
    res.json({ orders: rows.map(toClientOrder) });
  } catch (err) { res.status(500).json({ error: 'Could not load your orders' }); }
});

// GET /api/orders/mine/:id — one of my orders, with its timeline.
router.get('/mine/:id', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM orders WHERE id::text = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Order not found' });
    const { rows: events } = await pool.query('SELECT status, note, created_at FROM order_events WHERE order_id = $1 ORDER BY created_at ASC, id ASC', [rows[0].id]);
    res.json({ order: toClientOrder(rows[0]), events: events.map((e) => ({ status: e.status, note: e.note, at: e.created_at })) });
  } catch (err) { res.status(500).json({ error: 'Could not load that order' }); }
});

// GET /api/orders — admin: all orders (optionally ?status=).
router.get('/', requireAdmin, async (req, res) => {
  try {
    const params = []; let where = '';
    if (req.query.status) { params.push(req.query.status); where = 'WHERE status = $1'; }
    const { rows } = await pool.query(`SELECT * FROM orders ${where} ORDER BY created_at DESC`, params);
    res.json({ orders: rows.map(toClientOrder) });
  } catch (err) { res.status(500).json({ error: 'Could not load orders' }); }
});

router.get('/:id', requireAdmin, async (req, res) => {
  const { rows } = await pool.query('SELECT * FROM orders WHERE id::text = $1', [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: 'Order not found' });
  res.json({ order: toClientOrder(rows[0]) });
});

router.patch('/:id/status', requireAdmin, async (req, res) => {
  const client = await pool.connect();
  try {
    const { status, note } = req.body || {};
    if (!STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}` });
    await client.query('BEGIN');
    const { rows } = await client.query('UPDATE orders SET status = $1, updated_at = now() WHERE id::text = $2 RETURNING *', [status, req.params.id]);
    if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Order not found' }); }
    await addEvent(client, rows[0].id, status, clean(note, 300));
    await client.query('COMMIT');
    res.json({ order: toClientOrder(rows[0]) });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
    res.status(500).json({ error: 'Could not update order status' });
  } finally { client.release(); }
});

// PATCH /api/orders/:id/cancel — a customer cancelling their own *pending* order.
router.patch('/:id/cancel', requireAuth, async (req, res) => {
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT * FROM orders WHERE id::text = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Order not found' });
    if (rows[0].user_id !== req.user.id) return res.status(403).json({ error: 'This is not your order' });
    if (rows[0].status !== 'pending') return res.status(400).json({ error: 'Only pending orders can be cancelled. Message us on WhatsApp for help.' });
    await client.query('BEGIN');
    const { rows: updated } = await client.query("UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = $1 RETURNING *", [rows[0].id]);
    await addEvent(client, rows[0].id, 'cancelled', 'Cancelled by customer');
    await client.query('COMMIT');
    res.json({ order: toClientOrder(updated[0]) });
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
    console.error('[orders] cancel error:', err.message);
    res.status(500).json({ error: 'Could not cancel order' });
  } finally { client.release(); }
});

module.exports = router;
