// sku.js — automatic, human-readable SKUs:  WT-<CATEGORY>-<NUMBER>   e.g. WT-AUD-0007
// The number counts up per category prefix and is never reused, even if a product is deleted.
const PREFIXES = {
  smartphones: 'PHN', phones: 'PHN', laptops: 'LAP', consoles: 'CON', accessories: 'ACC', audio: 'AUD',
  wearables: 'WRB', tablets: 'TAB', gaming: 'GAM', cameras: 'CAM', tvs: 'TVS', appliances: 'APP',
};

function prefixFor(category) {
  const c = String(category || '').trim().toLowerCase();
  if (!c) return 'GEN';
  if (PREFIXES[c]) return PREFIXES[c];
  const letters = c.replace(/[^a-z]/g, '').toUpperCase();
  return (letters + 'XXX').slice(0, 3);
}

// `db` is a pg Pool or a transaction client. Atomic: two admins saving at once never get the same number.
async function nextSku(db, category) {
  const prefix = prefixFor(category);
  const { rows } = await db.query(
    `INSERT INTO sku_counters (prefix, last_n) VALUES ($1, 1)
     ON CONFLICT (prefix) DO UPDATE SET last_n = sku_counters.last_n + 1
     RETURNING last_n`, [prefix]);
  return `WT-${prefix}-${String(rows[0].last_n).padStart(4, '0')}`;
}

// Bring the counters up to date with SKUs already in the table, so a duplicate is never handed out.
async function syncCounters(db) {
  const { rows } = await db.query(`SELECT sku FROM products WHERE sku ~ '^WT-[A-Z]{3}-[0-9]+$'`);
  const max = {};
  rows.forEach((r) => { const m = /^WT-([A-Z]{3})-(\d+)$/.exec(r.sku); if (m) max[m[1]] = Math.max(max[m[1]] || 0, Number(m[2])); });
  for (const [prefix, n] of Object.entries(max)) {
    await db.query(`INSERT INTO sku_counters (prefix, last_n) VALUES ($1,$2)
                    ON CONFLICT (prefix) DO UPDATE SET last_n = GREATEST(sku_counters.last_n, EXCLUDED.last_n)`, [prefix, n]);
  }
}

// Give every product without a SKU one. With renumberAll, every product not in the new format gets one
// (the old value is kept in legacy_sku). Oldest products get the lowest numbers.
async function backfillSkus(db, { renumberAll = false } = {}) {
  await syncCounters(db);
  const where = renumberAll ? `sku IS NULL OR sku !~ '^WT-[A-Z]{3}-[0-9]+$'` : `sku IS NULL OR btrim(sku) = ''`;
  const { rows } = await db.query(`SELECT id, category, sku FROM products WHERE ${where} ORDER BY date_added ASC, id ASC`);
  for (const p of rows) {
    const sku = await nextSku(db, p.category);
    await db.query(`UPDATE products SET sku = $1, legacy_sku = COALESCE(legacy_sku, NULLIF($2, '')) WHERE id = $3`, [sku, p.sku || '', p.id]);
  }
  return rows.length;
}

module.exports = { prefixFor, nextSku, syncCounters, backfillSkus };
