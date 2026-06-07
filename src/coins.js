'use strict';

const crypto = require('crypto');
const { getSetting } = require('./db');

const HOSTS = {
  sandbox: 'https://api.sandbox.coins.ph',
  live: 'https://api.coins.ph',
};

function host() {
  const mode = (getSetting('coins_mode', 'sandbox') || 'sandbox').toLowerCase();
  return HOSTS[mode] || HOSTS.sandbox;
}

function isConfigured() {
  return getSetting('coins_enabled') === '1' && !!getSetting('coins_api_key') && !!getSetting('coins_api_secret');
}

/**
 * Generate Coins.ph API signature
 */
function generateSignature(path, body, timestamp, secret) {
  const payload = timestamp + 'POST' + path + JSON.stringify(body);
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

/**
 * Create a Coins.ph payment request
 */
async function createPaymentRequest(order, baseUrl) {
  const apiKey = getSetting('coins_api_key');
  const apiSecret = getSetting('coins_api_secret');
  if (!apiKey || !apiSecret) throw new Error('Coins.ph API keys not configured');

  const path = '/openapi/fiat/v1/payment-request';
  const timestamp = Date.now().toString();
  const body = {
    order_id: order.order_number,
    amount: Number(order.total).toFixed(2),
    currency: order.currency || 'PHP',
    payment_method: 'COINS_PH', // Default to Coins.ph wallet
    success_url: `${baseUrl}/order/result?ref=${encodeURIComponent(order.order_number)}&status=success`,
    cancel_url: `${baseUrl}/order/result?ref=${encodeURIComponent(order.order_number)}&status=cancel`,
    webhook_url: `${baseUrl}/webhooks/coins/payment-status`,
  };

  const signature = generateSignature(path, body, timestamp, apiSecret);

  const res = await fetch(`${host()}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-COINS-APIKEY': apiKey,
      'X-COINS-SIGNATURE': signature,
      'X-COINS-TIMESTAMP': timestamp,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Coins.ph API error: ${data.message || 'Unknown error'}`);
  }

  return {
    paymentRequestId: data.payment_request_id,
    redirectUrl: data.payment_url
  };
}

/**
 * Verify Coins.ph webhook signature
 */
function verifyWebhookSignature(rawBody, signature) {
  const secret = getSetting('coins_webhook_secret');
  if (!secret) return { verified: false, skipped: true };
  if (!signature) return { verified: false, skipped: false };

  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  let ok = false;
  try {
    ok = crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch (_) {
    ok = false;
  }
  return { verified: ok, skipped: false };
}

module.exports = {
  isConfigured,
  createPaymentRequest,
  verifyWebhookSignature,
};
