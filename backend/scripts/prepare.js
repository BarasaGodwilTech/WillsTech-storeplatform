// prepare.js — runs before the server starts: checks the database connection with
// plain-English errors, creates/updates tables, and seeds starter data (only once).
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { spawnSync } = require('child_process');
const path = require('path');

const HINTS = {
  ENOTFOUND: 'The database host could not be found. Re-copy the connection string from Neon (Connect button).',
  ECONNREFUSED: 'The database refused the connection. Check the host and port in DATABASE_URL.',
  ETIMEDOUT: 'The connection timed out. Check your internet connection. Neon can take a few seconds to wake up, so try again.',
  '28P01': 'Neon rejected the password. Copy a fresh connection string from the Connect dialog (you can reset the password there).',
  '28000': 'Neon rejected the login. Copy a fresh connection string from the Connect dialog.',
  '3D000': 'That database name does not exist in your Neon project. Use the connection string exactly as Neon shows it.',
};

(async () => {
  const { pool, host, isNeon } = require('../src/db');
  try {
    const t = Date.now();
    await pool.query('SELECT 1');
    console.log(`[db] Connected to ${isNeon ? 'Neon' : 'PostgreSQL'} (${host}) in ${Date.now() - t} ms`);
  } catch (e) {
    console.error('\n[db] Could not connect: ' + e.message);
    console.error('     ' + (HINTS[e.code] || 'Check DATABASE_URL in backend/.env.') + '\n');
    process.exit(1);
  } finally { await pool.end(); }

  for (const script of ['migrate.js', 'seed.js']) {
    const r = spawnSync(process.execPath, [path.join(__dirname, '..', 'src', script)], { stdio: 'inherit' });
    if (r.status !== 0) { console.error(`[prepare] ${script} failed.`); process.exit(r.status || 1); }
  }
})();
