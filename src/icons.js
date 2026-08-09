'use strict';

/**
 * High-stability professional CDN links for payment and brand logos.
 * Using Wikipedia and PayMongo CDNs which are highly reliable.
 */
const ICONS = {
  // E-Wallets & Digital Payments
  gcash: '/static/img/payments/gcash.svg',
  maya: '/static/img/payments/maya.svg',
  paymaya: '/static/img/payments/maya.svg',
  grabpay: '/static/img/payments/paymongo.svg',
  grab: '/static/img/payments/paymongo.svg',
  shopeepay: '/static/img/payments/paymongo.svg',
  shopee: '/static/img/payments/paymongo.svg',
  coins: '/static/img/payments/paymongo.svg',
  'coins.ph': '/static/img/payments/paymongo.svg',
  coinsph: '/static/img/payments/paymongo.svg',
  paymongo: '/static/img/payments/paymongo.svg',
  xendit: '/static/img/payments/xendit.svg',
  swiftpay: '/static/img/payments/swiftpay.svg',
  swiftpayph: '/static/img/payments/swiftpay.svg',
  'swiftpay ph': '/static/img/payments/swiftpay.svg',
  alipay: '/static/img/payments/paymongo.svg',
  'alipay pay': '/static/img/payments/paymongo.svg',
  wechat: '/static/img/payments/paymongo.svg',
  'wechat pay': '/static/img/payments/paymongo.svg',
  billease: '/static/img/payments/paymongo.svg',

  // Cards
  visa: '/static/img/payments/visa.svg',
  mastercard: '/static/img/payments/mastercard.svg',
  jcb: '/static/img/payments/paymongo.svg',
  amex: '/static/img/payments/paymongo.svg',

  // Banks (PH & International)
  bpi: '/static/img/payments/paymongo.svg',
  unionbank: '/static/img/payments/paymongo.svg',
  'union bank': '/static/img/payments/paymongo.svg',
  bdo: '/static/img/payments/paymongo.svg',
  metrobank: '/static/img/payments/paymongo.svg',
  rcbc: '/static/img/payments/paymongo.svg',
  landbank: '/static/img/payments/paymongo.svg',
  securitybank: '/static/img/payments/paymongo.svg',
  chinabank: '/static/img/payments/paymongo.svg',
  pnb: '/static/img/payments/paymongo.svg',

  // Other
  paypal: '/static/img/payments/paymongo.svg',
  binance: '/static/img/payments/paymongo.svg',
  usdt: '/static/img/payments/paymongo.svg',
  bitcoin: '/static/img/payments/paymongo.svg',
  ethereum: '/static/img/payments/paymongo.svg',
  telegram: '/static/img/payments/paymongo.svg',
  gcash_pro: '/static/img/payments/gcash.svg',
  maya_pro: '/static/img/payments/maya.svg'
};

function getIcon(name, dbIconUrl) {
  if (dbIconUrl) return dbIconUrl;
  const search = (name || '').toLowerCase().trim();

  // Custom keyword mappings for better fuzzy matching
  const keywords = {
    'g-cash': 'gcash',
    'paymaya': 'maya',
    'coinsph': 'coins.ph',
    'union bank': 'unionbank'
  };

  const normalized = keywords[search] || search;

  // Try exact match first
  if (ICONS[normalized]) return ICONS[normalized];

  // Then try substring match
  for (const key in ICONS) {
    if (normalized.includes(key)) return ICONS[key];
  }

  return null;
}

module.exports = {
  ICONS,
  getIcon
};
