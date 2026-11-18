// migrate.js — creates (or updates) all tables. Safe to run more than once.
require('dotenv').config();
const { pool } = require('./db');

const SQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  phone         TEXT,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'admin')),
  photo_url     TEXT,
  preferences   JSONB NOT NULL DEFAULT '{}',
  login_history JSONB NOT NULL DEFAULT '[]',
  reset_token_hash    TEXT,
  reset_token_expires TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Safe to run against a database created before these columns existed.
ALTER TABLE users ADD COLUMN IF NOT EXISTS photo_url TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS preferences JSONB NOT NULL DEFAULT '{}';
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_history JSONB NOT NULL DEFAULT '[]';
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS products (
  id               BIGINT PRIMARY KEY,
  name             TEXT NOT NULL,
  sku              TEXT,
  category         TEXT,
  description      TEXT,
  price            NUMERIC(12,2) NOT NULL DEFAULT 0,
  original_price   NUMERIC(12,2),
  images           JSONB NOT NULL DEFAULT '[]',
  videos           JSONB NOT NULL DEFAULT '[]',
  stock            TEXT NOT NULL DEFAULT 'in-stock',
  rating           NUMERIC(3,2) DEFAULT 0,
  review_count     INTEGER DEFAULT 0,
  badges           JSONB NOT NULL DEFAULT '[]',
  features         JSONB NOT NULL DEFAULT '[]',
  specifications   JSONB NOT NULL DEFAULT '{}',
  featured         BOOLEAN NOT NULL DEFAULT false,
  status           TEXT NOT NULL DEFAULT 'active',
  date_added       TIMESTAMPTZ NOT NULL DEFAULT now(),
  date_updated     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS site_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL DEFAULT '{}',
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID REFERENCES users(id) ON DELETE SET NULL,
  customer_name     TEXT,
  customer_email    TEXT,
  customer_phone    TEXT,
  items             JSONB NOT NULL DEFAULT '[]',
  subtotal          NUMERIC(12,2) NOT NULL DEFAULT 0,
  total             NUMERIC(12,2) NOT NULL DEFAULT 0,
  status            TEXT NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','confirmed','shipped','completed','cancelled')),
  shipping_address  JSONB DEFAULT '{}',
  payment_method    TEXT DEFAULT 'whatsapp',
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- ── Customer account data (addresses, payment methods, wishlist) ────────
-- Added so account/order/wishlist/address/payment data lives in the same
-- Postgres database as everything else, instead of Firebase.

CREATE TABLE IF NOT EXISTS addresses (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  phone        TEXT NOT NULL,
  street       TEXT NOT NULL,
  city         TEXT NOT NULL,
  state        TEXT,
  postal_code  TEXT,
  country      TEXT NOT NULL DEFAULT 'Uganda',
  type         TEXT NOT NULL DEFAULT 'shipping' CHECK (type IN ('shipping', 'billing')),
  is_default   BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_addresses_user ON addresses(user_id);

-- Metadata only — never store full card numbers or CVVs. Card entries only
-- ever keep the last 4 digits (masked server-side); momo/airtel/bank entries
-- keep the phone or account number since there's no card network involved.
-- Nothing here is wired to an actual payment processor (checkout happens
-- over WhatsApp), so this is for the customer's own reference only.
CREATE TABLE IF NOT EXISTS payment_methods (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type           TEXT NOT NULL CHECK (type IN ('card', 'momo', 'airtel', 'bank')),
  last4          TEXT,
  expiry         TEXT,
  phone_number   TEXT,
  bank_name      TEXT,
  account_number TEXT,
  is_default     BOOLEAN NOT NULL DEFAULT false,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_methods_user ON payment_methods(user_id);

CREATE TABLE IF NOT EXISTS wishlist_items (
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  product_id  BIGINT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, product_id)
);

-- ── Full e-commerce additions ───────────────────────────────────────────
-- Human-friendly order numbers (WT-2026-00042), delivery + discount columns.
CREATE SEQUENCE IF NOT EXISTS order_number_seq START 1;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_number  TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_zone TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee  NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount      NUMERIC(12,2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code   TEXT;

WITH todo AS (SELECT id, created_at FROM orders WHERE order_number IS NULL ORDER BY created_at)
UPDATE orders o
   SET order_number = 'WT-' || to_char(t.created_at, 'YYYY') || '-' || lpad(nextval('order_number_seq')::text, 5, '0')
  FROM todo t WHERE o.id = t.id;

CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_number ON orders(order_number);

-- Timeline shown on the order-tracking page.
CREATE TABLE IF NOT EXISTS order_events (
  id         BIGSERIAL PRIMARY KEY,
  order_id   UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  status     TEXT NOT NULL,
  note       TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_events_order ON order_events(order_id);

CREATE TABLE IF NOT EXISTS coupons (
  code          TEXT PRIMARY KEY,
  type          TEXT NOT NULL CHECK (type IN ('percent', 'fixed')),
  value         NUMERIC(12,2) NOT NULL,
  min_subtotal  NUMERIC(12,2) NOT NULL DEFAULT 0,
  max_uses      INTEGER,
  used_count    INTEGER NOT NULL DEFAULT 0,
  active        BOOLEAN NOT NULL DEFAULT true,
  expires_at    TIMESTAMPTZ,
  description   TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS reviews (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id  BIGINT NOT NULL,
  user_id     UUID REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT NOT NULL,
  rating      INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title       TEXT,
  body        TEXT,
  verified    BOOLEAN NOT NULL DEFAULT false,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_one_per_user ON reviews(product_id, user_id) WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS newsletter_subscribers (
  email      TEXT PRIMARY KEY,
  source     TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS contact_messages (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  email      TEXT,
  phone      TEXT,
  subject    TEXT,
  message    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'new',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
`;

async function migrate() {
  console.log('[migrate] Connecting to database...');
  try {
    await pool.query(SQL);
    console.log('[migrate] ✅ Tables are up to date.');
  } catch (err) {
    console.error('[migrate] ❌ Migration failed:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

migrate();
