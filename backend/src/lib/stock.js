// stock.js — how a stock QUANTITY turns into the stock STATUS customers see.
const LOW_STOCK_AT = 5;

// qty === null means "I manage the status by hand".
function deriveStock(qty, current) {
  if (qty === null || qty === undefined) return current || 'in-stock';
  if (current === 'pre-order') return 'pre-order';
  if (qty <= 0) return 'out-of-stock';
  if (qty <= LOW_STOCK_AT) return 'limited';
  return 'in-stock';
}

// Add (+1) or take away (-1) stock for the items of an order. Only products that track a quantity are touched.
async function adjustStock(db, items, sign) {
  for (const i of items || []) {
    const q = Math.floor(Number(i.quantity || i.qty || 1)); const id = Number(i.productId ?? i.id);
    if (!id || !q) continue;
    const { rows } = await db.query('SELECT stock, stock_qty FROM products WHERE id = $1 FOR UPDATE', [id]);
    if (!rows.length || rows[0].stock_qty === null) continue;
    const next = Math.max(0, rows[0].stock_qty + sign * q);
    await db.query('UPDATE products SET stock_qty = $1, stock = $2, date_updated = now() WHERE id = $3', [next, deriveStock(next, rows[0].stock), id]);
  }
}

module.exports = { LOW_STOCK_AT, deriveStock, adjustStock };
