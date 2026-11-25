/**
 * build.js — the "cache bump".
 *
 * BUILD is a short ID that changes whenever the site's code changes. It is
 *   1. added to every /js/*.js and /css/*.css URL in every page  (?v=BUILD)  -> browsers and CDNs fetch the new file,
 *   2. put in <meta name="wt-build">                                          -> the page knows which build it is running,
 *   3. served at /api/version                                                 -> open tabs can notice a newer deploy.
 *
 * It is computed from the content of the frontend files, so it changes exactly when the code changes, with no manual step.
 * Set APP_VERSION in the environment to override it (e.g. a git SHA from your deploy script).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..', '..');
const DIRS = ['js', 'css', 'pages'];
const FILES = ['index.html', 'admin.html', 'admin-login.html', 'admin-orders.html'];

function walk(dir, out) {
  let list = [];
  try { list = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return out; }
  list.sort((a, b) => a.name.localeCompare(b.name)).forEach((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) walk(p, out); else if (/\.(js|css|html)$/i.test(d.name)) out.push(p);
  });
  return out;
}

function compute() {
  if (process.env.APP_VERSION) return String(process.env.APP_VERSION).replace(/[^\w.-]/g, '').slice(0, 24) || 'dev';
  const h = crypto.createHash('md5');
  const files = DIRS.flatMap((d) => walk(path.join(ROOT, d), [])).concat(FILES.map((f) => path.join(ROOT, f)));
  files.forEach((f) => { try { h.update(path.relative(ROOT, f)); h.update(fs.readFileSync(f)); } catch (e) { /* missing file */ } });
  return h.digest('hex').slice(0, 10);
}

const BUILD = compute();

// Add ?v=BUILD to local script/style URLs and a build meta tag. Leaves external URLs and already-versioned ones alone.
function stamp(html) {
  return String(html)
    .replace(/(<(?:script|link)\b[^>]*?\b(?:src|href)=")(\/?(?:js|css)\/[^"?#]+\.(?:js|css))(")/gi, `$1$2?v=${BUILD}$3`)
    .replace(/<head([^>]*)>/i, `<head$1>\n<meta name="wt-build" content="${BUILD}">`)
    .replace(/<\/head>/i, `<script src="/js/build-check.js?v=${BUILD}" defer></script>\n</head>`);
}

module.exports = { BUILD, stamp };
