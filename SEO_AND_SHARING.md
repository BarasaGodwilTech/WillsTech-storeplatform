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

## How the site appears on Google (favicon, name, logo)
- Every page now carries the same icon set (pages.js `ICON_TAGS`): favicon.ico (48px), SVG, 96px and 192px PNG, Apple icon, manifest.
  Keep the `?v=4` URLs unchanged; changing them makes Google start over.
- Google only shows a favicon after its own crawler fetches it, and refreshing one takes days to weeks. Nothing in code can speed that up.
- Site name ("Will's Tech Store" instead of "willstech.store") and the logo come from the WebSite/Organization data on the home page.
- Sitelinks (the extra links under a result, like Jumia's) are chosen by Google automatically. Clear menus and the new category pages help.
- The knowledge panel on the right comes from a Google Business Profile. The "Wills tech services" panel in your screenshot (Wakiso,
  0766 587965) is not the number on this site: claim it if it's yours, otherwise create your own profile.

## "Shop by category" block (home, shop and category pages)
Written by the server (`catalogueHtml` in seo.js, styles at the end of css/pages.css). A card per category with a thumbnail, name,
price and discount badge for each product; every product is a plain link, so crawlers reach all of them without JavaScript.
The home page shows the first 8 per category with a "View all" button; /shop and /shop/<category> list everything.
Uses the site's theme colours, so dark mode works. Phones get two compact columns.
