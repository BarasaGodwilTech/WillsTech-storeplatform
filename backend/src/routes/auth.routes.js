const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { signToken } = require('../utils/jwt');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function publicUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    photoUrl: row.photo_url || null,
  };
}

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, phone } = req.body || {};
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'name, email and password are required' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const existing = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (name, email, phone, password_hash, role)
       VALUES ($1, $2, $3, $4, 'customer') RETURNING *`,
      [name, email.toLowerCase(), phone || null, hash]
    );

    const user = rows[0];
    const token = signToken({ id: user.id, role: user.role, email: user.email });
    res.status(201).json({ token, user: publicUser(user) });
  } catch (err) {
    if (err && err.code === '23505') return res.status(409).json({ error: 'An account with this email already exists' });
    console.error('[auth] register error:', err.message);
    res.status(500).json({ error: 'Could not create account' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'Invalid email or password' });

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid email or password' });

    const token = signToken({ id: user.id, role: user.role, email: user.email });
    res.json({ token, user: publicUser(user) });
  } catch (err) {
    console.error('[auth] login error:', err.message);
    res.status(500).json({ error: 'Could not log in' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ user: publicUser(rows[0]) });
  } catch (err) {
    res.status(500).json({ error: 'Could not load account' });
  }
});

// PUT /api/auth/me — update the logged-in user's own profile (name/phone).
router.put('/me', requireAuth, async (req, res) => {
  try {
    const { name, phone } = req.body || {};
    if (name !== undefined && (!name || String(name).trim().length < 2)) {
      return res.status(400).json({ error: 'Name must be at least 2 characters' });
    }
    const { rows } = await pool.query(
      `UPDATE users SET
         name = COALESCE($1, name),
         phone = COALESCE($2, phone),
         updated_at = now()
       WHERE id = $3 RETURNING *`,
      [name ? String(name).trim() : null, phone !== undefined ? phone : null, req.user.id]
    );
    if (!rows.length) return res.status(404).json({ error: 'User not found' });
    res.json({ user: publicUser(rows[0]) });
  } catch (err) {
    console.error('[auth] update profile error:', err.message);
    res.status(500).json({ error: 'Could not update profile' });
  }
});

// PUT /api/auth/me/password — change the logged-in user's own password.
router.put('/me/password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    if (!rows.length) return res.status(404).json({ error: 'User not found' });

    const ok = await bcrypt.compare(currentPassword, rows[0].password_hash);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [hash, req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[auth] change password error:', err.message);
    res.status(500).json({ error: 'Could not update password' });
  }
});

// DELETE /api/auth/me — permanently delete the logged-in user's account.
// Addresses, payment methods and wishlist items cascade-delete via their
// foreign keys; past orders are kept for business records but their
// user_id is cleared (ON DELETE SET NULL) so they're no longer linked to
// a person.
router.delete('/me', requireAuth, async (req, res) => {
  try {
    await pool.query('DELETE FROM users WHERE id = $1', [req.user.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('[auth] delete account error:', err.message);
    res.status(500).json({ error: 'Could not delete account' });
  }
});

// POST /api/auth/forgot-password — request a reset link.
// Always returns a generic success message, whether or not the email is
// registered, so this endpoint can't be used to check which emails have
// accounts. The token is a random value; only its SHA-256 hash is stored,
// so a leaked database doesn't expose usable tokens.
//
// NOTE: no email-sending provider is wired up yet, so the link can't
// actually reach the customer's inbox in production. Plug in a provider
// (Resend, SendGrid, Mailgun, etc.) in the block marked below when you're
// ready — until then this only helps in development, where the link is
// returned directly in the response so you can test the flow.
function isLocalDevRequest(req) {
  if (process.env.NODE_ENV !== 'development') return false;
  const addr = req.socket && req.socket.remoteAddress || '';
  const loopback = addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
  const proxied = !!(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || req.headers['forwarded'] || req.headers['x-forwarded-host']);
  const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(req.headers.host || '');
  return loopback && !proxied && localHost;
}

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) return res.status(400).json({ error: 'email is required' });

    const { rows } = await pool.query('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
    const genericResponse = { ok: true, message: 'If an account exists for that email, a reset link has been sent.' };

    if (!rows.length) return res.json(genericResponse);

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await pool.query(
      'UPDATE users SET reset_token_hash = $1, reset_token_expires = $2 WHERE id = $3',
      [tokenHash, expires, rows[0].id]
    );

    const resetLink = `${req.protocol}://${req.get('host')}/reset-password?token=${token}`;

    // ── Plug in a real email provider here ────────────────────────────
    // Example with a provider's SDK:
    //   await emailProvider.send({ to: email, subject: 'Reset your password', ... resetLink ... });
    console.log(`[auth] Password reset requested for ${email}. Link: ${resetLink}`);

    // SECURITY: the reset link is the only thing protecting the account, so it must never
    // be returned to a remote caller. It is only echoed back when the server is explicitly in
    // development mode AND the request really comes from this machine (not via a proxy / public host).
    if (isLocalDevRequest(req)) {
      return res.json({ ...genericResponse, devResetLink: resetLink });
    }
    res.json(genericResponse);
  } catch (err) {
    console.error('[auth] forgot-password error:', err.message);
    res.status(500).json({ error: 'Could not process request' });
  }
});

// POST /api/auth/reset-password — complete a reset using the token from
// the emailed (or, in development, returned) link.
router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body || {};
    if (!token || !newPassword) {
      return res.status(400).json({ error: 'token and newPassword are required' });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const { rows } = await pool.query(
      'SELECT id FROM users WHERE reset_token_hash = $1 AND reset_token_expires > now()',
      [tokenHash]
    );
    if (!rows.length) {
      return res.status(400).json({ error: 'This reset link is invalid or has expired' });
    }

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query(
      'UPDATE users SET password_hash = $1, reset_token_hash = NULL, reset_token_expires = NULL, updated_at = now() WHERE id = $2',
      [hash, rows[0].id]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error('[auth] reset-password error:', err.message);
    res.status(500).json({ error: 'Could not reset password' });
  }
});

module.exports = router;
