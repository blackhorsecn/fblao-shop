'use strict';

/**
 * High-stability professional CDN links for payment and brand logos.
 * Centralized here for easy maintenance.
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
  xendit: 'https://www.vectorlogo.zone/logos/xendit/xendit-ar21.png',
  billease: 'https://cdn.paymongo.com/images/billease.png',

  // Cards
  visa: 'https://www.vectorlogo.zone/logos/visa/visa-ar21.png',
  mastercard: 'https://www.vectorlogo.zone/logos/mastercard/mastercard-ar21.png',
  jcb: 'https://www.vectorlogo.zone/logos/jcb/jcb-ar21.png',
  amex: 'https://www.vectorlogo.zone/logos/amex/amex-ar21.png',

  // Banks (PH & International)
  bpi: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ee/BPI_Logo.svg/512px-BPI_Logo.svg.png',
  unionbank: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/UnionBank_of_the_Philippines_logo.svg/512px-UnionBank_of_the_Philippines_logo.svg.png',
  'union bank': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/UnionBank_of_the_Philippines_logo.svg/512px-UnionBank_of_the_Philippines_logo.svg.png',
  bdo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/BDO_Unibank_%28logo%29.svg/512px-BDO_Unibank_%28logo%29.svg.png',
  metrobank: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Metrobank_%28Philippines%29_logo.svg/512px-Metrobank_%28Philippines%29_logo.svg.png',
  rcbc: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/RCBC_logo.svg/512px-RCBC_logo.svg.png',
  landbank: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Land_Bank_of_the_Philippines_logo.svg/512px-Land_Bank_of_the_Philippines_logo.svg.png',
  securitybank: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d7/Security_Bank_logo.svg/512px-Security_Bank_logo.svg.png',
  chinabank: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/China_Bank_logo.svg/512px-China_Bank_logo.svg.png',
  pnb: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Philippine_National_Bank_logo.svg/512px-Philippine_National_Bank_logo.svg.png',

  // Other
  paypal: 'https://www.vectorlogo.zone/logos/paypal/paypal-ar21.png',
  binance: 'https://www.vectorlogo.zone/logos/binance/binance-ar21.png',
  usdt: 'https://www.vectorlogo.zone/logos/tether/tether-ar21.png',
  bitcoin: 'https://www.vectorlogo.zone/logos/bitcoin/bitcoin-ar21.png',
  ethereum: 'https://www.vectorlogo.zone/logos/ethereum/ethereum-ar21.png',
  telegram: 'https://www.vectorlogo.zone/logos/telegram/telegram-ar21.png',
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
