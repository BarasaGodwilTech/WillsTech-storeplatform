const { verifyToken } = require('../utils/jwt');

function getTokenFromRequest(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) return header.slice(7);
  if (req.cookies && req.cookies.token) return req.cookies.token;
  return null;
}

// Attaches req.user if a valid token is present; never blocks the request.
function optionalAuth(req, res, next) {
  const token = getTokenFromRequest(req);
  if (token) {
    try {
      req.user = verifyToken(token);
    } catch (e) {
      // invalid/expired token — just treat as logged out
    }
  }
  next();
}

// Requires a valid token for any logged-in user (customer or admin).
function requireAuth(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = verifyToken(token);
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

// Requires a valid token AND role === 'admin'.
function requireAdmin(req, res, next) {
  const token = getTokenFromRequest(req);
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    const decoded = verifyToken(token);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    req.user = decoded;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

module.exports = { optionalAuth, requireAuth, requireAdmin };
