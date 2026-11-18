// shopConfig.js — delivery zones, fees and payment options in one place.
// Edit the DEFAULTS below, or override them from the database by saving a
// "shipping" object with PUT /api/config/shipping (admin token required).
const { pool } = require('./db');

const DEFAULTS = {
  currency: 'UGX',
  whatsapp: '256751924844',
  // We deliver everywhere in Uganda; by default every zone's fee is confirmed with the customer on WhatsApp (quote: true).
  // To charge a fixed fee, remove `quote` and set the zone's `fee`. For a free-delivery offer, also set
  // `freeDeliveryThreshold` (orders at or above it are free in zones marked freeOverThreshold).
  freeDeliveryThreshold: 0,
  zones: [
    { id: 'kampala', name: 'Kampala', fee: 0, quote: true, eta: 'Same day for orders before 3 pm', freeOverThreshold: true },
    { id: 'mbale',   name: 'Mbale',   fee: 0, quote: true, eta: 'Next day', freeOverThreshold: true },
    { id: 'other',   name: 'Elsewhere in Uganda', fee: 0, quote: true, eta: 'Courier. We confirm the fee on WhatsApp' },
  ],
  paymentMethods: [
    { id: 'momo',     name: 'MTN MoMo',         hint: 'Pay on delivery or send first' },
    { id: 'airtel',   name: 'Airtel Money',     hint: 'Pay on delivery or send first' },
    { id: 'cod',      name: 'Cash on delivery', hint: 'Pay the rider when it arrives' },
    { id: 'whatsapp', name: 'Confirm on WhatsApp', hint: 'Talk to a person first' },
  ],
};

async function getShopConfig() {
  let override = {};
  try {
    const { rows } = await pool.query(`SELECT value FROM site_settings WHERE key = 'shipping'`);
    if (rows[0] && rows[0].value && typeof rows[0].value === 'object') override = rows[0].value;
  } catch (e) { /* table may not exist yet; fall back to defaults */ }
  return { ...DEFAULTS, ...override };
}

function deliveryFor(cfg, zoneId, subtotal) {
  const zone = (cfg.zones || []).find((z) => z.id === zoneId);
  if (!zone) return null;
  if (zone.quote) return { zone, fee: 0, quote: true };
  const free = zone.freeOverThreshold && subtotal >= cfg.freeDeliveryThreshold;
  return { zone, fee: free ? 0 : Number(zone.fee) || 0, quote: false };
}

// Returns { code, discount, description } or throws an Error with a customer-friendly message.
async function evaluateCoupon(client, rawCode, subtotal) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!code) throw new Error('Enter a discount code');
  const { rows } = await client.query('SELECT * FROM coupons WHERE code = $1', [code]);
  const c = rows[0];
  if (!c || !c.active) throw new Error('That code is not valid');
  if (c.expires_at && new Date(c.expires_at) < new Date()) throw new Error('That code has expired');
  if (c.max_uses !== null && c.used_count >= c.max_uses) throw new Error('That code has been fully redeemed');
  if (subtotal < Number(c.min_subtotal)) {
    throw new Error(`Spend at least UGX ${Number(c.min_subtotal).toLocaleString('en-UG')} to use this code`);
  }
  const raw = c.type === 'percent' ? Math.round(subtotal * Number(c.value) / 100) : Number(c.value);
  const discount = Math.max(0, Math.min(raw, subtotal));
  return { code, discount, description: c.description || (c.type === 'percent' ? `${Number(c.value)}% off` : `UGX ${Number(c.value).toLocaleString('en-UG')} off`) };
}

module.exports = { DEFAULTS, getShopConfig, deliveryFor, evaluateCoupon };
