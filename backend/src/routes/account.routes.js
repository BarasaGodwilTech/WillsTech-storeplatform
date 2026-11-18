// account.routes.js — customer account data: addresses, wishlist, payment
// methods (metadata only), notification/privacy preferences, login history
// and account stats. Everything here is scoped to req.user.id from the JWT
// — a customer can only ever read or write their own data, no matter what
// id is passed in the request body.
const express = require('express');
const { pool } = require('../db');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();
router.use(requireAuth);

// ── WISHLIST ────────────────────────────────────────────────────────────
router.get('/wishlist', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT product_id FROM wishlist_items WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ wishlist: rows.map((r) => Number(r.product_id)) });
  } catch (err) {
    res.status(500).json({ error: 'Could not load wishlist' });
  }
});

// Atomic toggle (kept for older clients): DELETE first; if nothing was deleted, INSERT. No check-then-write race.
router.post('/wishlist/toggle', async (req, res) => {
  try {
    const productId = Number(req.body && req.body.productId);
    if (!productId) return res.status(400).json({ error: 'productId is required' });
    const del = await pool.query('DELETE FROM wishlist_items WHERE user_id = $1 AND product_id = $2', [req.user.id, productId]);
    if (del.rowCount) return res.json({ isIn: false });
    const ins = await pool.query(
      `INSERT INTO wishlist_items (user_id, product_id) SELECT $1, id FROM products WHERE id = $2 ON CONFLICT DO NOTHING`, [req.user.id, productId]);
    if (!ins.rowCount) return res.status(404).json({ error: 'That product is no longer available' });
    res.json({ isIn: true });
  } catch (err) {
    console.error('[account] wishlist toggle error:', err.message);
    res.status(500).json({ error: 'Could not update wishlist' });
  }
});

// Idempotent add / remove: the client says what it WANTS, so double-clicks and retries can't flip the state.
router.put('/wishlist/:productId', async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    if (!productId) return res.status(400).json({ error: 'Invalid product' });
    await pool.query(
      `INSERT INTO wishlist_items (user_id, product_id) SELECT $1, id FROM products WHERE id = $2 ON CONFLICT DO NOTHING`, [req.user.id, productId]);
    const { rows } = await pool.query('SELECT 1 FROM wishlist_items WHERE user_id = $1 AND product_id = $2', [req.user.id, productId]);
    if (!rows.length) return res.status(404).json({ error: 'That product is no longer available' });
    res.json({ isIn: true });
  } catch (err) { res.status(500).json({ error: 'Could not update wishlist' }); }
});
router.delete('/wishlist/:productId', async (req, res) => {
  try {
    const productId = Number(req.params.productId);
    if (!productId) return res.status(400).json({ error: 'Invalid product' });
    await pool.query('DELETE FROM wishlist_items WHERE user_id = $1 AND product_id = $2', [req.user.id, productId]);
    res.json({ isIn: false });
  } catch (err) { res.status(500).json({ error: 'Could not update wishlist' }); }
});

// Merge items a visitor saved while signed out into their account (called once after sign-in).
router.post('/wishlist/merge', async (req, res) => {
  try {
    const ids = [...new Set((Array.isArray(req.body && req.body.productIds) ? req.body.productIds : []).map(Number).filter((n) => Number.isFinite(n) && n > 0))].slice(0, 100);
    if (ids.length) {
      await pool.query(
        `INSERT INTO wishlist_items (user_id, product_id) SELECT $1, id FROM products WHERE id = ANY($2::bigint[]) ON CONFLICT DO NOTHING`, [req.user.id, ids]);
    }
    const { rows } = await pool.query('SELECT product_id FROM wishlist_items WHERE user_id = $1 ORDER BY created_at DESC', [req.user.id]);
    res.json({ wishlist: rows.map((r) => Number(r.product_id)) });
  } catch (err) {
    console.error('[account] wishlist merge error:', err.message);
    res.status(500).json({ error: 'Could not update wishlist' });
  }
});

// ── ADDRESSES ───────────────────────────────────────────────────────────
function toClientAddress(row) {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    street: row.street,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    country: row.country,
    type: row.type,
    isDefault: row.is_default,
    createdAt: row.created_at,
  };
}

router.get('/addresses', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM addresses WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ addresses: rows.map(toClientAddress) });
  } catch (err) {
    res.status(500).json({ error: 'Could not load addresses' });
  }
});

router.post('/addresses', async (req, res) => {
  try {
    const { name, phone, street, city, state, postalCode, country, type, isDefault } = req.body || {};
    if (!name || !phone || !street || !city) {
      return res.status(400).json({ error: 'name, phone, street and city are required' });
    }
    const addrType = type === 'billing' ? 'billing' : 'shipping';

    const { rows: existing } = await pool.query(
      'SELECT id FROM addresses WHERE user_id = $1 AND type = $2',
      [req.user.id, addrType]
    );
    const makeDefault = existing.length === 0 ? true : !!isDefault;

    if (makeDefault) {
      await pool.query('UPDATE addresses SET is_default = false WHERE user_id = $1 AND type = $2', [req.user.id, addrType]);
    }

    const { rows } = await pool.query(
      `INSERT INTO addresses (user_id, name, phone, street, city, state, postal_code, country, type, is_default)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *`,
      [req.user.id, name, phone, street, city, state || null, postalCode || null, country || 'Uganda', addrType, makeDefault]
    );
    res.status(201).json({ address: toClientAddress(rows[0]) });
  } catch (err) {
    console.error('[account] add address error:', err.message);
    res.status(500).json({ error: 'Could not save address' });
  }
});

router.delete('/addresses/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM addresses WHERE id = $1 AND user_id = $2 RETURNING *',
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Address not found' });

    if (rows[0].is_default) {
      const { rows: remaining } = await pool.query(
        'SELECT id FROM addresses WHERE user_id = $1 AND type = $2 ORDER BY created_at ASC LIMIT 1',
        [req.user.id, rows[0].type]
      );
      if (remaining.length) {
        await pool.query('UPDATE addresses SET is_default = true WHERE id = $1', [remaining[0].id]);
      }
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete address' });
  }
});

router.patch('/addresses/:id/default', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM addresses WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'Address not found' });

    await pool.query('UPDATE addresses SET is_default = false WHERE user_id = $1 AND type = $2', [req.user.id, rows[0].type]);
    await pool.query('UPDATE addresses SET is_default = true WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not update default address' });
  }
});

// ── PAYMENT METHODS (metadata only — never a full card number) ─────────
function toClientPaymentMethod(row) {
  return {
    id: row.id,
    type: row.type,
    last4: row.last4,
    expiry: row.expiry,
    phoneNumber: row.phone_number,
    bankName: row.bank_name,
    accountNumber: row.account_number,
    isDefault: row.is_default,
    createdAt: row.created_at,
  };
}

router.get('/payment-methods', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT * FROM payment_methods WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ paymentMethods: rows.map(toClientPaymentMethod) });
  } catch (err) {
    res.status(500).json({ error: 'Could not load payment methods' });
  }
});

router.post('/payment-methods', async (req, res) => {
  try {
    const { type, cardNumber, expiry, phoneNumber, bankName, accountNumber, isDefault } = req.body || {};
    const allowed = ['card', 'momo', 'airtel', 'bank'];
    if (!allowed.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${allowed.join(', ')}` });
    }

    // Only ever keep the last 4 digits of a card number — the full number
    // is never written to the database.
    const last4 = type === 'card' && cardNumber ? String(cardNumber).replace(/\s+/g, '').slice(-4) : null;

    const { rows: existing } = await pool.query('SELECT id FROM payment_methods WHERE user_id = $1', [req.user.id]);
    const makeDefault = existing.length === 0 ? true : !!isDefault;

    if (makeDefault) {
      await pool.query('UPDATE payment_methods SET is_default = false WHERE user_id = $1', [req.user.id]);
    }

    const { rows } = await pool.query(
      `INSERT INTO payment_methods (user_id, type, last4, expiry, phone_number, bank_name, account_number, is_default)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [req.user.id, type, last4, expiry || null, phoneNumber || null, bankName || null, accountNumber || null, makeDefault]
    );
    res.status(201).json({ paymentMethod: toClientPaymentMethod(rows[0]) });
  } catch (err) {
    console.error('[account] add payment method error:', err.message);
    res.status(500).json({ error: 'Could not save payment method' });
  }
});

router.delete('/payment-methods/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM payment_methods WHERE id = $1 AND user_id = $2 RETURNING *',
      [req.params.id, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'Payment method not found' });

    if (rows[0].is_default) {
      const { rows: remaining } = await pool.query(
        'SELECT id FROM payment_methods WHERE user_id = $1 ORDER BY created_at ASC LIMIT 1',
        [req.user.id]
      );
      if (remaining.length) {
        await pool.query('UPDATE payment_methods SET is_default = true WHERE id = $1', [remaining[0].id]);
      }
    }
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not delete payment method' });
  }
});

// ── NOTIFICATION / PRIVACY PREFERENCES ──────────────────────────────────
function defaultPreferences() {
  return {
    notifications: {
      orderConfirmations: true,
      shippingUpdates: true,
      priceDrops: true,
      newArrivals: false,
      promotions: false,
      newsletter: true,
    },
    privacy: {
      profileVisibility: 'private',
      orderHistoryVisibility: 'private',
      searchHistory: true,
    },
  };
}

router.get('/preferences', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT preferences FROM users WHERE id = $1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    const prefs = rows[0].preferences && Object.keys(rows[0].preferences).length ? rows[0].preferences : defaultPreferences();
    res.json({ preferences: prefs });
  } catch (err) {
    res.status(500).json({ error: 'Could not load preferences' });
  }
});

router.put('/preferences', async (req, res) => {
  try {
    const preferences = req.body || {};
    await pool.query('UPDATE users SET preferences = $1, updated_at = now() WHERE id = $2', [
      JSON.stringify(preferences),
      req.user.id,
    ]);
    res.json({ ok: true, preferences });
  } catch (err) {
    res.status(500).json({ error: 'Could not save preferences' });
  }
});

// ── LOGIN HISTORY ────────────────────────────────────────────────────────
router.get('/login-history', async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT login_history FROM users WHERE id = $1', [req.user.id]);
    res.json({ history: rows.length ? rows[0].login_history || [] : [] });
  } catch (err) {
    res.status(500).json({ error: 'Could not load login history' });
  }
});

router.post('/login-history', async (req, res) => {
  try {
    const entry = {
      timestamp: new Date().toISOString(),
      userAgent: (req.body && req.body.userAgent) || req.headers['user-agent'] || 'Unknown',
      page: (req.body && req.body.page) || null,
    };

    // Read-modify-write, capped at the most recent 10 entries.
    const { rows } = await pool.query('SELECT login_history FROM users WHERE id = $1', [req.user.id]);
    const history = [entry, ...((rows[0] && rows[0].login_history) || [])].slice(0, 10);
    await pool.query('UPDATE users SET login_history = $1 WHERE id = $2', [JSON.stringify(history), req.user.id]);

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Could not record login' });
  }
});

// ── ACCOUNT STATS ────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  try {
    const userId = req.user.id;
    const [userRow, ordersRes, wishlistRes, addressesRes, paymentRes] = await Promise.all([
      pool.query('SELECT name, phone, photo_url, created_at FROM users WHERE id = $1', [userId]),
      pool.query('SELECT total FROM orders WHERE user_id = $1', [userId]),
      pool.query('SELECT 1 FROM wishlist_items WHERE user_id = $1', [userId]),
      pool.query('SELECT 1 FROM addresses WHERE user_id = $1', [userId]),
      pool.query('SELECT 1 FROM payment_methods WHERE user_id = $1', [userId]),
    ]);

    const user = userRow.rows[0] || {};
    const orders = ordersRes.rows;
    const totalSpent = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const orderCount = orders.length;

    let tier;
    if (orderCount >= 20) tier = { name: 'Platinum', icon: 'fa-gem', color: '#e5e4e2' };
    else if (orderCount >= 10) tier = { name: 'Gold', icon: 'fa-trophy', color: '#ffd700' };
    else if (orderCount >= 5) tier = { name: 'Silver', icon: 'fa-medal', color: '#c0c0c0' };
    else tier = { name: 'Bronze', icon: 'fa-award', color: '#cd7f32' };

    let completion = 0;
    if (user.name) completion += 20;
    if (user.phone) completion += 20;
    if (user.photo_url) completion += 20;
    if (addressesRes.rows.length > 0) completion += 20;
    if (paymentRes.rows.length > 0) completion += 20;

    res.json({
      totalOrders: orderCount,
      totalSpent,
      wishlistItems: wishlistRes.rows.length,
      savedAddresses: addressesRes.rows.length,
      savedPaymentMethods: paymentRes.rows.length,
      memberSince: user.created_at,
      tier,
      completion,
    });
  } catch (err) {
    console.error('[account] stats error:', err.message);
    res.status(500).json({ error: 'Could not load account stats' });
  }
});

// ── DATA EXPORT ──────────────────────────────────────────────────────────
router.get('/export', async (req, res) => {
  try {
    const userId = req.user.id;
    const [userRes, ordersRes, wishlistRes, addressesRes, paymentRes] = await Promise.all([
      pool.query('SELECT id, name, email, phone, preferences, created_at FROM users WHERE id = $1', [userId]),
      pool.query('SELECT * FROM orders WHERE user_id = $1 ORDER BY created_at DESC', [userId]),
      pool.query('SELECT product_id FROM wishlist_items WHERE user_id = $1', [userId]),
      pool.query('SELECT * FROM addresses WHERE user_id = $1', [userId]),
      pool.query('SELECT * FROM payment_methods WHERE user_id = $1', [userId]),
    ]);

    res.json({
      profile: userRes.rows[0] || null,
      orders: ordersRes.rows,
      wishlist: wishlistRes.rows.map((r) => Number(r.product_id)),
      addresses: addressesRes.rows.map(toClientAddress),
      paymentMethods: paymentRes.rows.map(toClientPaymentMethod),
      preferences: (userRes.rows[0] && userRes.rows[0].preferences) || defaultPreferences(),
    });
  } catch (err) {
    res.status(500).json({ error: 'Could not export account data' });
  }
});

module.exports = router;
