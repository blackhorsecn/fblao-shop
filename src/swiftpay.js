'use strict';

const crypto = require('crypto');
const { getSetting } = require('./db');

const HOSTS = {
  sandbox: 'https://api-sandbox.swiftpay.ph',
  live: 'https://api.swiftpay.ph',
};

function settingOrEnv(settingKey, envKey, fallback = '') {
  const value = getSetting(settingKey, '') || process.env[envKey] || fallback;
  return String(value || '').trim();
}

function apiBase() {
  const custom = settingOrEnv('swiftpay_api_base_url', 'SWIFTPAY_API_BASE_URL');
  if (custom) return custom.replace(/\/$/, '');
  const mode = settingOrEnv('swiftpay_mode', 'SWIFTPAY_MODE', 'sandbox').toLowerCase();
  return HOSTS[mode] || HOSTS.sandbox;
}

function isConfigured() {
  const enabled = getSetting('swiftpay_enabled') === '1' || process.env.SWIFTPAY_ENABLED === '1';
  const apiKey = settingOrEnv('swiftpay_api_key', 'SWIFTPAY_API_KEY');
  return enabled && !!apiKey;
}

function authHeaders() {
  const apiKey = settingOrEnv('swiftpay_api_key', 'SWIFTPAY_API_KEY');
  const apiSecret = settingOrEnv('swiftpay_api_secret', 'SWIFTPAY_API_SECRET');
  if (!apiKey) throw new Error('Swiftpay API key is not configured');

  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${apiKey}`,
  };
  if (apiSecret) headers['X-SWIFTPAY-SECRET'] = apiSecret;
  return headers;
}

function checkoutResultUrl(baseUrl, orderNumber, statusKey, settingKey, envKey) {
  const custom = settingOrEnv(settingKey, envKey);
  if (custom) {
    return custom
      .replace(/\{ORDER_NO\}/g, encodeURIComponent(String(orderNumber)))
      .replace(/\{STATUS\}/g, encodeURIComponent(String(statusKey)));
  }
  return `${baseUrl}/order/result?ref=${encodeURIComponent(orderNumber)}&status=${statusKey}`;
}

async function createCheckout(order, baseUrl) {
  const customer = {
    telegram_username: order.telegram_username || '',
  };
  if (order.email) customer.email = order.email;

  const payload = {
    reference_number: order.order_number,
    amount: Number(order.total).toFixed(2),
    currency: order.currency || 'PHP',
    description: `Order ${order.order_number} - ${order.product_name}`,
    customer,
    redirect_urls: {
      success: checkoutResultUrl(baseUrl, order.order_number, 'success', 'swiftpay_success_url', 'SWIFTPAY_SUCCESS_URL'),
      failure: checkoutResultUrl(baseUrl, order.order_number, 'failure', 'swiftpay_failure_url', 'SWIFTPAY_FAILURE_URL'),
      cancel: checkoutResultUrl(baseUrl, order.order_number, 'cancel', 'swiftpay_cancel_url', 'SWIFTPAY_CANCEL_URL'),
    },
    webhook_url: `${baseUrl}/webhooks/swiftpay`,
    metadata: {
      product_name: order.product_name,
      quantity: order.quantity,
    },
  };

  const res = await fetch(`${apiBase()}/v1/checkouts`, {
    method: 'POST',
    headers: authHeaders(),
    body: JSON.stringify(payload),
  });

  const text = await res.text();
  let data = {};
  try { data = JSON.parse(text); } catch (_) { /* keep raw body */ }

  if (!res.ok) {
    const message = data.message || data.error || text || 'Swiftpay API error';
    throw new Error(`Swiftpay checkout failed (${res.status}): ${message}`);
  }

  const d = data.data || data;
  const checkoutId = d.id || d.checkout_id || d.reference || null;
  const checkoutUrl = d.checkout_url || d.redirect_url || d.url || null;
  if (!checkoutUrl) throw new Error('Swiftpay response missing checkout URL');

  return {
    checkoutId,
    checkoutUrl,
  };
}

function normalizeStatus(raw) {
  if (!raw) return 'pending';
  const s = String(raw).trim().toUpperCase();
  if (['PAID', 'SUCCESS', 'COMPLETED', 'SETTLED', 'CAPTURED'].includes(s)) return 'paid';
  if (['FAILED', 'EXPIRED', 'CANCELLED', 'VOIDED', 'DECLINED', 'ERROR'].includes(s)) return 'failed';
  return 'pending';
}

function verifyWebhookSignature(rawBody, signature) {
  const secret = settingOrEnv('swiftpay_webhook_secret', 'SWIFTPAY_WEBHOOK_SECRET');
  if (!secret) return { verified: false, skipped: true };
  if (!signature) return { verified: false, skipped: false };

  const incoming = String(signature).includes('=') ? String(signature).split('=').pop() : String(signature);
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

  let ok = false;
  try {
    ok = crypto.timingSafeEqual(Buffer.from(incoming, 'hex'), Buffer.from(expected, 'hex'));
  } catch (_) {
    ok = false;
  }
  return { verified: ok, skipped: false };
}

module.exports = {
  isConfigured,
  createCheckout,
  normalizeStatus,
  verifyWebhookSignature,
};