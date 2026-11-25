/**
 * build-check.js — the browser side of the cache bump (the server adds this script to every page).
 *
 * When a page loads under a NEW build, saved data from the old build (product catalogue copies) is cleared once,
 * so returning visitors never start from stale data. Nothing is shown to the visitor.
 * Carts, wishlists, logins and settings are never touched.
 */
(function () {
  'use strict';
  var meta = document.querySelector('meta[name="wt-build"]');
  var build = meta && meta.content;
  if (!build) return;   // opened without the server (no build stamp): nothing to compare
  try {
    var KEY = 'wt-build', prev = localStorage.getItem(KEY);
    if (prev !== build) {
      Object.keys(localStorage).forEach(function (k) { if (k.indexOf('wt-catalog') === 0) localStorage.removeItem(k); });
      localStorage.setItem(KEY, build);
    }
  } catch (e) { /* storage blocked */ }
})();
