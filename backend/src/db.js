// db.js — single shared PostgreSQL pool. Works with Neon (recommended),
// any hosted Postgres, a local install, or Docker.
require('dotenv').config();
const { Pool, types } = require('pg');
types.setTypeParser(1082, (v) => v);   // DATE columns stay plain 'YYYY-MM-DD' strings

if (!process.env.DATABASE_URL) {
  console.error(
    '\n[db] DATABASE_URL is not set.\n' +
    '     Open backend/.env and paste your Neon connection string\n' +
    '     (Neon dashboard → Connect → copy the connection string).\n' +
    '     See BACKEND_README.md for step-by-step instructions.\n'
  );
  process.exit(1);
}

let connectionString = process.env.DATABASE_URL.trim();
let host = '';
let urlObj = null;
try { urlObj = new URL(connectionString); host = urlObj.hostname; } catch (e) {
  console.error('[db] DATABASE_URL is not a valid URL. It should look like postgresql://user:password@host/dbname');
  process.exit(1);
}

const isNeon = /\.neon\.tech$/i.test(host);
const sslEnv = String(process.env.DATABASE_SSL || '').toLowerCase();
const urlWantsSSL = /^(require|verify-full|verify-ca|prefer)$/i.test(urlObj.searchParams.get('sslmode') || '');
const useSSL = sslEnv === 'true' || (sslEnv !== 'false' && (isNeon || urlWantsSSL));

// We configure SSL explicitly, so drop URL params that node-postgres would
// otherwise interpret (and warn about). Neon's certificates are publicly
// trusted, so we verify them. Other hosts (e.g. self-signed proxies) are
// allowed unless DATABASE_SSL_VERIFY=true.
['sslmode', 'channel_binding'].forEach((p) => urlObj.searchParams.delete(p));
connectionString = urlObj.toString();
const verify = isNeon || String(process.env.DATABASE_SSL_VERIFY).toLowerCase() === 'true';

const pool = new Pool({
  connectionString,
  ssl: useSSL ? { rejectUnauthorized: verify } : false,
  max: Number(process.env.DATABASE_POOL_MAX) || 10,
  idleTimeoutMillis: 30000,
  // Neon scales to zero when idle; the first connection after a pause can take a few seconds.
  connectionTimeoutMillis: 30000,
  keepAlive: true,
});

pool.on('error', (err) => {
  // Neon closes idle connections when a compute suspends. That's normal — the pool replaces them.
  if (err && (err.code === '57P01' || /terminat|ECONNRESET/i.test(err.message))) return;
  console.error('[db] Unexpected error on idle client', err.message);
});

// Retry once on connection-level failures (e.g. a suspended Neon compute waking up).
const isTransient = (e) => e && (
  ['ECONNRESET', 'EPIPE', 'ETIMEDOUT', '57P01', '08006', '08003', '08001'].includes(e.code) ||
  /Connection terminated|timeout exceeded when trying to connect/i.test(e.message || '')
);
const rawQuery = pool.query.bind(pool);
pool.query = async (...args) => {
  try { return await rawQuery(...args); } catch (e) {
    if (isTransient(e)) { await new Promise((r) => setTimeout(r, 400)); return rawQuery(...args); }
    throw e;
  }
};

module.exports = {
  pool,
  isNeon,
  host,
  query: (text, params) => pool.query(text, params),
};
