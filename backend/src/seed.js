// seed.js — one-time import of the existing data/site-config.json into
// Postgres, plus creation of the first admin account. Safe to re-run:
// products/settings are upserted, and the admin user is only created if
// no user with that email exists yet.
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool } = require('./db');
const { run: migrate } = require('./migrate');

const PRODUCT_IMG_DIR = path.join(__dirname, '..', '..', 'public', 'images', 'products');
// Product photos were stored as absolute GitHub URLs. If the same file exists in
// public/images/products, use the local copy: faster, and works without GitHub.
function localImage(url) {
  const m = /\/public\/images\/products\/([^/?#]+)$/.exec(String(url || ''));
  if (m && fs.existsSync(path.join(PRODUCT_IMG_DIR, m[1]))) return '/public/images/products/' + m[1];
  return url;
}

const CONFIG_PATH = path.join(__dirname, '..', '..', 'data', 'site-config.json');

async function seedProductsAndSettings() {
  if (!fs.existsSync(CONFIG_PATH)) {
    console.log('[seed] No data/site-config.json found — skipping product/content import.');
    return;
  }

  const { rows: existing } = await pool.query('SELECT COUNT(*)::int AS n FROM products');
  if (existing[0].n > 0 && !process.argv.includes('--force')) {
    console.log(`[seed] Database already has ${existing[0].n} product(s): leaving your catalogue untouched (use --force to re-import).`);
    return;
  }
  const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  const products = Array.isArray(raw.products) ? raw.products : [];

  console.log(`[seed] Importing ${products.length} product(s)...`);
  for (const p of products) {
    await pool.query(
      `INSERT INTO products
        (id, name, sku, category, description, price, original_price, images, videos,
         stock, rating, review_count, badges, features, specifications, featured, status,
         date_added, date_updated)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
               COALESCE($18, now()), COALESCE($19, now()))
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, category = EXCLUDED.category,
         description = EXCLUDED.description, price = EXCLUDED.price,
         original_price = EXCLUDED.original_price, images = EXCLUDED.images,
         videos = EXCLUDED.videos, stock = EXCLUDED.stock, badges = EXCLUDED.badges,
         features = EXCLUDED.features, specifications = EXCLUDED.specifications,
         featured = EXCLUDED.featured, status = EXCLUDED.status,
         date_updated = now()`,
      [
        p.id, p.name, null, p.category || null, p.description || null,
        p.price || 0, p.originalPrice || null,
        JSON.stringify((p.images || []).map(localImage)), JSON.stringify(p.videos || []),
        p.stock || 'in-stock', 0, 0,   // ratings come only from real customer reviews
        JSON.stringify(p.badges || []), JSON.stringify(p.features || []),
        JSON.stringify(p.specifications || {}), !!p.featured, p.status || 'active',
        p.dateAdded || null, p.dateUpdated || null,
      ]
    );
  }

  const { backfillSkus } = require('./lib/sku');
  await backfillSkus(pool);

  console.log('[seed] ✅ Products imported.');
}

async function seedCoupons() {
  await pool.query(
    `INSERT INTO coupons (code, type, value, min_subtotal, description)
     VALUES ('WELCOME5', 'percent', 5, 50000, '5% off your first order')
     ON CONFLICT (code) DO NOTHING`);
  console.log('[seed] Starter coupon ready: WELCOME5 (5% off orders over UGX 50,000).');
}

async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || 'Store Admin';

  if (!email || !password) {
    console.log('[seed] ADMIN_EMAIL / ADMIN_PASSWORD not set in .env — skipping admin creation.');
    return;
  }

  const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (rows.length) {
    console.log(`[seed] Admin account already exists for ${email} — leaving it as is.`);
    return;
  }

  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, 'admin')`,
    [name, email, hash]
  );
  console.log(`[seed] ✅ Admin account created: ${email}`);
  console.log('       Log in at /admin-login.html with this email + the password from your .env.');
  console.log('       Change ADMIN_PASSWORD (and re-run) or update it from the admin panel later.');
}

async function main() {
  try {
    await migrate();   // tables must exist before importing
    await seedProductsAndSettings();
    await seedCoupons();
    await seedAdmin();
  } catch (err) {
    console.error('[seed] ❌ Seeding failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

main();
