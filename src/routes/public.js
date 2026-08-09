'use strict';

const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { db, getSetting } = require('../db');
const maya = require('../maya');
const coins = require('../coins');
const paymongo = require('../paymongo');
const xendit = require('../xendit');
const swiftpay = require('../swiftpay');
const magpie = require('../magpie');
const { generateOrderNumber } = require('../helpers');
const { asyncHandler, rateLimit } = require('../middleware');
const StoreService = require('../services/store');

async function syncSwiftpayOrderStatus(order) {
  if (!order || order.payment_type !== 'swiftpay' || order.status !== 'pending' || !order.swiftpay_checkout_id) {
    return order;
  }

  try {
    const status = await swiftpay.getCheckoutStatus(order.swiftpay_checkout_id);
    if (status === 'paid') {
      StoreService.updateOrderStatus(order.id, 'paid', "datetime('now')");
      return StoreService.getOrder(order.id);
    }
    if (status === 'failed') {
      StoreService.updateOrderStatus(order.id, 'failed');
      return StoreService.getOrder(order.id);
    }
  } catch (_) { /* show current state */ }

  return order;
}

// Homepage -------------------------------------------------------------------
router.get('/', (req, res) => {
  const banners = db.prepare('SELECT * FROM banners WHERE enabled = 1 ORDER BY sort_order, id').all();
  res.render('index', {
    title: res.locals.shopName,
    banners,
    catalog: StoreService.getCatalog(),
    manualMethods: StoreService.getEnabledManualMethods(),
    coinsEnabled: coins.isConfigured(),
  });
});

// Create order ---------------------------------------------------------------
router.post('/order', rateLimit, asyncHandler(async (req, res) => {
  const telegramUsername = String(req.body.telegram_username || '').trim().replace(/^@/, '');
  const productId = parseInt(req.body.product_id, 10);
  const quantity = Math.max(1, parseInt(req.body.quantity, 10) || 1);
  const paymentType = req.body.payment_type; // 'manual', 'maya', 'coins', 'paymongo', 'xendit', or 'swiftpay'
  const manualMethodId = req.body.manual_method_id ? parseInt(req.body.manual_method_id, 10) : null;

  if (!telegramUsername) {
    return res.status(400).render('error', { title: 'Missing info', message: 'Please enter your Telegram username.' });
  }

  const product = StoreService.getProduct(productId);
  if (!product) {
    return res.status(404).render('error', { title: 'Unavailable', message: 'This product is no longer available.' });
  }
  if (product.stock < quantity) {
    return res.status(400).render('error', {
      title: 'Out of stock',
      message: `Only ${product.stock} unit(s) of "${product.name}" are available.`,
    });
  }
  if (quantity < (product.min_quantity || 1)) {
    return res.status(400).render('error', {
      title: 'Minimum order not met',
      message: `The minimum order for "${product.name}" is ${product.min_quantity} unit(s).`,
    });
  }

  if (paymentType === 'manual') {
    const method = db.prepare('SELECT * FROM manual_payment_methods WHERE id = ? AND enabled = 1').get(manualMethodId);
    if (!method) {
      return res.status(400).render('error', { title: 'Invalid payment', message: 'Please choose a valid payment method.' });
    }
  } else if (paymentType === 'maya' && !maya.isConfigured()) {
    return res.status(400).render('error', { title: 'Unavailable', message: 'Online card/Maya payment is not available right now. Please choose another method.' });
  } else if (paymentType === 'coins' && !coins.isConfigured()) {
    return res.status(400).render('error', { title: 'Unavailable', message: 'Coins.ph payment is not available right now. Please choose another method.' });
  } else if (paymentType === 'paymongo' && !paymongo.isConfigured()) {
    return res.status(400).render('error', { title: 'Unavailable', message: 'PayMongo payment is not available right now. Please choose another method.' });
  } else if (paymentType === 'xendit' && !xendit.isConfigured()) {
    return res.status(400).render('error', { title: 'Unavailable', message: 'Xendit payment is not available right now. Please choose another method.' });
  } else if (paymentType === 'swiftpay' && !swiftpay.isConfigured()) {
    return res.status(400).render('error', { title: 'Unavailable', message: 'Swiftpay PH payment is not available right now. Please choose another method.' });
  } else if ((paymentType === 'magpie_alipay' || paymentType === 'magpie_wechat') && !magpie.isConfigured()) {
    return res.status(400).render('error', { title: 'Unavailable', message: 'Magpie payment is not available right now. Please choose another method.' });
  }

  const orderNumber = generateOrderNumber();
  const order = StoreService.createOrder({
    orderNumber,
    email: '', // Email is no longer used
    telegramUsername,
    telegramId: req.session.user ? req.session.user.telegram_id : null,
    productId: product.id,
    productName: product.name,
    quantity,
    unitPrice: product.price,
    total: +(product.price * quantity).toFixed(2),
    currency: getSetting('currency', 'PHP'),
    paymentType,
    manualMethodId: paymentType === 'manual' ? manualMethodId : null
  });

  // Notify admin
  const NotificationService = require('../services/notifications');
  NotificationService.onNewOrder(order).catch(console.error);

  if (paymentType === 'maya') {
    try {
      const { checkoutId, redirectUrl } = await maya.createCheckout(order, res.locals.baseUrl);
      db.prepare('UPDATE orders SET maya_checkout_id = ? WHERE id = ?').run(checkoutId, order.id);
      return res.redirect(redirectUrl);
    } catch (e) {
      db.prepare("UPDATE orders SET status = 'failed', admin_notes = ? WHERE id = ?").run(
        'Maya checkout error: ' + e.message,
        order.id
      );
      return res.status(502).render('error', {
        title: 'Payment error',
        message: 'Could not start the Maya payment. ' + e.message + ` Your reference is ${orderNumber}.`,
      });
    }
  }

  if (paymentType === 'coins') {
    try {
      const { paymentRequestId, redirectUrl } = await coins.createPaymentRequest(order, res.locals.baseUrl);
      db.prepare('UPDATE orders SET coins_request_id = ? WHERE id = ?').run(paymentRequestId, order.id);
      return res.redirect(redirectUrl);
    } catch (e) {
      db.prepare("UPDATE orders SET status = 'failed', admin_notes = ? WHERE id = ?").run(
        'Coins.ph checkout error: ' + e.message,
        order.id
      );
      return res.status(502).render('error', {
        title: 'Payment error',
        message: 'Could not start the Coins.ph payment. ' + e.message + ` Your reference is ${orderNumber}.`,
      });
    }
  }

  if (paymentType === 'paymongo') {
    try {
      const { sessionId, checkoutUrl } = await paymongo.createCheckoutSession(order, res.locals.baseUrl);
      db.prepare('UPDATE orders SET paymongo_session_id = ? WHERE id = ?').run(sessionId, order.id);
      return res.redirect(checkoutUrl);
    } catch (e) {
      db.prepare("UPDATE orders SET status = 'failed', admin_notes = ? WHERE id = ?").run(
        'PayMongo checkout error: ' + e.message,
        order.id
      );
      return res.status(502).render('error', {
        title: 'Payment error',
        message: 'Could not start PayMongo checkout. ' + e.message + ` Your reference is ${orderNumber}.`,
      });
    }
  }

  if (paymentType === 'xendit') {
    try {
      const { invoiceId, invoiceUrl } = await xendit.createInvoice(order, res.locals.baseUrl);
      db.prepare('UPDATE orders SET xendit_invoice_id = ? WHERE id = ?').run(invoiceId, order.id);
      return res.redirect(invoiceUrl);
    } catch (e) {
      db.prepare("UPDATE orders SET status = 'failed', admin_notes = ? WHERE id = ?").run(
        'Xendit checkout error: ' + e.message,
        order.id
      );
      return res.status(502).render('error', {
        title: 'Payment error',
        message: 'Could not start Xendit checkout. ' + e.message + ` Your reference is ${orderNumber}.`,
      });
    }
  }

  if (paymentType === 'swiftpay') {
    try {
      const { checkoutId, checkoutUrl } = await swiftpay.createCheckout(order, res.locals.baseUrl);
      db.prepare('UPDATE orders SET swiftpay_checkout_id = ?, swiftpay_checkout_url = ? WHERE id = ?').run(checkoutId, checkoutUrl, order.id);
      return res.redirect(`/swiftpay/checkout?ref=${encodeURIComponent(orderNumber)}`);
    } catch (e) {
      db.prepare("UPDATE orders SET status = 'failed', admin_notes = ? WHERE id = ?").run(
        'Swiftpay checkout error: ' + e.message,
        order.id
      );
      return res.status(502).render('error', {
        title: 'Payment error',
        message: 'Could not start Swiftpay PH checkout. ' + e.message + ` Your reference is ${orderNumber}.`,
      });
    }
  }

  if (paymentType === 'magpie_alipay' || paymentType === 'magpie_wechat') {
    try {
      const method = paymentType === 'magpie_wechat' ? 'wechat' : 'alipay';
      const { checkoutId, checkoutUrl } = await magpie.createCheckout(order, res.locals.baseUrl, method);
      db.prepare('UPDATE orders SET magpie_checkout_id = ? WHERE id = ?').run(checkoutId, order.id);
      return res.redirect(checkoutUrl);
    } catch (e) {
      db.prepare("UPDATE orders SET status = 'failed', admin_notes = ? WHERE id = ?").run(
        'Magpie checkout error: ' + e.message,
        order.id
      );
      return res.status(502).render('error', {
        title: 'Payment error',
        message: 'Could not start Magpie payment. ' + e.message + ` Your reference is ${orderNumber}.`,
      });
    }
  }

  // Manual payment -> show instructions
  return res.redirect(`/order/result?ref=${encodeURIComponent(orderNumber)}`);
}));

router.get('/swiftpay/checkout', asyncHandler(async (req, res) => {
  const ref = String(req.query.ref || '').trim();
  let order = StoreService.getOrder(ref);
  if (!order) {
    return res.status(404).render('error', { title: 'Not found', message: 'Order not found.' });
  }
  if (order.payment_type !== 'swiftpay') {
    return res.redirect(`/order/result?ref=${encodeURIComponent(order.order_number)}`);
  }

  order = await syncSwiftpayOrderStatus(order);
  if (order.status !== 'pending') {
    return res.redirect(`/swiftpay/status?ref=${encodeURIComponent(order.order_number)}`);
  }

  res.render('swiftpay-checkout', {
    title: `Swiftpay Checkout · ${order.order_number}`,
    order,
    checkoutUrl: order.swiftpay_checkout_url || '',
  });
}));

// Order result / instructions page (after checkout or manual order) ----------
router.get('/order/result', asyncHandler(async (req, res) => {
  const ref = String(req.query.ref || '').trim();
  let order = StoreService.getOrder(ref);
  if (!order) {
    return res.status(404).render('error', { title: 'Not found', message: 'Order not found.' });
  }

  // For Maya orders coming back from the hosted checkout, sync status live so the
  // page is accurate even if the webhook has not arrived yet.
  if (order.payment_type === 'maya' && order.status === 'pending' && order.maya_checkout_id) {
    try {
      const status = await maya.getCheckoutStatus(order.maya_checkout_id);
      if (status === 'paid') {
        StoreService.updateOrderStatus(order.id, 'paid', "datetime('now')");
      } else if (status === 'failed') {
        StoreService.updateOrderStatus(order.id, 'failed');
      }
      order = StoreService.getOrder(order.id);
    } catch (_) { /* show current state */ }
  }
  order = await syncSwiftpayOrderStatus(order);

  const manualMethod = order.manual_method_id
    ? db.prepare('SELECT * FROM manual_payment_methods WHERE id = ?').get(order.manual_method_id)
    : null;
  res.render('order-result', {
    title: `Order ${order.order_number}`,
    order,
    manualMethod,
    queryStatus: String(req.query.status || ''),
  });
}));

router.get('/swiftpay/status', asyncHandler(async (req, res) => {
  const ref = String(req.query.ref || '').trim();
  let order = StoreService.getOrder(ref);
  if (!order) {
    return res.status(404).render('error', { title: 'Not found', message: 'Order not found.' });
  }
  if (order.payment_type !== 'swiftpay') {
    return res.redirect(`/order/result?ref=${encodeURIComponent(order.order_number)}`);
  }

  order = await syncSwiftpayOrderStatus(order);
  res.render('swiftpay-status', {
    title: `Swiftpay Status · ${order.order_number}`,
    order,
    queryStatus: String(req.query.status || '').trim().toLowerCase(),
    checkoutUrl: order.swiftpay_checkout_url || '',
  });
}));

// Order status page -----------------------------------------------------------
router.get('/status', (req, res) => {
  const ref = String(req.query.ref || '').trim();
  const tg = String(req.query.tg || '').trim();

  if (ref && tg) {
    const order = StoreService.getOrderByTGAndRef(tg, ref);
    if (order) {
      const manualMethod = order.manual_method_id
        ? db.prepare('SELECT * FROM manual_payment_methods WHERE id = ?').get(order.manual_method_id)
        : null;
      return res.render('status', { title: 'Order Status', order, manualMethod, searched: true, error: null });
    }
  }

  res.render('status', { title: 'Order Status', order: null, manualMethod: null, error: null, searched: false });
});

router.post('/status', (req, res) => {
  const telegramUsername = String(req.body.telegram_username || '').trim().replace(/^@/, '');
  const ref = String(req.body.order_number || '').trim();
  const order = StoreService.getOrderByTGAndRef(telegramUsername, ref);
  if (!order) {
    return res.render('status', {
      title: 'Order Status',
      order: null,
      manualMethod: null,
      searched: true,
      error: 'No order found for that Telegram username and order number.',
    });
  }
  const manualMethod = order.manual_method_id
    ? db.prepare('SELECT * FROM manual_payment_methods WHERE id = ?').get(order.manual_method_id)
    : null;
  res.render('status', { title: 'Order Status', order, manualMethod, searched: true, error: null });
});

// My Account -----------------------------------------------------------------
router.get('/account', (req, res) => {
  if (!req.session.user) {
    return res.redirect('/');
  }
  const orders = StoreService.getOrdersByTelegramUsername(req.session.user.username);
  res.render('account', {
    title: 'My Account',
    orders
  });
});

// Telegram Auth --------------------------------------------------------------
router.get('/auth/telegram', (req, res) => {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return res.redirect('/');

  const data = { ...req.query };
  const hash = data.hash;
  delete data.hash;

  const dataCheckArr = Object.keys(data)
    .sort()
    .map(key => `${key}=${data[key]}`);
  const dataCheckString = dataCheckArr.join('\n');

  const secretKey = crypto.createHash('sha256').update(token).digest();
  const hmac = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

  if (hmac === hash) {
    // Valid login
    req.session.user = {
      telegram_id: data.id,
      first_name: data.first_name,
      username: data.username,
      photo_url: data.photo_url,
    };
    return res.redirect('/');
  }

  res.status(401).send('Invalid Telegram auth');
});

router.get('/logout', (req, res) => {
  delete req.session.user;
  res.redirect('/');
});

module.exports = router;
