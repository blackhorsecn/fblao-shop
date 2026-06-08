'use strict';

/**
 * High-stability professional CDN links for payment and brand logos.
 * Using Wikipedia and PayMongo CDNs which are highly reliable.
 */
const ICONS = {
  // E-Wallets & Digital Payments
  gcash: 'https://cdn.paymongo.com/images/gcash.png',
  maya: 'https://cdn.paymongo.com/images/maya.png',
  paymaya: 'https://cdn.paymongo.com/images/maya.png',
  grabpay: 'https://cdn.paymongo.com/images/grabpay.png',
  grab: 'https://cdn.paymongo.com/images/grabpay.png',
  shopeepay: 'https://cdn.paymongo.com/images/shopeepay.png',
  shopee: 'https://cdn.paymongo.com/images/shopeepay.png',
  coins: 'https://static.coingecko.com/s/exchanges/images/1114/large/coinsph.png',
  'coins.ph': 'https://static.coingecko.com/s/exchanges/images/1114/large/coinsph.png',
  coinsph: 'https://static.coingecko.com/s/exchanges/images/1114/large/coinsph.png',
  paymongo: 'https://cdn.paymongo.com/images/paymongo-logo.png',
  xendit: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/Xendit_Logo.png/220px-Xendit_Logo.png',
  billease: 'https://cdn.paymongo.com/images/billease.png',

  // Cards
  visa: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d6/Visa_2021.svg/220px-Visa_2021.svg.png',
  mastercard: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Mastercard-logo.svg/220px-Mastercard-logo.svg.png',
  jcb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/JCB_logo.svg/220px-JCB_logo.svg.png',
  amex: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/American_Express_logo_%282018%29.svg/220px-American_Express_logo_%282018%29.svg.png',

  // Banks (PH & International)
  bpi: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ee/BPI_Logo.svg/220px-BPI_Logo.svg.png',
  unionbank: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/UnionBank_of_the_Philippines_logo.svg/220px-UnionBank_of_the_Philippines_logo.svg.png',
  'union bank': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/UnionBank_of_the_Philippines_logo.svg/220px-UnionBank_of_the_Philippines_logo.svg.png',
  bdo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/BDO_Unibank_%28logo%29.svg/220px-BDO_Unibank_%28logo%29.svg.png',
  metrobank: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Metrobank_%28Philippines%29_logo.svg/220px-Metrobank_%28Philippines%29_logo.svg.png',
  rcbc: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/RCBC_logo.svg/220px-RCBC_logo.svg.png',
  landbank: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Land_Bank_of_the_Philippines_logo.svg/220px-Land_Bank_of_the_Philippines_logo.svg.png',
  securitybank: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Security_Bank_logo.svg/220px-Security_Bank_logo.svg.png',
  chinabank: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/China_Bank_logo.svg/220px-China_Bank_logo.svg.png',
  pnb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Philippine_National_Bank_logo.svg/220px-Philippine_National_Bank_logo.svg.png',

  // Other
  paypal: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/PayPal.svg/220px-PayPal.svg.png',
  binance: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Binance_Logo.svg/220px-Binance_Logo.svg.png',
  usdt: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Tether_Logo.svg/220px-Tether_Logo.svg.png',
  bitcoin: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Bitcoin.svg/220px-Bitcoin.svg.png',
  ethereum: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/Ethereum-logo-2.svg/220px-Ethereum-logo-2.svg.png',
  telegram: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/82/Telegram_logo.svg/220px-Telegram_logo.svg.png',
  gcash_pro: 'https://cdn.paymongo.com/images/gcash.png',
  maya_pro: 'https://cdn.paymongo.com/images/maya.png'
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
