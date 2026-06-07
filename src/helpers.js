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

module.exports = { generateOrderNumber, formatMoney, escapeHtml, nl2br };
