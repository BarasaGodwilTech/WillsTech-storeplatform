const express = require('express');
const { pool } = require('../db');
const { optionalAuth, requireAuth, requireAdmin } = require('../middleware/auth');
const { rateLimit } = require('../middleware/rateLimit');
const { getShopConfig, deliveryFor, evaluateCoupon } = require('../shopConfig');
const { adjustStock } = require('../lib/stock');

const router = express.Router();

const PAYMENT_IDS = ['momo', 'airtel', 'cod', 'bank'];
const PAY_STATUSES = ['unpaid', 'paid', 'refunded'];
const STATUSES = ['pending', 'confirmed', 'shipped', 'completed', 'cancelled'];

function toClientOrder(row, admin) {
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
    deliveryDate: dateOnly(row.delivery_date),
    deliveryWindow: row.delivery_window,
    deliveryNote: row.delivery_note,
    riderName: row.rider_name,
    riderPhone: row.rider_phone,
    deliveryFeePending: !!row.delivery_fee_pending,
    paymentStatus: row.payment_status || 'unpaid',
    paidAt: row.paid_at,
    ...(admin ? { paymentRef: row.payment_ref, internalNote: row.internal_note } : {}),   // staff-only
  };
}

// DATE columns are plain 'YYYY-MM-DD' strings (see db.js).
function dateOnly(d) { return d ? String(d).slice(0, 10) : null; }

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
    paymentStatus: row.payment_status || 'unpaid',
    createdAt: row.created_at,
    deliveryDate: dateOnly(row.delivery_date),
    deliveryWindow: row.delivery_window,
    deliveryNote: row.delivery_note,
    riderName: row.rider_name,
    riderPhone: row.rider_phone,
    deliveryFeePending: !!row.delivery_fee_pending,
  };
}

const digits = (v) => String(v || '').replace(/\D/g, '');
const clean = (v, max) => (v === undefined || v === null ? null : String(v).trim().slice(0, max) || null);

async function addEvent(client, orderId, status, note) {
  await client.query('INSERT INTO order_events (order_id, status, note) VALUES ($1,$2,$3)', [orderId, status, note || null]);
}

// Map pins are only kept if they fall inside Uganda's rough bounding box.
function cleanPin(a) {
  const lat = Number(a && a.lat), lng = Number(a && a.lng);
  return a && a.lat !== '' && a.lat != null && Number.isFinite(lat) && Number.isFinite(lng) && lat > -1.6 && lat < 4.4 && lng > 29.4 && lng < 35.1
    ? { lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6 } : null;
}

// POST /api/orders — create an order (guests and signed-in customers).
// Prices, delivery fees, discounts and stock are ALWAYS checked here; nothing the browser sends is trusted.
router.post('/', optionalAuth, async (req, res) => {
  let client = null;
  let began = false;
  const fail = async (code, message) => { if (began && client) { try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ } began = false; } return res.status(code).json({ error: message }); };
  try {
    const cfg = await getShopConfig();   // read BEFORE taking the transaction's connection (never hold one while waiting for another)
    client = await pool.connect();
    const b = req.body || {};
    const { items, shippingAddress, notes, couponCode, deliveryZone } = b;
    if (!Array.isArray(items) || items.length === 0) return fail(400, 'Your cart is empty');
    if (items.length > 50) return fail(400, 'Too many items in one order');

    const customerName = clean(b.customerName, 120);
    const customerPhone = clean(b.customerPhone, 40);
    const customerEmail = clean(b.customerEmail, 160);
    if (!customerName) return fail(400, 'Please enter your name');
    if (!customerPhone || digits(customerPhone).length < 9) return fail(400, 'Please enter a phone number we can reach you on');
    if (customerEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail)) return fail(400, 'That email address does not look right');
    const paymentMethod = PAYMENT_IDS.includes(b.paymentMethod) ? b.paymentMethod : 'cod';

    const ids = [...new Set(items.map((i) => Number(i.productId ?? i.id)).filter(Number.isFinite))];
    if (!ids.length) return fail(400, 'Order items are invalid');

    await client.query('BEGIN'); began = true;
    // Lock the products while stock is checked and reduced, so two people cannot buy the last unit at once.
    const { rows: prodRows } = await client.query(
      `SELECT id, name, sku, price, images, stock, stock_qty FROM products WHERE id = ANY($1::bigint[]) AND status = 'active' FOR UPDATE`, [ids]);
    const byId = new Map(prodRows.map((p) => [Number(p.id), p]));

    const wanted = new Map();   // merge duplicate lines
    for (const i of items) {
      const id = Number(i.productId ?? i.id); const qty = Math.floor(Number(i.quantity || 1));
      if (!(qty >= 1 && qty <= 99)) return fail(400, 'One or more items are unavailable. Please review your cart.');
      wanted.set(id, (wanted.get(id) || 0) + qty);
    }
    const verifiedItems = [];
    for (const [id, qty] of wanted) {
      const p = byId.get(id);
      if (!p) return fail(400, 'One or more items are unavailable. Please review your cart.');
      if (p.stock === 'out-of-stock') return fail(400, `${p.name} is out of stock`);
      if (p.stock_qty !== null && p.stock !== 'pre-order' && qty > p.stock_qty) return fail(400, p.stock_qty > 0 ? `Only ${p.stock_qty} of ${p.name} left. Please lower the quantity.` : `${p.name} is out of stock`);
      verifiedItems.push({ productId: Number(p.id), name: p.name, sku: p.sku || null, price: Number(p.price), quantity: qty, image: (p.images && p.images[0]) || null });
    }
    const subtotal = verifiedItems.reduce((sum, i) => sum + i.price * i.quantity, 0);

    const delivery = deliveryFor(cfg, String(deliveryZone || ''), subtotal);
    if (!delivery) return fail(400, 'Please choose where we should deliver');

    let discount = 0; let appliedCode = null;
    if (couponCode) {
      try {
        const c = await evaluateCoupon(client, couponCode, subtotal);
        discount = c.discount; appliedCode = c.code;
        await client.query('UPDATE coupons SET used_count = used_count + 1 WHERE code = $1', [c.code]);
      } catch (e) { return fail(400, e.message); }
    }
    const total = Math.max(0, subtotal - discount + delivery.fee);
    const { rows: seq } = await client.query(`SELECT nextval('order_number_seq') AS n`);
    const orderNumber = `WT-${new Date().getFullYear()}-${String(seq[0].n).padStart(5, '0')}`;

    const address = shippingAddress && typeof shippingAddress === 'object' ? shippingAddress : {};
    const pin = cleanPin(address);
    const safeAddress = { street: clean(address.street, 300), city: clean(address.city, 100) || delivery.zone.name, landmark: clean(address.landmark, 200), ...(pin || {}) };

    await adjustStock(client, verifiedItems, -1);
    const { rows } = await client.query(
      `INSERT INTO orders
        (user_id, customer_name, customer_email, customer_phone, items, subtotal, total,
         shipping_address, payment_method, notes, order_number, delivery_zone, delivery_fee, discount, coupon_code, delivery_fee_pending)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING *`,
      [req.user && req.user.role !== 'admin' ? req.user.id : null, customerName, customerEmail, customerPhone,
        JSON.stringify(verifiedItems), subtotal, total, JSON.stringify(safeAddress), paymentMethod,
        clean(notes, 1000), orderNumber, delivery.zone.name, delivery.fee, discount, appliedCode, delivery.quote]);
    await addEvent(client, rows[0].id, 'pending', 'Order placed');
    await client.query('COMMIT'); began = false;
    res.status(201).json({ order: toClientOrder(rows[0]), deliveryQuote: delivery.quote });
  } catch (err) {
    if (began && client) { try { await client.query('ROLLBACK'); } catch (e) { /* ignore */ } }
    console.error('[orders] create error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'We could not place your order just now. Please try again in a moment.' });
  } finally { if (client) client.release(); }
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
    res.json({ orders: rows.map((r) => toClientOrder(r)) });
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
    res.json({ orders: rows.map((r) => toClientOrder(r, true)) });
  } catch (err) { res.status(500).json({ error: 'Could not load orders' }); }
});

router.get('/:id', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM orders WHERE id::text = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Order not found' });
    res.json({ order: toClientOrder(rows[0], true) });
  } catch (err) { res.status(500).json({ error: 'Could not load that order' }); }
});

router.patch('/:id/status', requireAdmin, async (req, res) => {
  let client = null;
  try {
    client = await pool.connect();
    const { status, note, markPaid } = req.body || {};
    if (!STATUSES.includes(status)) return res.status(400).json({ error: `status must be one of: ${STATUSES.join(', ')}` });
    await client.query('BEGIN');
    const { rows: cur } = await client.query('SELECT * FROM orders WHERE id::text = $1 FOR UPDATE', [req.params.id]);
    if (!cur.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Order not found' }); }
    const before = cur[0];
    // Cancelling puts the stock back; reopening a cancelled order takes it out again.
    if (status === 'cancelled' && before.status !== 'cancelled') await adjustStock(client, before.items, +1);
    if (before.status === 'cancelled' && status !== 'cancelled') await adjustStock(client, before.items, -1);
    const pay = !!markPaid && before.payment_status !== 'paid';
    const { rows } = await client.query(
      `UPDATE orders SET status = $1, updated_at = now(),
              payment_status = CASE WHEN $3::boolean THEN 'paid' ELSE payment_status END,
              paid_at = CASE WHEN $3::boolean THEN now() ELSE paid_at END
        WHERE id = $2 RETURNING *`, [status, before.id, pay]);
    await addEvent(client, before.id, status, clean(note, 300));
    if (pay) await addEvent(client, before.id, 'update', 'Payment received. Thank you!');
    await client.query('COMMIT');
    res.json({ order: toClientOrder(rows[0], true) });
  } catch (err) {
    try { if (client) await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
    console.error('[orders] status error:', err.message);
    res.status(500).json({ error: 'Could not update order status' });
  } finally { if (client) client.release(); }
});

// PATCH /api/orders/:id/delivery — schedule delivery: date, time window, rider, fee, message shown to the customer.
router.patch('/:id/delivery', requireAdmin, async (req, res) => {
  let client = null;
  try {
    client = await pool.connect();
    const b = req.body || {};
    const date = b.date ? String(b.date).slice(0, 10) : null;
    if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Please pick a valid delivery date' });
    const fee = b.fee === '' || b.fee == null ? null : Math.round(Number(b.fee));
    if (fee !== null && (!Number.isFinite(fee) || fee < 0 || fee > 5000000)) return res.status(400).json({ error: 'Enter a valid delivery fee' });
    await client.query('BEGIN');
    const { rows: cur } = await client.query('SELECT * FROM orders WHERE id::text = $1 FOR UPDATE', [req.params.id]);
    if (!cur.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Order not found' }); }
    const o = cur[0];
    const addr = { ...(o.shipping_address || {}) };
    if (b.address && typeof b.address === 'object') {
      if (b.address.street !== undefined) addr.street = clean(b.address.street, 300);
      if (b.address.landmark !== undefined) addr.landmark = clean(b.address.landmark, 200);
    }
    const newFee = fee === null ? Number(o.delivery_fee) : fee;
    const total = Math.max(0, Number(o.subtotal) - Number(o.discount) + newFee);
    const { rows } = await client.query(
      `UPDATE orders SET delivery_date = $1, delivery_window = $2, delivery_note = $3, rider_name = $4, rider_phone = $5,
              delivery_fee = $6, total = $7, delivery_fee_pending = CASE WHEN $8::boolean THEN false ELSE delivery_fee_pending END,
              shipping_address = $9, updated_at = now() WHERE id = $10 RETURNING *`,
      [date, clean(b.window, 80), clean(b.note, 600), clean(b.riderName, 80), clean(b.riderPhone, 40), newFee, total, fee !== null, JSON.stringify(addr), o.id]);
    const when = date ? new Date(date + 'T12:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }) : null;
    await addEvent(client, o.id, 'update', when ? `Delivery planned for ${when}${clean(b.window, 80) ? ' (' + clean(b.window, 80) + ')' : ''}` : 'Delivery details updated');
    await client.query('COMMIT');
    res.json({ order: toClientOrder(rows[0], true) });
  } catch (err) {
    try { if (client) await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
    console.error('[orders] delivery error:', err.message);
    res.status(500).json({ error: 'Could not save delivery details' });
  } finally { if (client) client.release(); }
});

// PATCH /api/orders/:id/payment — record that money came in (or was refunded), with a reference such as a MoMo transaction ID.
router.patch('/:id/payment', requireAdmin, async (req, res) => {
  try {
    const b = req.body || {};
    if (!PAY_STATUSES.includes(b.status)) return res.status(400).json({ error: 'status must be unpaid, paid or refunded' });
    const { rows } = await pool.query(
      `UPDATE orders SET payment_status = $1, payment_ref = $2, paid_at = CASE WHEN $1 = 'paid' THEN COALESCE(paid_at, now()) ELSE NULL END, updated_at = now()
        WHERE id::text = $3 RETURNING *`, [b.status, clean(b.ref, 80), req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Order not found' });
    res.json({ order: toClientOrder(rows[0], true) });
  } catch (err) { res.status(500).json({ error: 'Could not update payment' }); }
});

// PATCH /api/orders/:id/note — staff-only note, never shown to the customer.
router.patch('/:id/note', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('UPDATE orders SET internal_note = $1 WHERE id::text = $2 RETURNING *', [clean(req.body && req.body.note, 2000), req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Order not found' });
    res.json({ order: toClientOrder(rows[0], true) });
  } catch (err) { res.status(500).json({ error: 'Could not save note' }); }
});

// PATCH /api/orders/:id/cancel — a customer cancelling their own *pending* order.
router.patch('/:id/cancel', requireAuth, async (req, res) => {
  let client = null;
  try {
    client = await pool.connect();
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM orders WHERE id::text = $1 FOR UPDATE', [req.params.id]);   // lock: a double click must not restock twice
    if (!rows.length) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Order not found' }); }
    if (rows[0].user_id !== req.user.id) { await client.query('ROLLBACK'); return res.status(403).json({ error: 'This is not your order' }); }
    if (rows[0].status !== 'pending') { await client.query('ROLLBACK'); return res.status(400).json({ error: 'Only orders we have not confirmed yet can be cancelled here. Please contact us for help with this one.' }); }
    await adjustStock(client, rows[0].items, +1);
    const { rows: updated } = await client.query("UPDATE orders SET status = 'cancelled', updated_at = now() WHERE id = $1 RETURNING *", [rows[0].id]);
    await addEvent(client, rows[0].id, 'cancelled', 'Cancelled by customer');
    await client.query('COMMIT');
    res.json({ order: toClientOrder(updated[0]) });
  } catch (err) {
    try { if (client) await client.query('ROLLBACK'); } catch (e) { /* ignore */ }
    console.error('[orders] cancel error:', err.message);
    res.status(500).json({ error: 'Could not cancel order' });
  } finally { if (client) client.release(); }
});

module.exports = router;
