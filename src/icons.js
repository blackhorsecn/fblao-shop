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
  xendit: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/Xendit_Logo.png/512px-Xendit_Logo.png',
  billease: 'https://cdn.paymongo.com/images/billease.png',

  // Cards
  visa: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Visa_Inc._logo.svg/512px-Visa_Inc._logo.svg.png',
  mastercard: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Mastercard-logo.svg/512px-Mastercard-logo.svg.png',
  jcb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/40/JCB_logo.svg/512px-JCB_logo.svg.png',
  amex: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/American_Express_logo_%282018%29.svg/512px-American_Express_logo_%282018%29.svg.png',

  // Banks (PH & International)
  bpi: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ee/BPI_Logo.svg/512px-BPI_Logo.svg.png',
  unionbank: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/UnionBank_of_the_Philippines_logo.svg/512px-UnionBank_of_the_Philippines_logo.svg.png',
  'union bank': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/UnionBank_of_the_Philippines_logo.svg/512px-UnionBank_of_the_Philippines_logo.svg.png',
  bdo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/BDO_Unibank_%28logo%29.svg/512px-BDO_Unibank_%28logo%29.svg.png',
  metrobank: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Metrobank_%28Philippines%29_logo.svg/512px-Metrobank_%28Philippines%29_logo.svg.png',
  rcbc: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/RCBC_logo.svg/512px-RCBC_logo.svg.png',
  landbank: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Land_Bank_of_the_Philippines_logo.svg/512px-Land_Bank_of_the_Philippines_logo.svg.png',
  securitybank: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Security_Bank_logo.svg/512px-Security_Bank_logo.svg.png',

  // Other
  paypal: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/PayPal.svg/512px-PayPal.svg.png',
  binance: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Binance_Logo.svg/512px-Binance_Logo.svg.png',
  usdt: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Tether_Logo.svg/512px-Tether_Logo.svg.png',
  bitcoin: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/46/Bitcoin.svg/512px-Bitcoin.svg.png',
};

function getIcon(name, dbIconUrl) {
  if (dbIconUrl) return dbIconUrl;
  const search = (name || '').toLowerCase().trim();

  // Try exact match first
  if (ICONS[search]) return ICONS[search];

  // Then try substring match
  for (const key in ICONS) {
    if (search.includes(key)) return ICONS[key];
  }

  return null;
}

module.exports = {
  ICONS,
  getIcon
};
