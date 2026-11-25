const express = require('express');
const { pool } = require('../db');
const { optionalAuth, requireAdmin } = require('../middleware/auth');
const { nextSku } = require('../lib/sku');
const { normalizeVideos } = require('../lib/video');
const { deriveStock } = require('../lib/stock');

const router = express.Router();

function toClientProduct(row, admin) {
  const p = {
    id: Number(row.id), name: row.name, sku: row.sku, brand: row.brand || '', category: row.category,
    description: row.description, shortDescription: row.short_description || '',
    price: Number(row.price), originalPrice: row.original_price !== null ? Number(row.original_price) : null,
    images: row.images || [], videos: row.videos || [], stock: row.stock, leadTime: row.lead_time || '',
    rating: row.rating !== null ? Number(row.rating) : 0, reviewCount: row.review_count || 0,
    badges: row.badges || [], features: row.features || [], specifications: row.specifications || {},
    featured: row.featured, status: row.status, dateAdded: row.date_added, dateUpdated: row.date_updated,
  };
  if (admin) { p.stockQty = row.stock_qty === null || row.stock_qty === undefined ? null : Number(row.stock_qty); p.legacySku = row.legacy_sku || ''; }
  return p;
}

// Validates and tidies what the admin form sends. Throws an Error with .status 400 for anything the admin can fix.
function clean(body) {
  const b = body || {};
  const bad = (m) => { const e = new Error(m); e.status = 400; throw e; };
  const name = String(b.name || '').replace(/\s+/g, ' ').trim();
  if (name.length < 3) bad('Please give the product a name (at least 3 characters).');
  if (name.length > 200) bad('The product name is too long (200 characters max).');
  const price = Number(b.price);
  if (!Number.isFinite(price) || price <= 0) bad('Enter a price greater than zero.');
  let originalPrice = b.originalPrice === '' || b.originalPrice == null ? null : Number(b.originalPrice);
  if (originalPrice !== null && (!Number.isFinite(originalPrice) || originalPrice <= price)) originalPrice = null;   // an "old price" must be higher
  const strList = (v, max, len) => (Array.isArray(v) ? v : []).map((x) => String(x == null ? '' : x).replace(/\s+/g, ' ').trim().slice(0, len)).filter(Boolean).slice(0, max);
  const specs = {};
  if (b.specifications && typeof b.specifications === 'object' && !Array.isArray(b.specifications)) {
    Object.entries(b.specifications).slice(0, 60).forEach(([k, v]) => { const key = String(k).trim().slice(0, 60), val = String(v == null ? '' : v).trim().slice(0, 200); if (key && val) specs[key] = val; });
  }
  let videos; try { videos = normalizeVideos(b.videos); } catch (e) { bad(e.message); }
  let stockQty = b.stockQty === '' || b.stockQty == null ? null : Math.max(0, Math.floor(Number(b.stockQty)));
  if (Number.isNaN(stockQty)) stockQty = null;
  const stockVal = ['in-stock', 'limited', 'out-of-stock', 'pre-order'].includes(b.stock) ? b.stock : 'in-stock';
  return {
    name, price, originalPrice,
    sku: String(b.sku || '').trim().toUpperCase().replace(/[^A-Z0-9._-]/g, '').slice(0, 40),
    brand: String(b.brand || '').trim().slice(0, 60) || null,
    category: String(b.category || '').trim().toLowerCase().slice(0, 60) || null,
    description: String(b.description || '').replace(/\r\n/g, '\n').trim().slice(0, 8000) || null,
    shortDescription: String(b.shortDescription || '').replace(/\s+/g, ' ').trim().slice(0, 240) || null,
    images: strList(b.images, 12, 600), videos,
    stock: deriveStock(stockQty, stockVal), stockQty,
    leadTime: String(b.leadTime || '').trim().slice(0, 120) || null,
    badges: strList(b.badges, 6, 30).map((x) => x.toLowerCase().replace(/[^a-z-]/g, '')).filter(Boolean),
    features: strList(b.features, 20, 160), specifications: specs,
    featured: !!b.featured, status: b.status === 'inactive' ? 'inactive' : 'active',
  };
}

// GET /api/products — public list. Admins can pass ?all=1 to include hidden products.
router.get('/', optionalAuth, async (req, res) => {
  try {
    const isAdmin = req.user && req.user.role === 'admin';
    const showAll = isAdmin && req.query.all === '1';
    const clauses = []; const params = [];
    if (!showAll) clauses.push(`status = 'active'`);
    if (req.query.category) { params.push(req.query.category); clauses.push(`category = $${params.length}`); }
    if (req.query.featured === '1') clauses.push('featured = true');
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await pool.query(`SELECT * FROM products ${where} ORDER BY date_added DESC`, params);
    // 'no-cache' = the browser may keep a copy but must ask the server first (a cheap 304 when nothing changed).
    // Before, returning visitors could be handed a copy up to 5 minutes old without being asked to check.
    res.set('Cache-Control', isAdmin ? 'no-store' : 'no-cache');
    // Catalogue version: changes whenever any product is added, edited, hidden or removed. The storefront stores it with its
    // saved copy, so a returning visitor's old copy is recognised as out of date and replaced.
    const stamp = rows.reduce((m, r) => Math.max(m, new Date(r.date_updated || r.date_added || 0).getTime() || 0), 0);
    const reviews = rows.reduce((n, r) => n + (Number(r.review_count) || 0), 0);   // new reviews change ratings without touching date_updated
    const version = `${stamp.toString(36)}-${rows.length}-${reviews}`;
    res.set('X-Catalog-Version', version);
    res.json({ version, products: rows.map((r) => toClientProduct(r, showAll)) });
  } catch (err) { console.error('[products] list error:', err.message); res.status(500).json({ error: 'Could not load products' }); }
});

router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products WHERE id::text = $1', [req.params.id]);
    const isAdmin = req.user && req.user.role === 'admin';
    if (!rows.length || (rows[0].status !== 'active' && !isAdmin)) return res.status(404).json({ error: 'Product not found' });
    res.json({ product: toClientProduct(rows[0], isAdmin) });
  } catch (err) { res.status(500).json({ error: 'Could not load product' }); }
});

async function skuTaken(sku, exceptId) {
  const { rows } = await pool.query('SELECT 1 FROM products WHERE sku = $1 AND ($2::text IS NULL OR id::text <> $2) LIMIT 1', [sku, exceptId ? String(exceptId) : null]);
  return rows.length > 0;
}

const COLS = `name, sku, brand, category, description, short_description, price, original_price, images, videos,
  stock, stock_qty, lead_time, badges, features, specifications, featured, status`;
const vals = (p, sku) => [p.name, sku, p.brand, p.category, p.description, p.shortDescription, p.price, p.originalPrice, JSON.stringify(p.images), JSON.stringify(p.videos),
  p.stock, p.stockQty, p.leadTime, JSON.stringify(p.badges), JSON.stringify(p.features), JSON.stringify(p.specifications), p.featured, p.status];

router.post('/', requireAdmin, async (req, res) => {
  try {
    const p = clean(req.body);
    if (p.sku && await skuTaken(p.sku)) return res.status(409).json({ error: `The SKU ${p.sku} is already used by another product. Leave it blank to generate one.` });
    const sku = p.sku || await nextSku(pool, p.category);
    const { rows } = await pool.query(`INSERT INTO products (id, ${COLS}) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) RETURNING *`,
      [Number(req.body.id) || Date.now(), ...vals(p, sku)]);
    res.status(201).json({ product: toClientProduct(rows[0], true) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[products] create error:', err.message); res.status(500).json({ error: 'Could not create product' });
  }
});

// Ratings are NOT editable here: they are calculated from real customer reviews.
router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const p = clean(req.body);
    if (p.sku && await skuTaken(p.sku, req.params.id)) return res.status(409).json({ error: `The SKU ${p.sku} is already used by another product.` });
    const cur = await pool.query('SELECT sku FROM products WHERE id::text = $1', [req.params.id]);
    if (!cur.rows.length) return res.status(404).json({ error: 'Product not found' });
    const sku = p.sku || cur.rows[0].sku || await nextSku(pool, p.category);
    const { rows } = await pool.query(
      `UPDATE products SET name=$1, sku=$2, brand=$3, category=$4, description=$5, short_description=$6, price=$7, original_price=$8,
         images=$9, videos=$10, stock=$11, stock_qty=$12, lead_time=$13, badges=$14, features=$15, specifications=$16,
         featured=$17, status=$18, date_updated=now() WHERE id::text = $19 RETURNING *`, [...vals(p, sku), req.params.id]);
    res.json({ product: toClientProduct(rows[0], true) });
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    console.error('[products] update error:', err.message); res.status(500).json({ error: 'Could not update product' });
  }
});

// Copy a product (starts hidden, with a fresh SKU).
router.post('/:id/duplicate', requireAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products WHERE id::text = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Product not found' });
    const o = rows[0]; const sku = await nextSku(pool, o.category);
    const ins = await pool.query(
      `INSERT INTO products (id, name, sku, brand, category, description, short_description, price, original_price, images, videos, stock, stock_qty, lead_time, badges, features, specifications, featured, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,false,'inactive') RETURNING *`,
      [Date.now(), `${o.name} (copy)`.slice(0, 200), sku, o.brand, o.category, o.description, o.short_description, o.price, o.original_price,
        JSON.stringify(o.images || []), JSON.stringify(o.videos || []), o.stock, o.stock_qty, o.lead_time, JSON.stringify(o.badges || []), JSON.stringify(o.features || []), JSON.stringify(o.specifications || {})]);
    res.status(201).json({ product: toClientProduct(ins.rows[0], true) });
  } catch (err) { console.error('[products] duplicate error:', err.message); res.status(500).json({ error: 'Could not duplicate product' }); }
});

router.patch('/:id/status', requireAdmin, async (req, res) => {
  try {
    const status = req.body && req.body.status === 'inactive' ? 'inactive' : 'active';
    const { rows } = await pool.query('UPDATE products SET status = $1, date_updated = now() WHERE id::text = $2 RETURNING *', [status, req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Product not found' });
    res.json({ product: toClientProduct(rows[0], true) });
  } catch (err) { res.status(500).json({ error: 'Could not update product status' }); }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM products WHERE id::text = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Product not found' });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: 'Could not delete product' }); }
});

module.exports = router;
