/**
 * layout.js — injects the shared chrome (announcement bar, header with categories + help menus, mobile drawer + tab bar,
 * search panel, mini-cart, footer) and then boots the cart + catalogue.
 * Load it AFTER utils.js, cart.js, products.js, compare.js and BEFORE page scripts / auth-init.js.
 * Pages only need:  <div id="site-footer"></div>  and  <main id="main-content">…</main>
 */
(function () {
  'use strict';
  const S = window.SITE || {};
  const R = WT.root;
  const here = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const qs = new URLSearchParams(location.search);
  const root = document.documentElement;
  try { const t = localStorage.getItem('wt-theme'); if (t) root.dataset.theme = t; } catch (e) { /* ignore */ }
  const effectiveTheme = () => root.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const SHOP = WT.page('shop.html');

  const NAV = [
    { href: SHOP, label: 'Shop', icon: 'fa-bag-shopping', on: () => here === 'shop.html' && !qs.get('filter') && !qs.get('category') },
    { href: SHOP + '?filter=new', label: 'New in', icon: 'fa-bolt', on: () => here === 'shop.html' && qs.get('filter') === 'new' },
    { href: SHOP + '?filter=bestseller', label: 'Best sellers', icon: 'fa-fire', on: () => here === 'shop.html' && qs.get('filter') === 'bestseller' },
    { href: SHOP + '?filter=sale', label: 'Deals', icon: 'fa-tag', on: () => here === 'shop.html' && qs.get('filter') === 'sale' },
    { href: WT.page('about.html'), label: 'About', icon: 'fa-store', on: () => here === 'about.html' },
  ];
  const HEADER_NAV = NAV.filter((n) => ['New in', 'Deals', 'About'].includes(n.label));
  const navLinks = (cls, list) => (list || NAV).map((n) => `<a ${cls ? `class="${cls}${n.on() ? ' active' : ''}"` : (n.on() ? 'class="active"' : '')} href="${n.href}" ${n.on() ? 'aria-current="page"' : ''}>${cls ? `<i class="fa-solid ${n.icon}"></i>` : ''}${n.label}</a>`).join('');

  // WhatsApp is deliberately NOT in this row: it lives in the Help menu and the contact details, so it isn't repeated everywhere.
  const SOCIAL = [
    ['instagram', 'fa-brands fa-instagram', 'Follow us on Instagram', S.social && S.social.instagram],
    ['x', 'fa-brands fa-x-twitter', 'Follow us on X', S.social && S.social.x],
    ['tiktok', 'fa-brands fa-tiktok', 'Follow us on TikTok', S.social && S.social.tiktok],
    ['youtube', 'fa-brands fa-youtube', 'Subscribe on YouTube', S.social && S.social.youtube],
    ['facebook', 'fa-brands fa-facebook-f', 'Follow us on Facebook', S.social && S.social.facebook],
  ].filter((s) => s[3]).map((s) => `<a href="${s[3]}" target="_blank" rel="noopener noreferrer" data-net="${s[0]}" aria-label="${s[2]}"><i class="${s[1]}"></i></a>`).join('');

  const HELP = `
    <div class="help-pop" id="help-pop" role="dialog" aria-label="Contact and help" hidden>
      <b class="help-title">Need help choosing or ordering?</b>
      <a class="help-row" href="${WT.waLink('Hi Will\'s Tech! I need help choosing something.')}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp wa"></i><div><b>Chat on WhatsApp</b><span>${S.phone}</span></div></a>
      <a class="help-row" href="tel:${String(S.phone).replace(/\s/g, '')}"><i class="fa-solid fa-phone"></i><div><b>Call us</b><span>${S.phone}</span></div></a>
      <a class="help-row" href="mailto:${S.email}"><i class="fa-regular fa-envelope"></i><div><b>Email</b><span>${S.email}</span></div></a>
      <div class="help-hours"><i class="fa-regular fa-clock"></i><span>Mon to Sat 8 AM to 8 PM<br>Sunday 10 AM to 6 PM</span></div>
      <div class="help-links"><a href="${WT.page('track-order.html')}">Track an order</a><a href="${WT.page('faq.html')}">FAQ</a><a href="${WT.page('contact.html')}">Contact form</a></div>
    </div>`;

  const header = `
  <a class="skip-link" href="#main-content">Skip to content</a>
  <div class="scroll-progress" id="scroll-progress"></div>
  <div class="announce" id="announce"><div class="announce-inner">
    <div class="announce-rotor" id="announce-rotor" aria-live="off">
      <span class="on"><i class="fa-solid fa-truck-fast"></i>${S.freeDeliveryThreshold > 0 ? `Free delivery on orders over ${formatPrice(S.freeDeliveryThreshold)}` : 'We deliver everywhere in Uganda'}</span>
      <span><i class="fa-solid fa-shield-halved"></i>100% authentic, brand-new and sealed</span>
      <span><i class="fa-solid fa-wallet"></i>Pay on delivery: MTN MoMo, Airtel Money or cash</span>
    </div>
    <button class="announce-close" id="announce-close" aria-label="Dismiss announcement"><i class="fa-solid fa-xmark"></i></button>
  </div></div>
  <header class="site-header" id="main-header">
    <div class="container header-inner">
      <button class="icon-btn menu-toggle" id="mobile-menu-btn" aria-label="Open menu" aria-expanded="false" aria-controls="mobile-nav"><i class="fa-solid fa-bars" id="hamburger-icon"></i><i class="fa-solid fa-xmark" id="close-icon" style="display:none"></i></button>
      <a class="brand" href="${R}index.html" aria-label="${S.name} home">
        <span class="brand-mark"><img src="${R}IMAGES/logo2.png" alt="" onerror="this.replaceWith(Object.assign(document.createElement('i'),{className:'fa-solid fa-bolt'}))"></span>
        <span class="brand-text">Will's <span>Tech</span></span>
      </a>
      <button class="cat-btn" id="cat-btn" aria-expanded="false" aria-controls="cat-menu"><i class="fa-solid fa-table-cells-large"></i><span>Categories</span><i class="fa-solid fa-chevron-down chev"></i></button>
      <nav class="main-nav" aria-label="Main">${navLinks('', HEADER_NAV)}</nav>
      <button class="search-pill" id="search-btn" aria-label="Search products"><i class="fa-solid fa-magnifying-glass"></i><span>Search products…</span><kbd>Ctrl K</kbd></button>
      <div class="header-actions">
        <button class="icon-btn search-icon" data-search aria-label="Search products"><i class="fa-solid fa-magnifying-glass"></i></button>
        <div class="help-wrap">
          <button class="help-btn" id="help-btn" aria-expanded="false" aria-controls="help-pop"><i class="fa-solid fa-headset"></i><span>Help</span></button>${HELP}
        </div>
        <button class="icon-btn theme-toggle" id="theme-toggle" aria-label="Switch colour theme"><i class="fa-solid fa-moon"></i></button>
        <a href="${WT.page('wishlist.html')}" class="icon-btn wish-link" id="wish-link" aria-label="Wishlist"><i class="fa-regular fa-heart"></i><span class="cart-badge wish-badge" id="wish-badge" hidden>0</span></a>
        <div class="account-menu" id="account-menu">
          <a href="${WT.page('account.html')}" class="icon-btn account-btn" id="account-btn" aria-label="My account" aria-haspopup="menu" aria-expanded="false" aria-controls="account-menu-panel">
            <i class="fa-regular fa-user account-icon" id="account-icon"></i>
            <img src="" alt="" class="account-avatar" id="account-avatar" style="display:none">
          </a>
          <div class="account-menu-panel" id="account-menu-panel" role="menu" aria-label="Account menu" hidden></div>
        </div>
        <a href="${WT.page('cart.html')}" class="icon-btn cart-btn" id="cart-btn" aria-label="Shopping cart"><i class="fa-solid fa-bag-shopping"></i><span class="cart-badge" id="cart-badge" data-cart hidden>0</span></a>
      </div>
    </div>
    <div class="cat-menu" id="cat-menu" hidden><div class="container cat-menu-inner" id="cat-menu-inner"><div class="skeleton" style="height:180px;grid-column:1/-1"></div></div></div>
  </header>

  <div class="scrim" id="scrim"></div>
  <nav class="mobile-nav" id="mobile-nav" aria-label="Mobile" aria-hidden="true">
    <div class="mobile-nav-head">
      <span class="brand-text">Will's <span>Tech</span></span>
      <button class="icon-btn" id="mobile-nav-close" aria-label="Close menu"><i class="fa-solid fa-xmark"></i></button>
    </div>
    <details class="m-cats" id="m-cats"><summary class="nav-link"><i class="fa-solid fa-table-cells-large"></i>Categories<i class="fa-solid fa-chevron-down chev"></i></summary><div class="m-cat-list" id="m-cat-list"></div></details>
    ${navLinks('nav-link')}
    <a class="nav-link" href="${WT.page('track-order.html')}"><i class="fa-solid fa-truck-fast"></i>Track an order</a>
    <a class="nav-link" href="${WT.page('contact.html')}"><i class="fa-solid fa-headset"></i>Contact &amp; help</a>
    <a class="nav-link" href="${WT.page('faq.html')}"><i class="fa-solid fa-circle-question"></i>FAQ</a>
    <div class="mobile-nav-foot">
      <div class="m-help"><a class="btn btn-secondary" href="${WT.waLink('Hi Will\'s Tech! I need help.')}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp" style="color:var(--signal)"></i> Chat</a><a class="btn btn-secondary" href="tel:${String(S.phone).replace(/\s/g, '')}"><i class="fa-solid fa-phone"></i> Call</a></div>
      <button class="btn btn-ghost btn-block" id="theme-toggle-m"><i class="fa-solid fa-moon"></i> <span>Dark mode</span></button>
    </div>
  </nav>

  <section class="search-panel" id="search-section" aria-label="Search" role="search">
    <div class="container">
      <div class="search-row">
        <div class="search-input-wrap">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="text" class="search-input" id="search-input" placeholder="Search phones, speakers, power banks…" autocomplete="off" aria-label="Search products">
          <button class="search-clear-btn" id="search-clear-btn" aria-label="Clear search"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <button class="icon-btn search-close" id="search-close" aria-label="Close search"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="search-results" id="search-results" aria-live="polite"></div>
    </div>
  </section>

  <aside class="cart-drawer" id="cart-drawer" aria-label="Your cart" aria-hidden="true">
    <div class="cart-drawer-head"><h2>Your cart</h2><button class="icon-btn" id="cart-drawer-close" aria-label="Close cart"><i class="fa-solid fa-xmark"></i></button></div>
    <div id="cart-drawer-ship"></div>
    <div class="cart-drawer-body" id="cart-drawer-body"></div>
    <div class="cart-drawer-foot" id="cart-drawer-foot"></div>
  </aside>

  <nav class="tabbar" id="tabbar" aria-label="Quick navigation">
    <a href="${R}index.html" class="${here === 'index.html' ? 'active' : ''}"><i class="fa-solid fa-house"></i><span>Home</span></a>
    <a href="${SHOP}" class="${here === 'shop.html' ? 'active' : ''}"><i class="fa-solid fa-table-cells-large"></i><span>Shop</span></a>
    <button data-search><i class="fa-solid fa-magnifying-glass"></i><span>Search</span></button>
    <a href="${WT.page('cart.html')}" id="tab-cart" class="${here === 'cart.html' ? 'active' : ''}"><i class="fa-solid fa-bag-shopping"></i><span class="cart-badge" data-cart hidden>0</span><span>Cart</span></a>
    <a href="${WT.page('account.html')}" class="${here === 'account.html' ? 'active' : ''}"><i class="fa-regular fa-user"></i><span>Account</span></a>
  </nav>`;

  const PAYMENTS = (S.payments || []).map((p) => `<span class="pay-icon" title="${p.name}"><img src="${R}IMAGES/pay/${p.icon}" alt="${p.name}" width="64" height="40" loading="lazy" decoding="async"></span>`).join('');
  const footer = `
  <footer class="site-footer" role="contentinfo">
    <div class="container">
      <div class="footer-news">
        <div><h3>Restock alerts and deals, before they sell out</h3><p>One short email when something good lands. No spam.</p></div>
        <form class="news-form" id="news-form" novalidate>
          <input class="form-input" type="email" id="news-email" placeholder="Your email address" autocomplete="email" aria-label="Email address" required>
          <button class="btn btn-primary" type="submit">Subscribe</button>
        </form>
      </div>
      <div class="footer-top">
        <div class="footer-brand">
          <a class="brand" href="${R}index.html"><span class="brand-text">Will's <span>Tech</span></span></a>
          <p class="footer-tag">${S.tagline || ''}</p>
          <p>We are your go-to for authentic tech: genuine smartphones, audio and gadgets, delivered everywhere in Uganda.</p>
          <div class="footer-contact">
            <a href="${WT.waLink()}" target="_blank" rel="noopener"><i class="fa-brands fa-whatsapp"></i>${S.phone}</a>
            <a href="mailto:${S.email}"><i class="fa-regular fa-envelope"></i>${S.email}</a>
            <a href="${WT.page('contact.html')}"><i class="fa-solid fa-location-dot"></i>${S.location}</a>
            <span class="footer-hours"><i class="fa-regular fa-clock"></i>Mon to Sat 8 AM to 8 PM · Sun 10 AM to 6 PM</span>
          </div>
          <div class="social">${SOCIAL}</div>
        </div>
        <div class="footer-col"><h4>Shop</h4><ul>
          <li><a href="${SHOP}">All products</a></li>
          <li><a href="${SHOP}?filter=new">New in</a></li>
          <li><a href="${SHOP}?filter=bestseller">Best sellers</a></li>
          <li><a href="${SHOP}?filter=sale">Deals</a></li>
          <li class="f-cats"></li>
        </ul></div>
        <div class="footer-col"><h4>Help</h4><ul>
          <li><a href="${WT.page('track-order.html')}">Track an order</a></li>
          <li><a href="${WT.page('shipping.html')}">Delivery &amp; payment</a></li>
          <li><a href="${WT.page('returns.html')}">Returns &amp; warranty</a></li>
          <li><a href="${WT.page('faq.html')}">FAQ</a></li>
          <li><a href="${WT.page('contact.html')}">Contact us</a></li>
        </ul></div>
        <div class="footer-col"><h4>We accept</h4>
          <div class="pay-row">${PAYMENTS}</div>
          <p class="pay-note">Pay on delivery with MoMo, Airtel Money or cash.</p>
          <h4 style="margin-top:26px">Company</h4><ul>
          <li><a href="${WT.page('about.html')}">About us</a></li>
          <li><a href="${WT.page('wishlist.html')}">Wishlist</a></li>
          <li><a href="${WT.page('account.html')}">My account</a></li>
        </ul></div>
      </div>
      <div class="footer-bottom">
        <span>&copy; ${new Date().getFullYear()} ${S.name}. All rights reserved.</span>
        <nav aria-label="Legal"><a href="${WT.page('privacy.html')}">Privacy</a><a href="${WT.page('terms.html')}">Terms</a><a href="${WT.page('cookies.html')}">Cookies</a></nav>
      </div>
    </div>
  </footer>
  <button class="to-top" id="to-top" aria-label="Back to top"><i class="fa-solid fa-arrow-up"></i></button>`;

  // ── Inject ─────────────────────────────────────────────
  if (!document.querySelector('link[href*="font-awesome"]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'; document.head.appendChild(l);
  }
  document.body.insertAdjacentHTML('afterbegin', header);
  const slot = document.getElementById('site-footer');
  if (slot) slot.outerHTML = footer; else document.body.insertAdjacentHTML('beforeend', footer);

  // ── Behaviour ──────────────────────────────────────────
  const $ = (id) => document.getElementById(id);
  const body = document.body, scrim = $('scrim');
  const lock = (on) => { body.style.overflow = on ? 'hidden' : ''; };
  const anyOverlay = () => $('mobile-nav').classList.contains('open') || $('cart-drawer').classList.contains('open') || body.classList.contains('search-open');
  function closeAll() { closeMenu(); closeCart(); closeSearch(); closeCats(); closeHelp(); scrim.classList.remove('show'); lock(false); }

  // mobile drawer
  const menu = $('mobile-nav'), menuBtn = $('mobile-menu-btn');
  function openMenu() { closeCart(); closeSearch(); menu.classList.add('open'); menu.setAttribute('aria-hidden', 'false'); scrim.classList.add('show'); menuBtn.setAttribute('aria-expanded', 'true'); lock(true); }
  function closeMenu() { menu.classList.remove('open'); menu.setAttribute('aria-hidden', 'true'); menuBtn.setAttribute('aria-expanded', 'false'); if (!anyOverlay()) { scrim.classList.remove('show'); lock(false); } }
  menuBtn.addEventListener('click', openMenu); $('mobile-nav-close').addEventListener('click', closeMenu);
  menu.addEventListener('click', (e) => { if (e.target.closest('a')) closeMenu(); });

  // search (header pill, icon and tab bar all open the same panel)
  function openSearch() { closeMenu(); closeCart(); closeCats(); closeHelp(); body.classList.add('search-open'); scrim.classList.add('show'); lock(true); setTimeout(() => $('search-input').focus(), 60); }
  function closeSearch() { body.classList.remove('search-open'); if (!anyOverlay()) { scrim.classList.remove('show'); lock(false); } }
  document.querySelectorAll('[data-search], #search-btn').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); body.classList.contains('search-open') ? closeSearch() : openSearch(); }));
  $('search-close').addEventListener('click', closeSearch);
  $('search-section').addEventListener('click', (e) => { if (e.target.closest('a[href]')) closeSearch(); });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
    if (e.key === 'Escape') closeAll();
  });
  scrim.addEventListener('click', closeAll);

  // categories mega menu (desktop)
  const catBtn = $('cat-btn'), catMenu = $('cat-menu');
  function openCats() { closeHelp(); closeSearch(); catMenu.hidden = false; catBtn.setAttribute('aria-expanded', 'true'); catBtn.classList.add('open'); }
  function closeCats() { catMenu.hidden = true; catBtn.setAttribute('aria-expanded', 'false'); catBtn.classList.remove('open'); }
  catBtn.addEventListener('click', (e) => { e.stopPropagation(); catMenu.hidden ? openCats() : closeCats(); });
  catMenu.addEventListener('click', (e) => { if (e.target.closest('a')) closeCats(); });

  // help popover (the one place for chat / call / email)
  const helpBtn = $('help-btn'), helpPop = $('help-pop');
  function openHelp() { closeCats(); helpPop.hidden = false; helpBtn.setAttribute('aria-expanded', 'true'); }
  function closeHelp() { helpPop.hidden = true; helpBtn.setAttribute('aria-expanded', 'false'); }
  helpBtn.addEventListener('click', (e) => { e.stopPropagation(); helpPop.hidden ? openHelp() : closeHelp(); });
  helpPop.addEventListener('click', (e) => e.stopPropagation());
  document.addEventListener('click', (e) => { if (!e.target.closest('#cat-menu') && !e.target.closest('#cat-btn')) closeCats(); closeHelp(); });

  function buildCategoryMenus() {
    const cats = Products.categories(), total = Products.active().length, bud = Products.budgets().filter((b) => b.count > 0);
    const catLink = (c) => `<a class="cm-cat" href="${SHOP}?category=${encodeURIComponent(c.name)}"><span class="ic"><i class="fa-solid ${WT.categoryIcon(c.name)}"></i></span><span><b>${escapeHTML(WT.cap(c.name))}</b><small>${c.count} item${c.count === 1 ? '' : 's'}</small></span></a>`;
    $('cat-menu-inner').innerHTML = `
      <div class="cm-col"><h4>Categories</h4><div class="cm-grid"><a class="cm-cat all" href="${SHOP}"><span class="ic"><i class="fa-solid fa-bag-shopping"></i></span><span><b>All products</b><small>${total} items</small></span></a>${cats.map(catLink).join('')}</div></div>
      <div class="cm-col"><h4>Shop by budget</h4><div class="cm-list">${bud.map((b) => `<a href="${b.href}"><span>${b.label}</span><small>${b.count}</small></a>`).join('')}</div></div>
      <div class="cm-col"><h4>Popular</h4><div class="cm-list"><a href="${SHOP}?filter=new"><span>New in</span><i class="fa-solid fa-arrow-right"></i></a><a href="${SHOP}?filter=bestseller"><span>Best sellers</span><i class="fa-solid fa-arrow-right"></i></a><a href="${SHOP}?filter=sale"><span>Deals</span><i class="fa-solid fa-arrow-right"></i></a>${Products.brands().slice(0, 3).map((b) => `<a href="${SHOP}?brand=${encodeURIComponent(b.name)}"><span>${escapeHTML(b.name)}</span><small>${b.count}</small></a>`).join('')}</div></div>`;
    $('m-cat-list').innerHTML = `<a href="${SHOP}">All products <small>${total}</small></a>` + cats.map((c) => `<a href="${SHOP}?category=${encodeURIComponent(c.name)}">${escapeHTML(WT.cap(c.name))} <small>${c.count}</small></a>`).join('');
    const fc = document.querySelector('.f-cats'); if (fc) fc.outerHTML = cats.map((c) => `<li><a href="${SHOP}?category=${encodeURIComponent(c.name)}">${escapeHTML(WT.cap(c.name))}</a></li>`).join('');
  }

  // mini cart
  const drawer = $('cart-drawer');
  function openCart() { closeMenu(); closeSearch(); closeCats(); closeHelp(); drawer.classList.add('open'); drawer.setAttribute('aria-hidden', 'false'); scrim.classList.add('show'); lock(true); renderDrawer(); $('cart-drawer-close').focus(); }
  function closeCart() { drawer.classList.remove('open'); drawer.setAttribute('aria-hidden', 'true'); if (!anyOverlay()) { scrim.classList.remove('show'); lock(false); } }
  WT.openCart = openCart; WT.closeCart = closeCart;
  $('cart-drawer-close').addEventListener('click', closeCart);
  const onCartPage = here === 'cart.html' || here === 'checkout.html';
  document.querySelectorAll('#cart-btn, #tab-cart').forEach((a) => a.addEventListener('click', (e) => { if (!onCartPage) { e.preventDefault(); openCart(); } }));

  function renderDrawer() {
    const items = Cart.getItems(), sub = Cart.getTotal(), th = S.freeDeliveryThreshold || 0, gone = items.filter((i) => Cart.isUnavailable(i.productId)).length;
    $('cart-drawer-ship').innerHTML = items.length && th > 0 ? (sub >= th
      ? `<div class="free-ship"><span><i class="fa-solid fa-circle-check" style="color:var(--signal)"></i> You've unlocked free delivery</span><div class="free-ship-bar"><span style="width:100%"></span></div></div>`
      : `<div class="free-ship"><span>Add <b>${formatPrice(th - sub)}</b> more for free delivery</span><div class="free-ship-bar"><span style="width:${Math.min(100, sub / th * 100).toFixed(0)}%"></span></div></div>`) : '';
    $('cart-drawer-body').innerHTML = items.length ? items.map((i) => { const g = Cart.isUnavailable(i.productId); return `
      <div class="mini-item${g ? ' is-gone' : ''}" data-id="${escapeHTML(i.productId)}">
        <img src="${escapeHTML(WT.img(i.image))}" data-fallback="${escapeHTML(WT.imgOriginal(i.image))}" alt="" loading="lazy">
        <div>
          <div class="mini-item-name">${escapeHTML(i.name)}</div>
          ${g ? '<div class="gone-note"><i class="fa-solid fa-circle-exclamation"></i> No longer available</div>'
              : `<div class="qty"><button data-act="dec" aria-label="Decrease quantity"><i class="fa-solid fa-minus"></i></button><span>${i.quantity}</span><button data-act="inc" aria-label="Increase quantity"${i.quantity >= Cart.MAX_QTY ? ' disabled' : ''}><i class="fa-solid fa-plus"></i></button></div>`}
        </div>
        <div style="text-align:right"><div class="mini-item-price">${g ? '' : formatPrice(i.price * i.quantity)}</div><button class="link-btn" data-act="rm">Remove</button></div>
      </div>`; }).join('') : `<div class="drawer-empty"><i class="fa-solid fa-bag-shopping"></i><h3>Your cart is empty</h3><p>Find something you like and it will wait for you here.</p><a class="btn btn-primary" href="${SHOP}">Start shopping</a></div>`;
    $('cart-drawer-foot').innerHTML = items.length ? `
      ${gone ? '<div class="err-box" style="font-size:13.5px"><i class="fa-solid fa-circle-exclamation"></i><span>Some items are no longer available. Remove them to check out.</span></div>' : ''}
      <div style="display:flex;justify-content:space-between;font-weight:800;font-size:18px"><span>Subtotal</span><span style="font-family:var(--font-display)">${formatPrice(sub)}</span></div>
      <p class="form-hint" style="margin:-4px 0 0">Delivery and discount codes are added at checkout.</p>
      ${gone ? '<button class="btn btn-dark btn-lg btn-block" id="drawer-clean">Remove unavailable items</button>' : `<a class="btn btn-primary btn-lg btn-block" href="${WT.page('checkout.html')}">Checkout</a>`}
      <a class="btn btn-secondary btn-block" href="${WT.page('cart.html')}">View full cart</a>` : '';
  }
  $('cart-drawer-body').addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]'); if (!b) return;
    const id = b.closest('.mini-item').dataset.id; const it = Cart.getItems().find((x) => String(x.productId) === id); if (!it) return;
    if (b.dataset.act === 'inc') Cart.updateQuantity(id, it.quantity + 1); else if (b.dataset.act === 'dec') Cart.updateQuantity(id, it.quantity - 1); else Cart.removeItem(id);
  });
  $('cart-drawer-foot').addEventListener('click', (e) => { if (e.target.closest('#drawer-clean')) Cart.removeUnavailable(); });
  document.addEventListener('cart-updated', () => { if (drawer.classList.contains('open')) renderDrawer(); });

  // theme
  function paintTheme() {
    const dark = effectiveTheme() === 'dark';
    $('theme-toggle').innerHTML = `<i class="fa-solid ${dark ? 'fa-sun' : 'fa-moon'}"></i>`;
    $('theme-toggle-m').innerHTML = `<i class="fa-solid ${dark ? 'fa-sun' : 'fa-moon'}"></i> <span>${dark ? 'Light mode' : 'Dark mode'}</span>`;
    const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = dark ? '#0C111D' : '#F4F5F7';
  }
  function toggleTheme() { const next = effectiveTheme() === 'dark' ? 'light' : 'dark'; root.dataset.theme = next; try { localStorage.setItem('wt-theme', next); } catch (e) { /* ignore */ } paintTheme(); document.dispatchEvent(new CustomEvent('wt:theme', { detail: next })); }
  $('theme-toggle').addEventListener('click', toggleTheme); $('theme-toggle-m').addEventListener('click', toggleTheme); paintTheme();

  // announcement: rotate through the three promises
  try { if (sessionStorage.getItem('wt-announce') === '0') $('announce').remove(); } catch (e) { /* ignore */ }
  const rotor = $('announce-rotor');
  if (rotor) {
    const spans = [...rotor.children]; let k = 0;
    if (!matchMedia('(prefers-reduced-motion: reduce)').matches) setInterval(() => { spans[k].classList.remove('on'); k = (k + 1) % spans.length; spans[k].classList.add('on'); }, 4200);
  }
  const ann = $('announce-close'); if (ann) ann.addEventListener('click', () => { $('announce').remove(); try { sessionStorage.setItem('wt-announce', '0'); } catch (e) { /* ignore */ } });

  // header shadow, progress bar, back to top
  const hdr = $('main-header'), bar = $('scroll-progress'), top = $('to-top');
  function onScroll() {
    const y = window.scrollY, h = document.documentElement.scrollHeight - innerHeight;
    hdr.classList.toggle('scrolled', y > 8); top.classList.toggle('show', y > 700); bar.style.width = (h > 0 ? y / h * 100 : 0) + '%';
  }
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  top.addEventListener('click', () => scrollTo({ top: 0, behavior: 'smooth' }));

  // wishlist count (set by auth-init once the wishlist is known)
  WT.setWishlistCount = (n) => { const b = $('wish-badge'); if (!b) return; b.textContent = n; b.hidden = !n; };

  // newsletter
  const nf = $('news-form');
  nf.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = $('news-email').value.trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showNotification('Please enter a valid email address.', 'error');
    const btn = nf.querySelector('button'); btn.disabled = true;
    try { await window.apiFetch('/shop/newsletter', { method: 'POST', body: JSON.stringify({ email, source: 'footer' }) }); nf.innerHTML = '<p class="news-thanks"><i class="fa-solid fa-circle-check"></i> You\'re on the list. Thank you!</p>'; }
    catch (err) { btn.disabled = false; showNotification(err.message || 'Could not subscribe right now.', 'error'); }
  });

  // storage notice
  try {
    if (!localStorage.getItem('wt-cookie-ok')) {
      const c = createElement('div', 'cookie-bar');
      c.innerHTML = `<div>We use your browser's storage to remember your cart and theme. No ad tracking. <a href="${WT.page('cookies.html')}">Details</a></div><div class="row"><button class="btn btn-primary btn-sm" id="cookie-ok">Got it</button></div>`;
      document.body.appendChild(c);
      c.querySelector('#cookie-ok').addEventListener('click', () => { localStorage.setItem('wt-cookie-ok', '1'); c.remove(); });
    }
  } catch (e) { /* ignore */ }

  // ── Boot ───────────────────────────────────────────────
  Cart.init();
  if (window.Search && Search.init) { try { Search.init(); } catch (e) { console.warn('[Search] init failed', e); } }
  if (WT.Compare) WT.Compare.init();
  Products.init().then(() => {
    buildCategoryMenus();
    // Catch price changes / delisted items on EVERY page, not just the cart.
    if (Products.allProducts.length) { const r = Cart.reconcile(Products.allProducts); if (r.changed.length) showNotification('Some prices in your cart were updated.', 'info', { label: 'Review', href: WT.page('cart.html') }); }
  });
})();
