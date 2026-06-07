'use strict';

const crypto = require('crypto');
const { getSetting } = require('./db');

const API_BASE = 'https://api.xendit.co';

function basicAuth() {
  const secretKey = getSetting('xendit_secret_key');
  return 'Basic ' + Buffer.from(`${secretKey}:`).toString('base64');
}

function isConfigured() {
  return (getSetting('xendit_enabled') === '1' || getSetting('xedit_enabled') === '1') && !!getSetting('xendit_secret_key');
}

/**
 * Create a Xendit Invoice
 */
async function createInvoice(order, baseUrl) {
  const payload = {
    external_id: order.order_number,
    amount: order.total,
    description: `Order ${order.order_number} - ${order.product_name}`,
    invoice_duration: 86400, // 24 hours
    currency: order.currency || 'PHP',
    customer: {
      given_names: order.telegram_username || 'Customer',
      email: order.email || `${order.telegram_username}@t.me`
    },
    items: [
      {
        name: order.product_name,
        quantity: order.quantity,
        price: order.unit_price
      }
    ],
    success_redirect_url: `${baseUrl}/order/result?ref=${encodeURIComponent(order.order_number)}&status=success`,
    failure_redirect_url: `${baseUrl}/order/result?ref=${encodeURIComponent(order.order_number)}&status=failure`
  };

  const res = await fetch(`${API_BASE}/v2/invoices`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: basicAuth()
    },
    body: JSON.stringify(payload)
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.message || 'Xendit error');
  }

  return {
    invoiceId: data.id,
    invoiceUrl: data.invoice_url
  };
}

function verifyWebhookToken(token) {
  const callbackToken = getSetting('xendit_callback_token');
  if (!callbackToken) return true; // If not set, we can't verify but we'll accept (or skip)
  return token === callbackToken;
}

module.exports = {
  isConfigured,
  createInvoice,
  verifyWebhookToken
};
