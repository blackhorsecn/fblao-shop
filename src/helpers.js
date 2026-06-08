'use strict';

const crypto = require('crypto');

const { getIcon } = require('./icons');

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

module.exports = { generateOrderNumber, formatMoney, escapeHtml, nl2br, formatDate, timeAgo, getPaymentIcon: getIcon };
