# Will's Tech Store: full e-commerce platform

Storefront + admin + API in one Node.js app, with PostgreSQL on **[Neon](https://neon.tech)**.

## 1. Run it (Windows): double-click `start.bat`

1. Install [Node.js LTS](https://nodejs.org) once.
2. Double-click **`start.bat`**. First run it will:
   - create `backend/.env`, generate a private `JWT_SECRET` and an admin password (**shown once in the window and saved in `backend/.env`**)
   - ask you to paste your **Neon connection string**
   - run `npm install`, connect to Neon, create all tables, import your products, add the `WELCOME5` coupon
   - open **http://localhost:4000**
3. Every later run just starts the server. macOS/Linux: `./start.sh`.

**Neon connection string:** console.neon.tech → your project → **Connect** → copy the string
(`postgresql://…neon.tech/neondb?sslmode=require`). SSL is automatic. Free-tier databases sleep when idle, so the first request after a quiet spell can take a few seconds; the backend waits and retries.

| What | Where |
|---|---|
| Store | http://localhost:4000 |
| Admin login | http://localhost:4000/admin/login |
| Orders & Inbox (admin) | http://localhost:4000/admin#orders (also in the admin sidebar) |
| Health check | http://localhost:4000/api/health |

## 2. What's in the platform

**Customer pages:** Home (bento hero: sliding products + video spotlights with story-style progress, *Shop by budget* and *Deal of the week* tiles, categories with photos, best sellers, budget tiles, *Complete your setup*, new arrivals, *Watch & shop* reel, Apple band, real customer reviews, how-it-works) · Shop (quick "Popular" chips, category + **brand** filters, price, sort, search, shareable URLs, **compare up to 3 products**) · Product (gallery + video, key specs, benefit bullets, stock state, wishlist, compare, reviews, related, sticky mobile buy bar) · Cart (+ slide-in mini-cart) · Checkout (**guest checkout**, delivery zones, payment choice, discount codes) · Order confirmation · **Track order** · Account · Sign in / Register / Reset password · About · Contact · FAQ · Delivery & payment · Returns & warranty · Privacy · Terms · Cookies · 404. Every inner page opens with the same **page hero**.

**Navigation:** a **Categories** menu with live counts (it grows automatically with your catalogue), search pill (Ctrl/Cmd+K), one **Help** menu (chat, call, email, hours), wishlist, account and cart. On phones: a bottom **tab bar** (Home, Shop, Search, Cart, Account) and a drawer with a category accordion. Pages cross-fade between each other in supporting browsers.

**Cart (rebuilt):** one cart per device that survives signing in/out, migrates any old carts, falls back gracefully if browser storage is blocked, syncs across tabs, has **Undo** on remove, flags items that were delisted or sold out (and blocks checkout until they're removed), refreshes changed prices on every page, and suggests "Pair it with" extras.

**Admin panel (v2):** Dashboard (with delivery counters: needs a date, today, overdue, unpaid) · **Orders** (confirm, schedule delivery from a template, rider, fee, payment status and reference, staff-only note, print, CSV) · **Products** (auto SKU, brand, stock units with automatic status, photos, YouTube/Vimeo/mp4 videos with live validation, writing guide, "suggest features and specs from the description", optional AI writer, duplicate, bulk show/hide/feature/category/delete, CSV import/export) · Customers · Discount codes · Categories (rename/merge) · **Reviews & ratings** (ratings come only from real reviews; "Clear all ratings") · Messages · Newsletter · **Delivery & payments** (zones with map circles, fees, free-delivery offer) · **Delivery templates** · Store details (phone, email, social links) · **Photo storage** (Cloudflare R2 status, test, move all photos) · Settings (password, dark mode, backup).

**Wishlist:** works for everyone. Signed out, items are saved on the device (no forced sign-in) and a gentle "sign in to keep it on every device" prompt appears once; after sign-in they're merged into the account automatically. Hearts, the header count and the Wishlist page (`pages/wishlist.html`) stay in sync, clear on sign-out, roll back if the server rejects a change, and can't be flip-flopped by double clicks (the API is idempotent: `PUT`/`DELETE /api/account/wishlist/:id`, plus `POST /api/account/wishlist/merge`).

**Product cards:** cards with several photos scroll through them on hover (swipe on touch) with a small dot indicator; cards with one photo stay still. Search history only records searches you actually commit (Enter, a result, View all), not every keystroke.

**Loading & polish:** skeleton placeholders on every area that loads data (hero, tiles, rails, shop, cart, checkout, account panels, tracking), image fade-in, light/dark theme, SEO (JSON-LD, sitemap.xml), accessibility basics (skip link, focus states, reduced-motion support).

**Orders are managed on the platform.** There is no WhatsApp order flow. A customer orders, then follows every step (confirmed, delivery date and window, rider, fee, payment) on the tracking page. WhatsApp remains only as an optional support chat link (Help menu, contact page, footer); clear the number in Admin → Store details if you do not want it.

**Address map:** customers can pin their location on a map (OpenStreetMap via Leaflet; search, "use my location", draggable pin) in checkout and when saving addresses. The pin picks the delivery zone automatically using the circles set in Admin → Delivery & payments, and riders get a map link on the order.

### Cloudflare R2 (photo storage)
Create a bucket, enable its public address, create an API token (Object Read & Write), then set `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL` in `backend/.env` and restart. In Admin → Photo storage press **Test connection**, then **Move photos**. Uploads are converted to WebP (1600px, plus a 480px `-sm` copy used on product cards). Without R2, photos are saved in `public/images/products`.

### SKUs, stock and ratings
SKUs are generated as `WT-<CAT>-<NNNN>`. The first start renumbers old SKUs once (originals kept in `legacy_sku`). Enter "units in stock" and the status follows (0 = out, 1 to 5 = low); orders reduce and cancellations restore stock. Old hand-entered ratings were cleared once; ratings are now calculated from real customer reviews only.

### Optional AI description writer
Set `ANTHROPIC_API_KEY` in `backend/.env` to show an "Improve with AI" button in the product editor. The writing guide and the feature/spec suggestions work without it.

### How checkout works (important)
There is **no card/online payment**. A customer places an order (no account needed) and gets an order number. You confirm it in Admin → Orders, set the delivery plan, and the customer pays by MTN MoMo, Airtel Money, bank or cash when it arrives; you record the payment on the order. The server **recalculates all prices, delivery and discounts**; nothing the browser sends is trusted.

## 3. Things to review / customise
| Change | Where |
|---|---|
| Phone, email, social links, support WhatsApp number | Admin → Store details |
| **Delivery fees, zones, payment options, delivery templates** | Admin → Delivery & payments / Delivery templates (defaults live in `backend/src/shopConfig.js`). By default every zone is "you set the fee per order". |
| Discount codes | Admin → Discount codes |
| Hero slides | Automatic (best-looking products + 2 video slides). Pin products with `heroProductIds` in `js/site.js`. Side tiles are automatic too (budgets from your prices, deal = biggest discount) |
| Videos | `public/videos/` + one line each in `js/media.js` (title, keywords that link a clip to a product) |
| Colours / fonts | tokens at the top of `css/store.css` |
| Legal pages | `pages/privacy.html`, `terms.html`, `returns.html`: sensible defaults written from your site's promises (30-day returns, WhatsApp support). **Have them reviewed before launch.** |

## 4. Project layout
```
start.bat / start.sh        one-click start
index.html, pages/*.html    storefront (static HTML; header/footer are injected by js/layout.js)
css/store.css               design system + shared components
css/pages.css               page styles    css/account.css   sign-in & account
js/site.js                  your constants   js/layout.js   shared header/footer/cart drawer
js/ui.js                    hero slider + rails   js/media.js   video library & player
js/compare.js               compare bar + modal   js/cart.js    the cart
js/pages/*.js               one script per page
backend/server.js           Express app (serves the site and /api)
backend/src/routes/         auth, products, orders, shop, account, admin*
backend/src/migrate.js      tables (safe to re-run)   seed.js  first-time data
backend/scripts/            setup-env.js, prepare.js (used by start.bat)
admin.html, admin-orders.html (redirect), css/admin.css, js/admin/*
public/videos, public/images
```

## 5. Deploying
Any Node host works (Render, Railway, Fly, a VPS). Set the env vars from `backend/.env.example` (`DATABASE_URL`, `JWT_SECRET`, `ADMIN_*`, optionally `PUBLIC_URL=https://yourdomain`), run `npm install --prefix backend`, then `node backend/scripts/prepare.js && node backend/server.js`. GitHub Pages can no longer host this site on its own, because checkout, accounts and the admin need the backend.

## 6. Troubleshooting
- *"password authentication failed"* → copy a fresh connection string from Neon's Connect dialog.
- *Timeout on first start* → Neon was waking up; run `start.bat` again.
- *Admin password:* the first-run password is saved in `backend/.env` (`ADMIN_PASSWORD`). Change it from the admin panel after logging in; the new one is stored hashed in the database and `.env` no longer applies.
- Icons/fonts come from CDNs (Font Awesome 6.5.1, Google Fonts). To self-host, download them into `css/` and update the `<link>` tags.

## 7. Notes
- The Apple clips in `public/videos` are Apple's promotional material. Make sure you're allowed to use them on your site (e.g. through a supplier or reseller programme).
- Optional Docker/Postgres: `docker-compose.yml` still works for a fully local database.
