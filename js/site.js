/** site.js — store-wide constants. Edit here; every page picks it up. */
window.SITE = {
  name: "Will's Tech Store",
  whatsapp: '256751924844',
  phone: '+256 751 924 844',
  email: 'willstechstoreug@gmail.com',
  location: 'Kampala & Mbale, Uganda',
  tagline: 'Elevate your lifestyle with authentic tech',
  // Payment icons shown in the footer (files live in IMAGES/pay/). Only list what the store really accepts.
  // The site currently takes MoMo, Airtel Money and cash only. To show cards later, add:
  //   { name: 'Visa', icon: 'visa.svg' }, { name: 'Mastercard', icon: 'mastercard.svg' }
  payments: [
    { name: 'MTN MoMo', icon: 'mtn-momo.png' },
    { name: 'Airtel Money', icon: 'airtel-money.png' },
    { name: 'Cash on delivery', icon: 'cash.svg' },
  ],
  // 0 = no free-delivery offer is advertised. Set e.g. 100000 to show "Free delivery on orders over UGX 100,000"
  // (zones marked freeOverThreshold in backend/src/shopConfig.js get their fee waived above that subtotal).
  freeDeliveryThreshold: 0,
  // Only networks with a URL are shown in the footer. WhatsApp is always shown.
  social: {
    instagram: 'https://instagram.com/willstech.store',
    x: 'https://x.com/willstech_store',
    tiktok: 'https://www.tiktok.com/@willstech.store',
    youtube: '',
    facebook: '',
  },
  // Optional: pin which products the hero slider shows (product ids, in order). Leave empty for automatic.
  heroProductIds: [],
};
