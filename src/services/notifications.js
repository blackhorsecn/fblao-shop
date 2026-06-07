'use strict';

/**
 * Service for sending notifications (e.g. to Telegram or Email).
 * Currently supports Telegram bot notifications if TELEGRAM_BOT_TOKEN is set.
 */

async function sendTelegram(message) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const adminId = process.env.ADMIN_TELEGRAM_ID;

  if (!token || !adminId) {
    console.log('[Notification] Telegram not configured. Message:', message);
    return;
  }

  try {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: adminId,
        text: message,
        parse_mode: 'HTML'
      })
    });
    if (!res.ok) {
      const err = await res.text();
      console.error('[Notification] Telegram API error:', err);
    }
  } catch (e) {
    console.error('[Notification] Telegram fetch error:', e);
  }
}

const NotificationService = {
  async onNewOrder(order) {
    const msg = `<b>🔔 New Order</b>\n` +
                `Order: <code>${order.order_number}</code>\n` +
                `Product: ${order.product_name}\n` +
                `Total: ${order.total} ${order.currency}\n` +
                `Customer: @${order.telegram_username || 'unknown'}`;
    await sendTelegram(msg);
  },

  async onOrderPaid(order) {
    const msg = `<b>💰 Order Paid</b>\n` +
                `Order: <code>${order.order_number}</code>\n` +
                `Product: ${order.product_name}\n` +
                `Total: ${order.total} ${order.currency}\n` +
                `Status: PAID`;
    await sendTelegram(msg);
  },

  async onOrderDelivered(order) {
    const msg = `<b>📦 Order Delivered</b>\n` +
                `Order: <code>${order.order_number}</code>\n` +
                `Product: ${order.product_name}\n` +
                `Status: DELIVERED`;
    await sendTelegram(msg);
  }
};

module.exports = NotificationService;
