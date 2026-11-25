// shopConfig.js — delivery zones, fees, payment options, delivery templates and store details in one place.
// The admin panel (Delivery & payments, Store settings) saves overrides to the database; these are the defaults.
const { pool } = require('./db');

const DEFAULTS = {
  currency: 'UGX',
  // Orders at or above this subtotal get free delivery in zones marked freeOverThreshold. 0 = no offer.
  freeDeliveryThreshold: 0,
  // quote:true → the fee is not known when the customer orders. Staff set it from the order page and the
  //              customer sees the updated total on their tracking page.
  // lat/lng/radiusKm → a map pin inside this circle selects the zone automatically.
  zones: [
    { id: 'kampala', name: 'Kampala', fee: 0, quote: true, eta: 'Same day for orders before 3 pm', freeOverThreshold: true, lat: 0.3476, lng: 32.5825, radiusKm: 25 },
    { id: 'mbale', name: 'Mbale', fee: 0, quote: true, eta: 'Next day', freeOverThreshold: true, lat: 1.0827, lng: 34.175, radiusKm: 15 },
    { id: 'other', name: 'Elsewhere in Uganda', fee: 0, quote: true, eta: 'Courier, usually 2 to 3 days' },
  ],
  paymentMethods: [
    { id: 'momo', name: 'MTN MoMo', hint: 'Pay when it arrives' },
    { id: 'airtel', name: 'Airtel Money', hint: 'Pay when it arrives' },
    { id: 'cod', name: 'Cash on delivery', hint: 'Pay the rider when it arrives' },
  ],
};

// Ready-made delivery plans the admin picks from when scheduling an order.
// Placeholders: {name} {date} {window} {rider}
const DEFAULT_TEMPLATES = [
  { id: 'same-day', name: 'Same-day (Kampala)', days: 0, window: 'Before 6 PM', note: 'Hi {name}, your order is on its way today ({window}). {rider} will call you before arriving. Please keep your phone on.' },
  { id: 'next-day', name: 'Next-day delivery', days: 1, window: '9 AM to 5 PM', note: 'Hi {name}, we will deliver on {date} ({window}). Please keep your phone on, we will call before we arrive.' },
  { id: 'courier', name: 'Upcountry courier (2 to 3 days)', days: 3, window: '', note: 'Hi {name}, your order is sent by courier and should reach you around {date}. We will share the courier details here as soon as it leaves.' },
  { id: 'preorder', name: 'Pre-order arrival', days: 7, window: '', note: 'Hi {name}, your pre-order is expected in stock around {date}. We will set the exact delivery here once it arrives.' },
  { id: 'pickup', name: 'Pick up from the shop', days: 0, window: 'Shop hours', note: 'Hi {name}, your order is ready for pickup on {date}. Bring your order number and phone.' },
];

const STORE_KEYS = ['name', 'tagline', 'phone', 'email', 'whatsapp', 'location'];
const SOCIAL_KEYS = ['instagram', 'x', 'tiktok', 'youtube', 'facebook'];

async function setting(key) {
  try { const { rows } = await pool.query(`SELECT value FROM site_settings WHERE key = $1`, [key]); return rows[0] ? rows[0].value : null; }
  catch (e) { return null; }
}

async function getShopConfig() {
  const o = await setting('shipping');
  const cfg = { ...DEFAULTS, ...(o && typeof o === 'object' && !Array.isArray(o) ? o : {}) };
  cfg.paymentMethods = (cfg.paymentMethods || []).filter((m) => m && m.id !== 'whatsapp');   // orders are managed on the platform now
  if (!cfg.paymentMethods.length) cfg.paymentMethods = DEFAULTS.paymentMethods;
  if (!Array.isArray(cfg.zones) || !cfg.zones.length) cfg.zones = DEFAULTS.zones;
  return cfg;
}

async function getDeliveryTemplates() {
  const t = await setting('delivery_templates');
  return Array.isArray(t) && t.length ? t : DEFAULT_TEMPLATES;
}

// Store details saved in Admin → Store settings; merged into window.SITE by the /js/site.js route.
let _cache = { at: 0, value: {} };
async function getStoreSettings() {
  if (Date.now() - _cache.at < 15000) return _cache.value;
  const v = (await setting('store')) || {};
  const out = {};
  STORE_KEYS.forEach((k) => { if (typeof v[k] === 'string' && v[k].trim()) out[k] = v[k].trim().slice(0, 200); });
  if (v.social && typeof v.social === 'object') {
    out.social = {};
    SOCIAL_KEYS.forEach((k) => { if (typeof v.social[k] === 'string') out.social[k] = /^https?:\/\//i.test(v.social[k].trim()) ? v.social[k].trim().slice(0, 300) : ''; });
  }
  if (out.whatsapp) out.whatsapp = out.whatsapp.replace(/\D/g, '');
  _cache = { at: Date.now(), value: out };
  return out;
}
const clearStoreCache = () => { _cache = { at: 0, value: {} }; };

// The values built into js/site.js (what the website shows until the owner saves something in the admin).
function siteDefaults() {
  try {
    const src = require('fs').readFileSync(require('path').join(__dirname, '..', '..', 'js', 'site.js'), 'utf8');
    const sandbox = { window: {} };
    require('vm').runInNewContext(src, sandbox, { timeout: 500 });
    return sandbox.window.SITE || {};
  } catch (e) { return {}; }
}

// What the admin "Store details" form should show: the saved value if there is one, otherwise the value the
// website is actually using right now (so links that already appear on the site are never shown as empty).
async function getStoreForAdmin() {
  const saved = (await setting('store')) || {};
  const base = siteDefaults();
  const out = {};
  STORE_KEYS.forEach((k) => { out[k] = typeof saved[k] === 'string' ? saved[k] : (base[k] || ''); });
  out.social = {};
  SOCIAL_KEYS.forEach((k) => { out.social[k] = saved.social && typeof saved.social[k] === 'string' ? saved.social[k] : ((base.social && base.social[k]) || ''); });
  return out;
}

function deliveryFor(cfg, zoneId, subtotal) {
  const zone = (cfg.zones || []).find((z) => z.id === zoneId);
  if (!zone) return null;
  if (zone.quote) return { zone, fee: 0, quote: true };
  const free = zone.freeOverThreshold && cfg.freeDeliveryThreshold > 0 && subtotal >= cfg.freeDeliveryThreshold;
  return { zone, fee: free ? 0 : Number(zone.fee) || 0, quote: false };
}

// Returns { code, discount, description } or throws an Error with a customer-friendly message.
async function evaluateCoupon(client, rawCode, subtotal) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) throw new Error('Enter a discount code');
  const { rows } = await client.query('SELECT * FROM coupons WHERE code = $1 FOR UPDATE', [code]);
  const c = rows[0];
  if (!c || !c.active) throw new Error('That code is not valid');
  if (c.expires_at && new Date(c.expires_at) < new Date()) throw new Error('That code has expired');
  if (c.max_uses !== null && c.used_count >= c.max_uses) throw new Error('That code has been fully redeemed');
  if (subtotal < Number(c.min_subtotal)) throw new Error(`Spend at least UGX ${Number(c.min_subtotal).toLocaleString('en-UG')} to use this code`);
  const raw = c.type === 'percent' ? Math.round(subtotal * Number(c.value) / 100) : Number(c.value);
  const discount = Math.max(0, Math.min(raw, subtotal));
  return { code, discount, description: c.description || (c.type === 'percent' ? `${Number(c.value)}% off` : `UGX ${Number(c.value).toLocaleString('en-UG')} off`) };
}

module.exports = { DEFAULTS, DEFAULT_TEMPLATES, getShopConfig, getDeliveryTemplates, getStoreSettings, getStoreForAdmin, siteDefaults, clearStoreCache, deliveryFor, evaluateCoupon, setting };
