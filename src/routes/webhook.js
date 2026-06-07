'use strict';

const express = require('express');
const router = express.Router();
const maya = require('../maya');
const StoreService = require('../services/store');

// Maya payment-status webhook.
// Configure this URL in your Maya dashboard:
//   {BASE_URL}/webhooks/maya/payment-status
router.post('/maya/payment-status', async (req, res) => {
  try {
    const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));
    const signature = req.get('X-Maya-Signature') || req.get('x-signature') || '';
    const sig = maya.verifyWebhookSignature(rawBody, signature);
    if (!sig.skipped && !sig.verified) {
      return res.status(401).json({ error: 'invalid signature' });
    }

    const body = req.body || {};
    const ref = body.requestReferenceNumber || body.reference || (body.data && body.data.requestReferenceNumber);
    const checkoutId = body.id || body.checkoutId || (body.data && body.data.id);

    let order = null;
    if (ref) order = StoreService.getOrder(ref);
    if (!order && checkoutId) {
      const { db } = require('../db');
      order = db.prepare('SELECT * FROM orders WHERE maya_checkout_id = ?').get(checkoutId);
    }

    if (!order) return res.status(200).json({ ok: true, note: 'order not found' });

    // Trust the API as source of truth when we can look it up; otherwise use payload status.
    let status = null;
    if (order.maya_checkout_id) status = await maya.getCheckoutStatus(order.maya_checkout_id);
    if (!status) status = maya.normalizeStatus(body.paymentStatus || body.status || (body.data && body.data.status));

    if (status === 'paid') {
      StoreService.updateOrderStatus(order.id, 'paid', "datetime('now')");
    } else if (status === 'failed') {
      if (order.status === 'pending') {
        StoreService.updateOrderStatus(order.id, 'failed');
      }
    }
    return res.status(200).json({ ok: true, status });
  } catch (e) {
    console.error('webhook error', e);
    // Always 200 so Maya does not retry forever; we log for investigation.
    return res.status(200).json({ ok: false, error: e.message });
  }
});

module.exports = router;
