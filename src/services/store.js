'use strict';

const { db } = require('../db');

const StoreService = {
  // Catalog
  getCatalog() {
    const categories = db.prepare('SELECT * FROM categories ORDER BY sort_order, id').all();
    const products = db
      .prepare('SELECT * FROM products WHERE active = 1 ORDER BY sort_order, id')
      .all();
    return categories
      .map((c) => ({ ...c, products: products.filter((p) => p.category_id === c.id) }))
      .filter((c) => c.products.length > 0);
  },

  getEnabledManualMethods() {
    return db
      .prepare('SELECT * FROM manual_payment_methods WHERE enabled = 1 ORDER BY sort_order, id')
      .all();
  },

  // Products
  getProduct(id, onlyActive = true) {
    let sql = 'SELECT * FROM products WHERE id = ?';
    if (onlyActive) sql += ' AND active = 1';
    return db.prepare(sql).get(id);
  },

  updateProductStock(id, delta) {
    // We don't manually update stock anymore if using the pool,
    // but we'll keep this for manual products.
    db.prepare('UPDATE products SET stock = MAX(0, stock + ?) WHERE id = ?').run(delta, id);
  },

  // Stock Pool Management
  addStockToPool(productId, lines) {
    const stmt = db.prepare('INSERT INTO product_stock_pool (product_id, content) VALUES (?, ?)');
    const tx = db.transaction(() => {
      for (let line of lines) {
        if (line.trim()) stmt.run(productId, line.trim());
      }
      this.syncProductStockCount(productId);
    });
    tx();
  },

  syncProductStockCount(productId) {
    const count = db.prepare('SELECT COUNT(*) c FROM product_stock_pool WHERE product_id = ? AND is_sold = 0').get(productId).c;
    db.prepare('UPDATE products SET stock = ? WHERE id = ?').run(count, productId);
  },

  // Public transactional method
  autoDeliver(orderId) {
    const tx = db.transaction(() => {
      return this._performAutoDeliver(orderId);
    });
    return tx();
  },

  // Internal logic method (no transaction)
  _performAutoDeliver(orderId) {
    const order = this.getOrder(orderId);
    if (!order || order.status !== 'paid' || order.delivered_content) return false;

    const product = this.getProduct(order.product_id, false);
    if (!product || !product.auto_deliver) return false;

    const items = db.prepare('SELECT * FROM product_stock_pool WHERE product_id = ? AND is_sold = 0 LIMIT ?')
      .all(order.product_id, order.quantity);

    if (items.length < order.quantity) {
      // Not enough stock in pool! Log for admin.
      db.prepare("UPDATE orders SET admin_notes = 'AUTO-DELIVERY FAILED: Insufficient stock in pool.' WHERE id = ?")
        .run(orderId);
      return false;
    }

    const content = items.map(i => i.content).join('\n');
    const itemIds = items.map(i => i.id);

    // Mark items as sold
    const markSold = db.prepare('UPDATE product_stock_pool SET is_sold = 1, order_id = ? WHERE id = ?');
    for (const id of itemIds) markSold.run(orderId, id);

    // Update order
    db.prepare("UPDATE orders SET delivered_content = ?, status = 'delivered', delivered_at = datetime('now') WHERE id = ?")
      .run(content, orderId);

    this.syncProductStockCount(order.product_id);
    return true;
  },

  // Orders
  getOrder(idOrNumber) {
    const field = typeof idOrNumber === 'number' || /^\d+$/.test(idOrNumber) ? 'id' : 'order_number';
    return db.prepare(`SELECT * FROM orders WHERE ${field} = ?`).get(idOrNumber);
  },

  getOrderByRefAndEmail(ref, email) {
    return db.prepare('SELECT * FROM orders WHERE order_number = ? AND lower(email) = ?').get(ref, email.toLowerCase());
  },

  createOrder(data) {
    const info = db.prepare(`
      INSERT INTO orders
      (order_number, email, product_id, product_name, quantity, unit_price, total, currency, payment_type, manual_method_id, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
    `).run(
      data.orderNumber,
      data.email,
      data.productId,
      data.productName,
      data.quantity,
      data.unitPrice,
      data.total,
      data.currency,
      data.paymentType,
      data.manualMethodId
    );
    return this.getOrder(info.lastInsertRowid);
  },

  updateOrderStatus(orderId, status, paidAt = null) {
    const tx = db.transaction(() => {
      const order = this.getOrder(orderId);
      if (!order) return;

      const updateSql = paidAt
        ? "UPDATE orders SET status = ?, paid_at = ? WHERE id = ?"
        : "UPDATE orders SET status = ? WHERE id = ?";
      const params = paidAt ? [status, paidAt, orderId] : [status, orderId];

      db.prepare(updateSql).run(...params);

      // If transition to paid, decrease stock
      if (status === 'paid' && order.status !== 'paid' && order.status !== 'delivered' && order.product_id) {
        const product = this.getProduct(order.product_id, false);
        if (product && product.auto_deliver) {
          // We need the status to be 'paid' first (which we just did)
          // Use internal logic method to avoid nested transaction
          this._performAutoDeliver(orderId);
        } else {
          this.updateProductStock(order.product_id, -order.quantity);
        }
      }
    });
    tx();
  },

  deliverOrder(orderId, content) {
    db.prepare("UPDATE orders SET delivered_content = ?, status = 'delivered', delivered_at = datetime('now') WHERE id = ?")
      .run(content, orderId);
  },

  // Admin Stats
  getStats() {
    return {
      orders: db.prepare('SELECT COUNT(*) c FROM orders').get().c,
      pending: db.prepare("SELECT COUNT(*) c FROM orders WHERE status = 'pending'").get().c,
      paid: db.prepare("SELECT COUNT(*) c FROM orders WHERE status = 'paid'").get().c,
      delivered: db.prepare("SELECT COUNT(*) c FROM orders WHERE status = 'delivered'").get().c,
      revenue: db.prepare("SELECT COALESCE(SUM(total),0) s FROM orders WHERE status IN ('paid','delivered')").get().s,
      products: db.prepare('SELECT COUNT(*) c FROM products').get().c,
    };
  }
};

module.exports = StoreService;
