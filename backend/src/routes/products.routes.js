const express = require('express');
const { pool } = require('../db');
const { optionalAuth } = require('../middleware/auth');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

function toClientProduct(row) {
  return {
    id: Number(row.id),
    name: row.name,
    sku: row.sku,
    category: row.category,
    description: row.description,
    price: Number(row.price),
    originalPrice: row.original_price !== null ? Number(row.original_price) : null,
    images: row.images || [],
    videos: row.videos || [],
    stock: row.stock,
    rating: row.rating !== null ? Number(row.rating) : 0,
    reviewCount: row.review_count || 0,
    badges: row.badges || [],
    features: row.features || [],
    specifications: row.specifications || {},
    featured: row.featured,
    status: row.status,
    dateAdded: row.date_added,
    dateUpdated: row.date_updated,
  };
}

// GET /api/products — public list. Admins (with a valid admin token) can
// pass ?all=1 to include hidden/inactive products for the admin panel.
router.get('/', optionalAuth, async (req, res) => {
  try {
    const isAdmin = req.user && req.user.role === 'admin';
    const showAll = isAdmin && req.query.all === '1';

    const clauses = [];
    const params = [];

    if (!showAll) {
      clauses.push(`status = 'active'`);
    }
    if (req.query.category) {
      params.push(req.query.category);
      clauses.push(`category = $${params.length}`);
    }
    if (req.query.featured === '1') {
      clauses.push('featured = true');
    }

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const { rows } = await pool.query(
      `SELECT * FROM products ${where} ORDER BY date_added DESC`,
      params
    );
    res.json({ products: rows.map(toClientProduct) });
  } catch (err) {
    console.error('[products] list error:', err.message);
    res.status(500).json({ error: 'Could not load products' });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'Product not found' });
    res.json({ product: toClientProduct(rows[0]) });
  } catch (err) {
    res.status(500).json({ error: 'Could not load product' });
  }
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const p = req.body || {};
    const id = p.id || Date.now();
    const { rows } = await pool.query(
      `INSERT INTO products
        (id, name, sku, category, description, price, original_price, images, videos,
         stock, rating, review_count, badges, features, specifications, featured, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       RETURNING *`,
      [
        id, p.name, p.sku || null, p.category || null, p.description || null,
        p.price || 0, p.originalPrice || null,
        JSON.stringify(p.images || []), JSON.stringify(p.videos || []),
        p.stock || 'in-stock', p.rating || 0, p.reviewCount || 0,
        JSON.stringify(p.badges || []), JSON.stringify(p.features || []),
        JSON.stringify(p.specifications || {}), !!p.featured, p.status || 'active',
      ]
    );
    res.status(201).json({ product: toClientProduct(rows[0]) });
  } catch (err) {
    console.error('[products] create error:', err.message);
    res.status(500).json({ error: 'Could not create product' });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const p = req.body || {};
    const { rows } = await pool.query(
      `UPDATE products SET
        name = $1, sku = $2, category = $3, description = $4, price = $5,
        original_price = $6, images = $7, videos = $8, stock = $9, rating = $10,
        review_count = $11, badges = $12, features = $13, specifications = $14,
        featured = $15, status = $16, date_updated = now()
       WHERE id = $17
       RETURNING *`,
      [
        p.name, p.sku || null, p.category || null, p.description || null, p.price || 0,
        p.originalPrice || null, JSON.stringify(p.images || []), JSON.stringify(p.videos || []),
        p.stock || 'in-stock', p.rating || 0, p.reviewCount || 0,
        JSON.stringify(p.badges || []), JSON.stringify(p.features || []),
        JSON.stringify(p.specifications || {}), !!p.featured, p.status || 'active',
        req.params.id,
      ]
    );
    if (!rows.length) return res.status(404).json({ error: 'Product not found' });
    res.json({ product: toClientProduct(rows[0]) });
  } catch (err) {
    console.error('[products] update error:', err.message);
    res.status(500).json({ error: 'Could not update product' });
  }
});

// Convenience endpoint used by the admin "hide/show" toggle.
router.patch('/:id/status', requireAdmin, async (req, res) => {
  try {
    const { status } = req.body || {};
    const { rows } = await pool.query(
      'UPDATE products SET status = $1, date_updated = now() WHERE id = $2 RETURNING *',
      [status, req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Product not found' });
    res.json({ product: toClientProduct(rows[0]) });
  } catch (err) {
    res.status(500).json({ error: 'Could not update product status' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Product not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete product' });
  }
});

module.exports = router;
