/**
 * api-config.js — single place that knows where the backend API lives.
 * The Node backend serves this whole site itself (same origin), so a
 * relative path works both locally and on Railway. If you ever host the
 * frontend separately from the backend, change API_BASE to a full URL
 * like "https://your-app.up.railway.app/api".
 */
window.API_BASE = '/api';

/**
 * Small fetch wrapper used by products.js / cart.js / admin.js so they
 * don't each repeat token handling and error parsing.
 */
window.apiFetch = async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('willstech_token') || localStorage.getItem('willstech_admin_token');
  const headers = Object.assign(
    { 'Content-Type': 'application/json' },
    options.headers || {},
    token ? { Authorization: `Bearer ${token}` } : {}
  );

  const res = await fetch(`${window.API_BASE}${path}`, { ...options, headers });
  let data = null;
  try { data = await res.json(); } catch (e) { /* no JSON body */ }

  if (!res.ok) {
    const message = (data && data.error) || `Request failed (${res.status})`;
    const err = new Error(message); err.status = res.status; throw err;
  }
  return data;
};
