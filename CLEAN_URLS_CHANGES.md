# What changed (clean URLs, share previews, admin links, hero)

## Addresses
| Before | Now |
|---|---|
| /index.html | / |
| /pages/shop.html?category=audio | /shop?category=audio |
| /pages/product.html?id=123 | /product/<product-name>-123 |
| /admin.html, /admin-login.html | /admin, /admin/login |

Old addresses 301-redirect to the new ones, so links already shared keep working.
Pages no longer show the `pages/` folder or `.html`.

## Link previews (WhatsApp, X, Facebook, Telegram…)
Crawlers do not run JavaScript, so the server now writes the title, description, price and image
into the HTML of every page. Product links use /share/product/<id>.jpg (1200x630, cover photo in a circle).
Set `PUBLIC_URL=https://willstech.store` in backend/.env so preview URLs are always https.
After deploying, refresh caches: https://developers.facebook.com/tools/debug/ (also fixes WhatsApp)
and https://cards-dev.x.com/validator if X still shows an old card.

## Admin
Store details now shows the links/phone/email the site is really using (they were only read from the database,
so the form looked empty while the footer showed them).
<<<<<<< HEAD

## Round 2
- Product page "We couldn't find that product": the browser was running an old cached product.js that only understood ?id=.
  Scripts and styles are now revalidated on every load, and the server also hands the product id to the page directly.
- Product slugs are now short (first part of the name, whole words, max 60 chars). Old long links 301 to the short one.
- Admin bell is now a real notification list (new orders, overdue/unscheduled deliveries, messages, stock, expiring codes).
=======
>>>>>>> c338fb81c595c3987b795b730eafef80368aa8e0
