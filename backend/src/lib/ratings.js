// ratings.js — a product's stars are calculated ONLY from real customer reviews.
async function recalcRating(db, productId) {
  await db.query(
    `UPDATE products p SET rating = COALESCE(r.a, 0), review_count = COALESCE(r.n, 0)
       FROM (SELECT COUNT(*)::int AS n, ROUND(AVG(rating)::numeric, 2) AS a FROM reviews WHERE product_id = $1) r
      WHERE p.id = $1`, [productId]);
}
async function recalcAll(db) {
  await db.query(`UPDATE products SET rating = 0, review_count = 0`);
  await db.query(`UPDATE products p SET rating = ROUND(r.a::numeric, 2), review_count = r.n
                    FROM (SELECT product_id, AVG(rating) a, COUNT(*)::int n FROM reviews GROUP BY product_id) r
                   WHERE p.id = r.product_id`);
}
module.exports = { recalcRating, recalcAll };
