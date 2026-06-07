'use strict';

const crypto = require('crypto');

function generateOrderNumber() {
  // e.g. LK-7F3A9C2B
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `LK-${rand}`;
}

function formatMoney(amount, currency = 'PHP') {
  const symbol = currency === 'PHP' ? '₱' : '';
  const n = Number(amount || 0);
  return `${symbol}${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Render plain text with line breaks (used for payment instructions / delivered content)
function nl2br(str) {
  return escapeHtml(str).replace(/\n/g, '<br>');
}

function formatDate(dateStr, includeTime = true) {
  if (!dateStr) return '—';
  // SQLite dates are UTC (YYYY-MM-DD HH:MM:SS).
  // Append 'Z' to treat as UTC when parsing.
  const d = new Date(dateStr.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return dateStr;

  const options = {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    timeZone: 'Asia/Manila'
  };

  if (includeTime) {
    options.hour = '2-digit';
    options.minute = '2-digit';
    options.hour12 = true;
  }

  return d.toLocaleString('en-PH', options);
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr.replace(' ', 'T') + 'Z');
  if (isNaN(d.getTime())) return '';

  const seconds = Math.floor((new Date() - d) / 1000);
  let interval = Math.floor(seconds / 31536000);

  if (interval > 1) return interval + " years ago";
  interval = Math.floor(seconds / 2592000);
  if (interval > 1) return interval + " months ago";
  interval = Math.floor(seconds / 86400);
  if (interval > 1) return interval + " days ago";
  interval = Math.floor(seconds / 3600);
  if (interval > 1) return interval + " hours ago";
  interval = Math.floor(seconds / 60);
  if (interval > 1) return interval + " minutes ago";
  return Math.floor(seconds) + " seconds ago";
}

function getPaymentIcon(methodName, dbIconUrl) {
  if (dbIconUrl) return dbIconUrl;
  const name = (methodName || '').toLowerCase();
  // Prefer local SVG assets served from the static path. These files live under public/img/payments/.
  // Keep external fallbacks for unexpected names.
  if (name.includes('gcash')) return '/static/img/payments/gcash.svg';
  if (name.includes('paymaya') || name.includes('maya')) return '/static/img/payments/maya.svg';
  if (name.includes('grab')) return '/static/img/payments/grab.svg';
  if (name.includes('shopee')) return '/static/img/payments/shopee.svg';
  if (name.includes('bpi')) return '/static/img/payments/bpi.svg';
  if (name.includes('unionbank') || name.includes('union bank')) return '/static/img/payments/unionbank.svg';
  if (name.includes('visa')) return '/static/img/payments/visa.svg';
  if (name.includes('mastercard')) return '/static/img/payments/mastercard.svg';

  // External fallbacks (kept for compatibility)
  if (name.includes('gcash')) return 'https://logos-world.net/wp-content/uploads/2023/11/GCash-Logo.png';
  if (name.includes('paymaya') || name.includes('maya')) return 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9a/Maya_logo.svg/512px-Maya_logo.svg.png';
  if (name.includes('grab')) return 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Grab_logo.svg/512px-Grab_logo.svg.png';
  if (name.includes('shopee')) return 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fe/Shopee.svg/512px-Shopee.svg.png';
  if (name.includes('bpi')) return 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ee/BPI_Logo.svg/512px-BPI_Logo.svg.png';
  if (name.includes('unionbank') || name.includes('union bank')) return 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c8/UnionBank_of_the_Philippines_logo.svg/512px-UnionBank_of_the_Philippines_logo.svg.png';
  if (name.includes('visa')) return 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5e/Visa_Inc._logo.svg/512px-Visa_Inc._logo.svg.png';
  if (name.includes('mastercard')) return 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2a/Mastercard-logo.svg/512px-Mastercard-logo.svg.png';
  return null;
}

module.exports = { generateOrderNumber, formatMoney, escapeHtml, nl2br, formatDate, timeAgo, getPaymentIcon };
