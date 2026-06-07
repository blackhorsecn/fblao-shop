'use strict';

const express = require('express');
const router = express.Router();
const { db, getSetting } = require('../db');
const maya = require('../maya');
const { generateOrderNumber } = require('../helpers');
const { asyncHandler, rateLimit } = require('../middleware');
const StoreService = require('../services/store');

// Homepage -------------------------------------------------------------------
router.get('/', (req, res) => {
  const banners = db.prepare('SELECT * FROM banners WHERE enabled = 1 ORDER BY sort_order, id').all();
  res.render('index', {
    title: res.locals.shopName,
    banners,
    catalog: StoreService.getCatalog(),
    manualMethods: StoreService.getEnabledManualMethods(),
    mayaEnabled: maya.isConfigured(),
  });
});

// Create order ---------------------------------------------------------------
router.post('/order', rateLimit, asyncHandler(async (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const telegramUsername = String(req.body.telegram_username || '').trim();
  const productId = parseInt(req.body.product_id, 10);
  const quantity = Math.max(1, parseInt(req.body.quantity, 10) || 1);
  const paymentType = req.body.payment_type === 'manual' ? 'manual' : 'maya';
  const manualMethodId = req.body.manual_method_id ? parseInt(req.body.manual_method_id, 10) : null;

  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return res.status(400).render('error', { title: 'Invalid email', message: 'Please enter a valid email address.' });
  }

  if (!telegramUsername) {
    return res.status(400).render('error', { title: 'Missing info', message: 'Please enter your Telegram username for support and notifications.' });
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

  if (paymentType === 'manual') {
    const method = db.prepare('SELECT * FROM manual_payment_methods WHERE id = ? AND enabled = 1').get(manualMethodId);
    if (!method) {
      return res.status(400).render('error', { title: 'Invalid payment', message: 'Please choose a valid payment method.' });
    }
  } else if (!maya.isConfigured()) {
    return res.status(400).render('error', { title: 'Unavailable', message: 'Online card/Maya payment is not available right now. Please choose a manual method.' });
  }

  const orderNumber = generateOrderNumber();
  const order = StoreService.createOrder({
    orderNumber,
    email,
    telegramUsername,
    productId: product.id,
    productName: product.name,
    quantity,
    unitPrice: product.price,
    total: +(product.price * quantity).toFixed(2),
    currency: getSetting('currency', 'PHP'),
    paymentType,
    manualMethodId: paymentType === 'manual' ? manualMethodId : null
  });

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

  // Manual payment -> show instructions
  return res.redirect(`/order/result?ref=${encodeURIComponent(orderNumber)}`);
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

// Order query page -----------------------------------------------------------
router.get('/query', (req, res) => {
  res.render('query', { title: 'Query Order', order: null, manualMethod: null, error: null, searched: false });
});

router.post('/query', (req, res) => {
  const email = String(req.body.email || '').trim().toLowerCase();
  const ref = String(req.body.order_number || '').trim();
  const order = StoreService.getOrderByRefAndEmail(ref, email);
  if (!order) {
    return res.render('query', {
      title: 'Query Order',
      order: null,
      manualMethod: null,
      searched: true,
      error: 'No order found for that email and order number.',
    });
  }
  const manualMethod = order.manual_method_id
    ? db.prepare('SELECT * FROM manual_payment_methods WHERE id = ?').get(order.manual_method_id)
    : null;
  res.render('query', { title: 'Query Order', order, manualMethod, searched: true, error: null });
});

module.exports = router;
