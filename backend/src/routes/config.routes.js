const express = require('express');
const { pool } = require('../db');
const { requireAdmin, optionalAuth } = require('../middleware/auth');

const router = express.Router();

const ALLOWED_KEYS = ['hero', 'content', 'social', 'shipping'];

// GET /api/config — full site config in the same shape the frontend used to
// read from data/site-config.json: { hero, content, social, products }.
// Kept as one call so products.js / admin.js only need one fetch.
// Pass ?all=1 with an admin token to include hidden/inactive products too
// (used by the admin panel's product list).
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM site_settings');
    const settings = {};
    for (const row of rows) settings[row.key] = row.value;

    const isAdmin = req.user && req.user.role === 'admin';
    const showAll = isAdmin && req.query.all === '1';
    const productWhere = showAll ? '' : `WHERE status = 'active'`;

    const { rows: productRows } = await pool.query(
      `SELECT * FROM products ${productWhere} ORDER BY date_added DESC`
    );

    res.json({
      hero: settings.hero || {},
      content: settings.content || {},
      social: settings.social || {},
      products: productRows.map((row) => ({
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
      })),
    });
  } catch (err) {
    console.error('[config] get error:', err.message);
    res.status(500).json({ error: 'Could not load site configuration' });
  }
});

// PUT /api/config/:section — admin updates one section (hero/content/social).
router.put('/:section', requireAdmin, async (req, res) => {
  const { section } = req.params;
  if (!ALLOWED_KEYS.includes(section)) {
    return res.status(400).json({ error: `section must be one of: ${ALLOWED_KEYS.join(', ')}` });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO site_settings (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
       RETURNING key, value`,
      [section, JSON.stringify(req.body || {})]
    );
    res.json({ [section]: rows[0].value });
  } catch (err) {
    console.error('[config] update error:', err.message);
    res.status(500).json({ error: 'Could not save section' });
  }
});

module.exports = router;
