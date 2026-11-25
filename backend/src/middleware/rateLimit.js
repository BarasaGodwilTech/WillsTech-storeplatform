// Tiny in-memory rate limiter (per IP). Good enough for a single-process
// deployment; swap for `express-rate-limit` + Redis if you scale out.
function rateLimit({ windowMs = 60000, max = 60, message = 'Too many requests' } = {}) {
  const hits = new Map();
  setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
  }, windowMs).unref();

  return function limiter(req, res, next) {
    const now = Date.now();
    const key = req.ip;
    let entry = hits.get(key);
    if (!entry || entry.reset <= now) {
      entry = { count: 0, reset: now + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    if (entry.count > max) {
      res.setHeader('Retry-After', Math.ceil((entry.reset - now) / 1000));
      return res.status(429).json({ error: message });
    }
    next();
  };
}
module.exports = { rateLimit };
