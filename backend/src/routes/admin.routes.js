const express = require('express');
const bcrypt = require('bcryptjs');
const { pool } = require('../db');
const { signToken } = require('../utils/jwt');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const { rows } = await pool.query(
      `SELECT * FROM users WHERE email = $1 AND role = 'admin'`,
      [email.toLowerCase()]
    );
    const admin = rows[0];
    if (!admin) return res.status(401).json({ error: 'Invalid admin credentials' });

    const ok = await bcrypt.compare(password, admin.password_hash);
    if (!ok) return res.status(401).json({ error: 'Invalid admin credentials' });

    const token = signToken({ id: admin.id, role: admin.role, email: admin.email });
    res.json({ token, user: { id: admin.id, name: admin.name, email: admin.email, role: admin.role } });
  } catch (err) {
    console.error('[admin] login error:', err.message);
    res.status(500).json({ error: 'Could not log in' });
  }
});

router.get('/me', requireAdmin, async (req, res) => {
  const { rows } = await pool.query('SELECT id, name, email, role FROM users WHERE id = $1', [req.user.id]);
  if (!rows.length) return res.status(404).json({ error: 'Admin not found' });
  res.json({ user: rows[0] });
});

// Change the logged-in admin's own password.
router.post('/change-password', requireAdmin, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    }
    if (String(newPassword).length < 6) {
      return res.status(400).json({ error: 'New password must be at least 6 characters' });
    }

    const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [req.user.id]);
    const admin = rows[0];
    const ok = await bcrypt.compare(currentPassword, admin.password_hash);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect' });

    const hash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [hash, admin.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('[admin] change-password error:', err.message);
    res.status(500).json({ error: 'Could not change password' });
  }
});

module.exports = router;
