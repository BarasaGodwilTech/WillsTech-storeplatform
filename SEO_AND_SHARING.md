# SEO, search and sharing: what changed

## Link previews (WhatsApp, Facebook, X, Telegram, LinkedIn)
- Product share image is now a full 1200x630 picture (backend/src/lib/pages.js, `buildCard`). The photo fills the full height, the
  sides continue the photo's own edge colours, and a small logo badge sits bottom-left. No circle, no text (so no font needed on the server).
- Homepage image `IMAGES/social-share.jpg` regenerated (the payment line used to be clipped).
- Bump `CARD_VERSION` in pages.js whenever you want every platform to fetch fresh images.
- Share button: `WT.waShare()` (js/utils.js) has no phone number, so WhatsApp opens the "choose a chat" screen.
  `WT.waLink()` is still for messaging the store. A phone share button, Facebook and Telegram were added to the product page.

## What search engines and AI crawlers now get (all in the raw HTML, no JavaScript needed)
- Product pages: real name, price, description, features and specs; title "<name> Price in Uganda | Will's Tech Store".
- Home and shop pages: a plain "browse by category" list linking to every product.
- Category pages: /shop/<category> with their own title, description and product list. /shop?category=x redirects (301) to it.
- Structured data: Organization + WebSite (home), Product + BreadcrumbList (products), CollectionPage/ItemList (categories),
  BreadcrumbList (other public pages). Ratings appear only when real reviews exist.
- robots meta allows large image previews; hreflang en-UG; private pages stay noindex.

## New or changed files served by the backend
- /sitemap.xml   pages + categories + products with photos (no private pages)
- /llms.txt      plain-text summary of the store for AI assistants (not confirmed to be used by the big engines, but harmless)
- /feeds/google-merchant.xml   product feed for Google Merchant Center (Uganda is listed as a supported country)
- /<INDEXNOW_KEY>.txt   proof-of-ownership for IndexNow. Set INDEXNOW_KEY and PUBLIC_URL in backend/.env.
  Saving a product then pings Bing/IndexNow automatically (production only).
- robots.txt     explicitly allows search and AI crawlers

## After deploying
1. Facebook Sharing Debugger: scrape your home page and a few products again (platforms cache old previews).
2. Google Search Console + Bing Webmaster Tools: verify the site, submit https://willstech.store/sitemap.xml.
3. Google Business Profile for local searches. Merchant Center: add the feed URL above.
4. Use exact product names ("JBL Flip 6", not "Jbl Flip 6") and split the big "Accessories" category into specific ones.
