'use strict';

const crypto = require('crypto');
const { getSetting, setSetting } = require('./db');

const HOSTS = {
  sandbox: 'https://api-sandbox.magpie.im',
  live: 'https://api.magpie.im',
};

function settingOrEnv(settingKey, envKey, fallback = '') {
  const value = getSetting(settingKey, '') || process.env[envKey] || fallback;
  return String(value || '').trim();
}

function apiBase() {
  const custom = settingOrEnv('magpie_api_base_url', 'MAGPIE_API_BASE_URL');
  if (custom) return custom.replace(/\/$/, '');
  const mode = settingOrEnv('magpie_mode', 'MAGPIE_MODE', 'sandbox').toLowerCase();
  return HOSTS[mode] || HOSTS.sandbox;
}

function isConfigured() {
  const enabled = getSetting('magpie_enabled') === '1' || process.env.MAGPIE_ENABLED === '1';
  const publicKey = settingOrEnv('magpie_api_key', 'MAGPIE_API_KEY');
  const secretKey = settingOrEnv('magpie_api_secret', 'MAGPIE_API_SECRET');
  return enabled && !!publicKey && !!secretKey;
}

/**
 * Fetch or compute a converted amount using a rate provider with caching.
 * Stores cached rates in the settings table under key magpie_rate_<BASE>_<TARGET>.
 * Provider selection via MAGPIE_RATE_PROVIDER (values: er-api | exchangerate.host)
 * TTL (minutes) via MAGPIE_RATE_TTL (default 10)
 */
async function convertAmountWithCache(baseCurrency, targetCurrency, amount) {
  baseCurrency = String(baseCurrency || '').toUpperCase();
  targetCurrency = String(targetCurrency || '').toUpperCase();
  if (!baseCurrency || !targetCurrency) return null;
  if (baseCurrency === targetCurrency) return Number(amount);

  const ttlMinutes = Number(settingOrEnv('magpie_rate_ttl', 'MAGPIE_RATE_TTL', '10'));
  const ttlMs = Math.max(0, ttlMinutes) * 60 * 1000;
  const cacheKey = `magpie_rate_${baseCurrency}_${targetCurrency}`;

  const cached = getSetting(cacheKey, '');
  if (cached) {
    try {
      const c = JSON.parse(cached);
      if (c && typeof c.rate === 'number' && c.fetched_at) {
        const fetched = new Date(c.fetched_at).getTime();
        if (!Number.isNaN(fetched) && Date.now() - fetched < ttlMs) {
          return Number(amount) * c.rate;
        }
      }
    } catch (_) { /* ignore parse errors */ }
  }

  // Provider selection
  const provider = settingOrEnv('magpie_rate_provider', 'MAGPIE_RATE_PROVIDER', 'er-api');
  let rate = null;

  if (provider === 'er-api') {
    // ExchangeRate-API (open.er-api.com) — public/free endpoint
    try {
      const url = `https://open.er-api.com/v6/latest/${encodeURIComponent(baseCurrency)}`;
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data && data.result === 'success' && data.rates && typeof data.rates[targetCurrency] === 'number') {
          rate = Number(data.rates[targetCurrency]);
        }
      }
    } catch (e) {
      console.warn('[Magpie] er-api conversion error:', e && e.message);
    }
  }

  if (rate === null) {
    // Fallback to exchangerate.host (still public)
    try {
      const url = `https://api.exchangerate.host/convert?from=${encodeURIComponent(baseCurrency)}&to=${encodeURIComponent(targetCurrency)}`;
      const res = await fetch(url, { method: 'GET' });
      if (res.ok) {
        const data = await res.json().catch(() => null);
        if (data && typeof data.result === 'number' && typeof data.info?.rate === 'number') {
          rate = Number(data.info.rate);
        } else if (data && typeof data.result === 'number') {
          // If convert returned a result but no info.rate, compute rate from amount=1
          rate = Number(data.result);
        }
      }
    } catch (e) {
      console.warn('[Magpie] exchangerate.host conversion error:', e && e.message);
    }
  }

  if (rate !== null && Number.isFinite(rate) && rate > 0) {
    try {
      setSetting(cacheKey, JSON.stringify({ rate: rate, fetched_at: new Date().toISOString() }));
    } catch (_) { /* ignore cache write errors */ }
    return Number(amount) * rate;
  }

  return null; // indicate failure
}

/**
 * Create a payment source and charge via the Magpie v1.1 API.
 */
async function createCheckout(order, baseUrl, method = 'alipay') {
  const publicKey = settingOrEnv('magpie_api_key', 'MAGPIE_API_KEY');
  const secretKey = settingOrEnv('magpie_api_secret', 'MAGPIE_API_SECRET');
  if (!publicKey) throw new Error('Magpie public key is not configured');
  if (!secretKey) throw new Error('Magpie secret key is not configured');

  const base = apiBase();
  const sourceType = method === 'wechat' ? 'wechat' : 'alipay';

  // Determine target currency from config (default CNY) and source/store currency
  const targetCurrency = (settingOrEnv('magpie_target_currency', 'MAGPIE_TARGET_CURRENCY', 'CNY') || 'CNY').toUpperCase();
  const storeCurrency = (order.currency || 'PHP').toUpperCase();

  // Amount (numeric) as shown in the store
  const storeAmount = Number(order.total);
  if (Number.isNaN(storeAmount)) throw new Error('Invalid order total');

  // Convert amount to target currency if needed, using caching/provider helper
  let amountInTarget = storeAmount;
  let usedCurrency = storeCurrency;
  if (targetCurrency !== storeCurrency) {
    try {
      const converted = await convertAmountWithCache(storeCurrency, targetCurrency, storeAmount);
      if (converted !== null) {
        amountInTarget = converted;
        usedCurrency = targetCurrency;
      } else {
        console.warn('[Magpie] currency conversion failed — falling back to store currency');
      }
    } catch (e) {
      console.warn('[Magpie] currency conversion error — falling back to store currency:', e && e.message);
    }
  }

  // Magpie amount is in the smallest currency unit (assume 2 decimal places).
  const amountSmallestUnit = Math.round(Number(amountInTarget) * 100);

  const successUrl = `${baseUrl}/order/result?ref=${encodeURIComponent(order.order_number)}&status=success`;
  const failUrl = `${baseUrl}/order/result?ref=${encodeURIComponent(order.order_number)}&status=cancel`;

  const sourcePayload = {
    type: sourceType,
    currency: usedCurrency.toLowerCase(),
    amount: amountSmallestUnit,
    redirect: {
      success: successUrl,
      fail: failUrl,
    },
  };

  const sourceRes = await fetch(`${base}/v1.1/sources`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${publicKey}`,
    },
    body: JSON.stringify(sourcePayload),
  });

  const sourceText = await sourceRes.text();
  let sourceData = {};
  try { sourceData = JSON.parse(sourceText); } catch (_) { /* keep raw */ }

  if (!sourceRes.ok) {
    const msg = sourceData.message || sourceData.error || sourceText || 'Magpie API error';
    throw new Error(`Magpie source creation failed (${sourceRes.status}): ${msg}`);
  }

  const sourceId = sourceData.id;
  if (!sourceId) throw new Error('Magpie source response missing id');

  const chargePayload = {
    amount: amountSmallestUnit,
    currency: usedCurrency.toLowerCase(),
    source: sourceId,
    description: `Order ${order.order_number} - ${order.product_name}`,
    referenceNumber: String(order.order_number),
  };

  const chargeRes = await fetch(`${base}/v1.1/charges`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secretKey}`,
    },
    body: JSON.stringify(chargePayload),
  });

  const chargeText = await chargeRes.text();
  let chargeData = {};
  try { chargeData = JSON.parse(chargeText); } catch (_) { /* keep raw */ }

  if (!chargeRes.ok) {
    const msg = chargeData.message || chargeData.error || chargeText || 'Magpie API error';
    throw new Error(`Magpie charge creation failed (${chargeRes.status}): ${msg}`);
  }

  const chargeId = chargeData.id;
  if (!chargeId) throw new Error('Magpie charge response missing id');

  const checkoutUrl =
    chargeData?.source?.redirect?.checkout_url ||
    chargeData?.redirect?.checkout_url ||
    sourceData?.redirect?.checkout_url ||
    null;

  if (!checkoutUrl) throw new Error('Magpie response missing checkout URL');

  return {
    checkoutId: chargeId,
    checkoutUrl,
  };
}

/**
 * Verify the HMAC-SHA256 signature on an incoming Magpie webhook.
 * Magpie signs the raw JSON body with the webhook secret.
 */
function verifyWebhookSignature(rawBody, signature) {
  const secret = settingOrEnv('magpie_webhook_secret', 'MAGPIE_WEBHOOK_SECRET');
  if (!secret) return { verified: false, skipped: true };
  if (!signature) return { verified: false, skipped: false };

  const incoming = String(signature).split('=').pop().toLowerCase().trim();
  const expected = crypto.createHmac('sha256', secret)
    .update(Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(rawBody))
    .digest('hex');

  let ok = false;
  try {
    ok = crypto.timingSafeEqual(Buffer.from(incoming, 'hex'), Buffer.from(expected, 'hex'));
  } catch (_) {
    ok = false;
  }
  return { verified: ok, skipped: false };
}

function normalizeStatus(raw) {
  if (!raw) return 'pending';
  const s = String(raw).trim().toLowerCase();
  if (['paid', 'success', 'completed', 'settled', 'captured'].includes(s)) return 'paid';
  if (['failed', 'expired', 'cancelled', 'canceled', 'voided', 'declined', 'error', 'refunded'].includes(s)) return 'failed';
  return 'pending';
}

module.exports = {
  isConfigured,
  createCheckout,
  normalizeStatus,
  verifyWebhookSignature,
};
