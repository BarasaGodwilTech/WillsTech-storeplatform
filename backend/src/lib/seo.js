// seo.js — everything search engines and AI assistants read about the store.
//   • page titles / descriptions that match how people really search ("<product> price in Uganda")
//   • structured data (schema.org JSON-LD): Organization + WebSite, Product, BreadcrumbList, CollectionPage
//   • plain HTML that works WITHOUT JavaScript (most AI crawlers do not run scripts)
//   • /llms.txt, the Google Merchant feed and IndexNow pings
const { pool } = require('../db');
const { getStoreForAdmin } = require('../shopConfig');

const NAME = "Will's Tech Store";
const SUFFIX = ` | ${NAME}`;
const HOURS = [
  { days: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], opens: '08:00', closes: '20:00' },
  { days: ['Sunday'], opens: '10:00', closes: '18:00' },
];

const money = (n) => 'UGX ' + Math.round(Number(n) || 0).toLocaleString('en-UG');
const cap = (s) => String(s || '').replace(/(^|[\s-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
const oneLine = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : t; };
const escHtml = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const escXml = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const ldJson = (o) => JSON.stringify(o).replace(/</g, '\\u003c');
const absUrl = (base, u) => (/^https?:\/\//i.test(u || '') ? u : base + (String(u || '').startsWith('/') ? u : '/' + u));
const catSlug = (c) => String(c || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

// Lazy so seo.js and pages.js can require each other's helpers without a circular-import problem.
const pathOf = (row) => require('./pages').productPath(row);

async function siteInfo() {
  let s = {};
  try { s = await getStoreForAdmin(); } catch (e) { /* fall back to defaults below */ }
  return {
    name: s.name || NAME, tagline: s.tagline || 'Elevate your lifestyle with authentic tech',
    phone: s.phone || '+256 751 924 844', email: s.email || 'willstechstoreug@gmail.com',
    whatsapp: s.whatsapp || '256751924844', location: s.location || 'Kampala & Mbale, Uganda', social: s.social || {},
  };
}

// ── Titles & descriptions ─────────────────────────────────────────────
// Google shows about 60 characters of title. People search "<product> price in Uganda", so that phrase goes in the title.
function productTitle(name) {
  const full = String(name || '').replace(/\s+/g, ' ').trim();
  const short = full.split(/\s[-–—]\s|[,|(]/)[0].trim() || full;          // "JBL Flip 6 Speaker - Black" → "JBL Flip 6 Speaker"
  const fits = (t) => t.length <= 62;
  const tries = [`${full} Price in Uganda${SUFFIX}`, `${short} Price in Uganda${SUFFIX}`, `${short} Price in Uganda`];
  for (const t of tries) if (fits(t)) return t;
  return `${oneLine(short, 46).replace(/…$/, '')} Price in Uganda`;       // long names: keep the words people search, drop the brand suffix
}
function productDescription(row) {
  const price = Number(row.price), was = row.original_price != null ? Number(row.original_price) : 0;
  const lead = `Buy ${oneLine(String(row.name).split(/\s[-–—]\s|,/)[0], 70)} in Uganda for ${money(price)}${was > price ? ` (was ${money(was)})` : ''}.`;
  const cta = ' Authentic. Delivered across Uganda. Pay on delivery.';
  const room = 158 - lead.length - cta.length - 1;
  const body = room > 25 ? oneLine(row.short_description || row.description, room).replace(/[…\s,;:-]+$/, '.').replace(/([.!?])\.$/, '$1') : '';
  return `${lead}${body ? ' ' + body : ''}${cta}`.slice(0, 160);
}
// What WhatsApp / Facebook / X show under the title: short, price-first, scannable.
function productShareDescription(row) {
  const price = Number(row.price), was = row.original_price != null ? Number(row.original_price) : 0;
  const stock = row.stock === 'out-of-stock' ? 'Out of stock' : row.stock === 'pre-order' ? 'Pre-order' : 'In stock';
  return `${money(price)}${was > price ? ` (was ${money(was)})` : ''} · ${stock} · Authentic · Delivered across Uganda · Pay on delivery`;
}
function categoryMeta(cat, rows) {
  const label = cap(cat), prices = rows.map((r) => Number(r.price)).filter((n) => n > 0);
  const from = prices.length ? ` from ${money(Math.min(...prices))}` : '';
  return {
    title: `Buy ${label} in Uganda${from ? ' – Best Prices' : ''}${SUFFIX}`,
    description: oneLine(`Shop ${rows.length} authentic ${label.toLowerCase()} in Uganda${from}. Delivered in Kampala, Mbale and across Uganda. Pay on delivery with MTN MoMo, Airtel Money or cash.`, 158),
    label,
  };
}

// ── Structured data ───────────────────────────────────────────────────
function orgGraph(base, info) {
  const sameAs = Object.values(info.social || {}).filter((u) => /^https?:\/\//i.test(u || ''));
  const phone = '+' + String(info.whatsapp).replace(/\D/g, '');
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': ['Organization', 'ElectronicsStore'], '@id': base + '/#org', name: info.name, alternateName: ['Wills Tech Store', 'Wills Tech Uganda', "Will's Tech"],
        url: base + '/', description: `${info.name} sells authentic smartphones, laptops, consoles, audio and gadgets in Uganda, with delivery across the country and pay on delivery (MTN MoMo, Airtel Money, cash).`,
        slogan: info.tagline, logo: { '@type': 'ImageObject', url: base + '/IMAGES/social-avatar-logo-1600.png', width: 1600, height: 1600 },
        image: base + '/IMAGES/social-share.jpg', telephone: phone, email: info.email, priceRange: 'UGX',
        address: { '@type': 'PostalAddress', addressCountry: 'UG' },
        areaServed: [{ '@type': 'City', name: 'Kampala' }, { '@type': 'City', name: 'Mbale' }, { '@type': 'Country', name: 'Uganda' }],
        currenciesAccepted: 'UGX', paymentAccepted: 'MTN Mobile Money, Airtel Money, Cash on delivery',
        openingHoursSpecification: HOURS.map((h) => ({ '@type': 'OpeningHoursSpecification', dayOfWeek: h.days, opens: h.opens, closes: h.closes })),
        contactPoint: [{ '@type': 'ContactPoint', contactType: 'customer service', telephone: phone, email: info.email, areaServed: 'UG', availableLanguage: ['English'] }],
        ...(sameAs.length ? { sameAs } : {}),
      },
      {
        '@type': 'WebSite', '@id': base + '/#website', url: base + '/', name: info.name, alternateName: ['Wills Tech Store', 'Wills Tech'], inLanguage: 'en-UG', publisher: { '@id': base + '/#org' },
        potentialAction: { '@type': 'SearchAction', target: { '@type': 'EntryPoint', urlTemplate: base + '/shop?q={search_term_string}' }, 'query-input': 'required name=search_term_string' },
      },
    ],
  };
}
const breadcrumbLd = (items) => ({
  '@context': 'https://schema.org', '@type': 'BreadcrumbList',
  itemListElement: items.map(([name, url], i) => ({ '@type': 'ListItem', position: i + 1, name, item: url })),
});
function productLd(base, row, canonicalPath) {
  const price = Number(row.price), url = base + canonicalPath;
  const images = (row.images || []).filter(Boolean).slice(0, 8).map((u) => absUrl(base, u));
  const availability = row.stock === 'out-of-stock' ? 'OutOfStock' : row.stock === 'pre-order' ? 'PreOrder' : 'InStock';
  const nextYear = new Date(Date.now() + 365 * 86400000).toISOString().slice(0, 10);
  return {
    '@context': 'https://schema.org', '@type': 'Product', '@id': url + '#product', url, name: row.name,
    ...(images.length ? { image: images } : {}),
    description: oneLine(row.description, 500) || `${row.name} at ${NAME}.`,
    ...(row.sku ? { sku: String(row.sku), mpn: String(row.sku) } : {}),
    ...(row.brand ? { brand: { '@type': 'Brand', name: row.brand } } : {}),
    ...(row.category ? { category: cap(row.category) } : {}),
    offers: {
      '@type': 'Offer', url, priceCurrency: 'UGX', price, priceValidUntil: nextYear, itemCondition: 'https://schema.org/NewCondition',
      availability: 'https://schema.org/' + availability, seller: { '@id': base + '/#org' },
    },
    ...(Number(row.rating) > 0 && row.review_count > 0 ? { aggregateRating: { '@type': 'AggregateRating', ratingValue: Number(row.rating), reviewCount: row.review_count } } : {}),
  };
}
function collectionLd(base, path, label, rows) {
  return {
    '@context': 'https://schema.org', '@type': 'CollectionPage', name: `${label} in Uganda`, url: base + path, isPartOf: { '@id': base + '/#website' },
    mainEntity: { '@type': 'ItemList', numberOfItems: rows.length, itemListElement: rows.slice(0, 50).map((r, i) => ({ '@type': 'ListItem', position: i + 1, url: base + pathOf(r), name: r.name })) },
  };
}

// ── HTML that works without JavaScript ────────────────────────────────
// The product page is drawn by script. AI crawlers (and some search bots) only read the raw HTML, so we put the real content
// in it. The storefront script replaces this block as soon as it loads, so visitors never see it twice.
function productHtml(base, row, canonicalPath) {
  const features = (Array.isArray(row.features) ? row.features : []).filter(Boolean).slice(0, 12);
  const specs = row.specifications && typeof row.specifications === 'object' ? Object.entries(row.specifications).filter(([, v]) => v).slice(0, 16) : [];
  const was = row.original_price != null ? Number(row.original_price) : 0;
  const img = (row.images || [])[0];
  const stock = row.stock === 'out-of-stock' ? 'Out of stock' : row.stock === 'pre-order' ? 'Available on pre-order' : 'In stock';
  return `<article class="pdp-ssr" itemscope itemtype="https://schema.org/Product">
    ${img ? `<img src="${escHtml(absUrl(base, img))}" alt="${escHtml(row.name)}" width="480" height="480" fetchpriority="high">` : ''}
    <div>
      ${row.category ? `<p class="pdp-ssr-cat"><a href="/shop/${escHtml(catSlug(row.category))}">${escHtml(cap(row.category))}</a>${row.brand ? ' · ' + escHtml(row.brand) : ''}</p>` : ''}
      <h1 itemprop="name">${escHtml(row.name)}</h1>
      <p class="pdp-ssr-price"><b>${money(row.price)}</b>${was > Number(row.price) ? ` <s>${money(was)}</s>` : ''} · ${stock}</p>
      <p>${escHtml(oneLine(row.description, 700))}</p>
      ${features.length ? `<ul>${features.map((f) => `<li>${escHtml(f)}</li>`).join('')}</ul>` : ''}
      ${specs.length ? `<table><tbody>${specs.map(([k, v]) => `<tr><th>${escHtml(cap(k))}</th><td>${escHtml(v)}</td></tr>`).join('')}</tbody></table>` : ''}
      <p>Authentic and brand-new. Delivered everywhere in Uganda (Kampala same day before 3 pm, Mbale next day). Pay on delivery with MTN MoMo, Airtel Money or cash.</p>
    </div>
  </article>`;
}

// A normal-looking "browse by category" block listing every product as a plain link. It gives crawlers a path to every product
// from the home page and shop page, and gives shoppers a quick index.
function catalogueHtml(rows, heading) {
  const groups = new Map();
  rows.forEach((r) => { const k = r.category || 'Other'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
  const blocks = [...groups.entries()].map(([cat, list]) => `<div><h3><a href="/shop/${escHtml(catSlug(cat))}">${escHtml(cap(cat))} in Uganda</a></h3><ul>${list.map((r) => `<li><a href="${escHtml(pathOf(r))}">${escHtml(oneLine(r.name, 80))}</a> <span>${money(r.price)}</span></li>`).join('')}</ul></div>`);
  return `<section class="section container seo-catalogue" aria-label="${escHtml(heading)}"><h2>${escHtml(heading)}</h2><div class="seo-cat-grid">${blocks.join('')}</div></section>`;
}

// ── Data ──────────────────────────────────────────────────────────────
async function activeProducts() {
  try {
    const { rows } = await pool.query(
      `SELECT id, name, description, short_description, price, original_price, images, category, brand, sku, stock, rating, review_count, date_updated
         FROM products WHERE status = 'active' ORDER BY featured DESC, date_updated DESC LIMIT 1000`);
    return rows;
  } catch (e) { return []; }
}

// ── /llms.txt: a plain, structured summary for AI assistants ──────────
async function llmsTxt(base) {
  const [info, rows] = await Promise.all([siteInfo(), activeProducts()]);
  const cats = [...new Set(rows.map((r) => r.category).filter(Boolean))];
  const L = [];
  L.push(`# ${info.name}`, '', `> ${info.name} is an online electronics store in Uganda selling authentic, brand-new smartphones, laptops, gaming consoles, speakers, earphones, power banks and creator gear. We deliver everywhere in Uganda (Kampala, Mbale and all other towns) and customers pay on delivery with MTN Mobile Money, Airtel Money or cash. Prices are in Ugandan shillings (UGX).`, '');
  L.push('## Key facts', '',
    `- Location: ${info.location}`, `- Delivery: Kampala same day for orders before 3 pm; Mbale next day; courier to the rest of Uganda (fee depends on destination)`,
    '- Payment: MTN Mobile Money, Airtel Money, cash on delivery (no card payments on the website)',
    '- Returns: faulty or not-as-described items can be reported within 30 days of delivery for repair, replacement or refund; manufacturer warranty applies where offered',
    '- Opening hours (support): Monday to Saturday 8 AM to 8 PM, Sunday 10 AM to 6 PM (East Africa Time)',
    `- WhatsApp / phone: ${info.phone}`, `- Email: ${info.email}`, '');
  L.push('## Main pages', '', `- [Shop all products](${base}/shop): full catalogue with filters`, `- [About us](${base}/about)`, `- [Delivery and payment](${base}/shipping)`, `- [Returns and warranty](${base}/returns)`, `- [FAQ](${base}/faq)`, `- [Contact](${base}/contact)`, '');
  if (cats.length) L.push('## Categories', '', ...cats.map((c) => `- [${cap(c)} in Uganda](${base}/shop/${catSlug(c)})`), '');
  L.push('## Products', '');
  rows.forEach((r) => L.push(`- [${oneLine(r.name, 110)}](${base}${pathOf(r)}): ${money(r.price)}${r.stock === 'out-of-stock' ? ', out of stock' : ', in stock'}${r.brand ? `, brand ${r.brand}` : ''}`));
  L.push('');
  return L.join('\n');
}

// ── Google Merchant Center feed (free product listings on Google) ─────
async function merchantFeed(base) {
  const [info, rows] = await Promise.all([siteInfo(), activeProducts()]);
  const items = rows.filter((r) => (r.images || []).length && Number(r.price) > 0).map((r) => {
    const imgs = r.images.map((u) => absUrl(base, u));
    const was = r.original_price != null ? Number(r.original_price) : 0;
    const avail = r.stock === 'out-of-stock' ? 'out_of_stock' : r.stock === 'pre-order' ? 'preorder' : 'in_stock';
    return `<item>
<g:id>${escXml(r.sku || r.id)}</g:id>
<g:title>${escXml(oneLine(r.name, 150))}</g:title>
<g:description>${escXml(oneLine(r.description || r.name, 4900))}</g:description>
<g:link>${escXml(base + pathOf(r))}</g:link>
<g:image_link>${escXml(imgs[0])}</g:image_link>
${imgs.slice(1, 10).map((u) => `<g:additional_image_link>${escXml(u)}</g:additional_image_link>`).join('\n')}
<g:availability>${avail}</g:availability>
<g:price>${Math.round(was > Number(r.price) ? was : Number(r.price))}.00 UGX</g:price>
${was > Number(r.price) ? `<g:sale_price>${Math.round(Number(r.price))}.00 UGX</g:sale_price>` : ''}
<g:condition>new</g:condition>
${r.brand ? `<g:brand>${escXml(r.brand)}</g:brand>` : ''}
${r.sku ? `<g:mpn>${escXml(r.sku)}</g:mpn>` : ''}
<g:identifier_exists>${r.brand && r.sku ? 'yes' : 'no'}</g:identifier_exists>
${r.category ? `<g:product_type>${escXml(cap(r.category))}</g:product_type>` : ''}
</item>`.replace(/\n{2,}/g, '\n');
  });
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0"><channel>
<title>${escXml(info.name)}</title><link>${escXml(base)}/</link><description>${escXml(info.name)} product feed</description>
${items.join('\n')}
</channel></rss>`;
}

// ── IndexNow: tells Bing (which also feeds ChatGPT search, Copilot, DuckDuckGo) and Yandex about new/changed pages at once ──
// Turn on by setting INDEXNOW_KEY in backend/.env (any 16-64 letters/digits). The key file is served at /<key>.txt.
const indexNowKey = () => { const k = (process.env.INDEXNOW_KEY || '').trim(); return /^[A-Za-z0-9-]{8,128}$/.test(k) ? k : ''; };
function pingIndexNow(paths) {
  const key = indexNowKey(); if (!key || process.env.NODE_ENV !== 'production') return;
  const base = (process.env.PUBLIC_URL || '').trim().replace(/\/$/, ''); if (!base) return;
  const urlList = (Array.isArray(paths) ? paths : [paths]).filter(Boolean).map((p) => absUrl(base, p));
  if (!urlList.length) return;
  fetch('https://api.indexnow.org/indexnow', {
    method: 'POST', headers: { 'Content-Type': 'application/json; charset=utf-8' }, signal: AbortSignal.timeout(8000),
    body: JSON.stringify({ host: new URL(base).host, key, keyLocation: `${base}/${key}.txt`, urlList }),
  }).catch((e) => console.warn('[indexnow] ping failed:', e.message));
}
const notifyProduct = (row) => { try { if (row) pingIndexNow([pathOf(row), '/shop', '/sitemap.xml']); } catch (e) { /* never block a save */ } };

module.exports = {
  NAME, SUFFIX, money, cap, oneLine, escHtml, escXml, ldJson, absUrl, catSlug, siteInfo,
  productTitle, productDescription, productShareDescription, categoryMeta,
  orgGraph, breadcrumbLd, productLd, collectionLd, productHtml, catalogueHtml,
  activeProducts, llmsTxt, merchantFeed, indexNowKey, pingIndexNow, notifyProduct,
};
