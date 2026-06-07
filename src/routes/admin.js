'use strict';

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const { db, getSetting, setSetting } = require('../db');
const { requireAdmin, asyncHandler, rateLimit } = require('../middleware');
const StoreService = require('../services/store');

// ---- Auth ------------------------------------------------------------------
router.get('/login', (req, res) => {
  if (req.session && req.session.adminId) return res.redirect('/admin');
  res.render('admin/login', { title: 'Admin Login', error: null, layout: false });
});

router.post('/login', rateLimit, (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const admin = db.prepare('SELECT * FROM admins WHERE username = ?').get(username);
  if (!admin || !bcrypt.compareSync(password, admin.password_hash)) {
    return res.status(401).render('admin/login', { title: 'Admin Login', error: 'Invalid username or password.', layout: false });
  }
  req.session.adminId = admin.id;
  req.session.adminName = admin.username;
  res.redirect('/admin');
});

router.post('/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/admin/login'));
});

// Everything below requires auth.
router.use(requireAdmin);

function flash(req, msg, type = 'ok') {
  req.session.flash = { msg, type };
}
function takeFlash(req) {
  const f = req.session.flash || null;
  delete req.session.flash;
  return f;
}

// ---- Dashboard / Orders ----------------------------------------------------
router.get('/', (req, res) => {
  const stats = StoreService.getStats();
  const filter = String(req.query.status || 'all');
  const search = String(req.query.search || '').trim().toLowerCase();

  let orders;
  let sql = 'SELECT * FROM orders';
  let params = [];
  let conditions = [];

  if (filter !== 'all') {
    conditions.push('status = ?');
    params.push(filter);
  }

  if (search) {
    conditions.push('(order_number LIKE ? OR email LIKE ? OR telegram_username LIKE ?)');
    const p = `%${search}%`;
    params.push(p, p, p);
  }

  if (conditions.length > 0) {
    sql += ' WHERE ' + conditions.join(' AND ');
  }

  sql += ' ORDER BY id DESC LIMIT 200';
  orders = db.prepare(sql).all(...params);

  res.render('admin/orders', { title: 'Orders', active: 'orders', orders, stats, filter, search, flash: takeFlash(req) });
});

router.get('/orders/:id', (req, res) => {
  const order = StoreService.getOrder(req.params.id);
  if (!order) return res.redirect('/admin');
  const manualMethod = order.manual_method_id
    ? db.prepare('SELECT * FROM manual_payment_methods WHERE id = ?').get(order.manual_method_id)
    : null;
  res.render('admin/order', { title: 'Order ' + order.order_number, active: 'orders', order, manualMethod, flash: takeFlash(req) });
});

// Mark a manual (or pending) order as paid.
router.post('/orders/:id/mark-paid', (req, res) => {
  const order = StoreService.getOrder(req.params.id);
  if (order && (order.status === 'pending')) {
    StoreService.updateOrderStatus(order.id, 'paid', "datetime('now')");
    flash(req, 'Order marked as paid.');
  }
  res.redirect('/admin/orders/' + req.params.id);
});

// Deliver digital goods (account credentials) to the customer.
router.post('/orders/:id/deliver', (req, res) => {
  const order = StoreService.getOrder(req.params.id);
  if (!order) return res.redirect('/admin');
  const content = String(req.body.delivered_content || '').trim();
  if (!content) {
    flash(req, 'Delivery content cannot be empty.', 'error');
    return res.redirect('/admin/orders/' + req.params.id);
  }
  StoreService.deliverOrder(order.id, content);
  flash(req, 'Goods delivered. Customer can now see the content on their order page.');
  res.redirect('/admin/orders/' + req.params.id);
});

router.post('/orders/:id/notes', (req, res) => {
  db.prepare('UPDATE orders SET admin_notes = ? WHERE id = ?').run(String(req.body.admin_notes || ''), req.params.id);
  flash(req, 'Notes saved.');
  res.redirect('/admin/orders/' + req.params.id);
});

router.post('/orders/:id/cancel', (req, res) => {
  db.prepare("UPDATE orders SET status = 'cancelled' WHERE id = ? AND status = 'pending'").run(req.params.id);
  flash(req, 'Order cancelled.');
  res.redirect('/admin/orders/' + req.params.id);
});

// ---- Categories ------------------------------------------------------------
router.get('/categories', (req, res) => {
  const categories = StoreService.getCategories();
  res.render('admin/categories', { title: 'Categories', active: 'categories', categories, flash: takeFlash(req) });
});
router.post('/categories', (req, res) => {
  StoreService.createCategory(
    String(req.body.name || 'Untitled').trim(),
    parseInt(req.body.sort_order, 10) || 0
  );
  flash(req, 'Category added.');
  res.redirect('/admin/categories');
});
router.post('/categories/:id/update', (req, res) => {
  StoreService.updateCategory(
    req.params.id,
    String(req.body.name || '').trim(),
    parseInt(req.body.sort_order, 10) || 0
  );
  flash(req, 'Category updated.');
  res.redirect('/admin/categories');
});
router.post('/categories/:id/delete', (req, res) => {
  StoreService.deleteCategory(req.params.id);
  flash(req, 'Category and its products deleted.');
  res.redirect('/admin/categories');
});

// ---- Products --------------------------------------------------------------
router.get('/products', (req, res) => {
  const categories = StoreService.getCategories();
  const search = String(req.query.search || '').trim().toLowerCase();
  const catFilter = parseInt(req.query.category_id, 10) || null;

  let products;
  if (search || catFilter) {
    let sql = `SELECT p.*, c.name AS category_name FROM products p
               LEFT JOIN categories c ON c.id = p.category_id
               WHERE 1=1`;
    let params = [];
    if (search) {
      sql += ' AND (p.name LIKE ? OR p.description LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }
    if (catFilter) {
      sql += ' AND p.category_id = ?';
      params.push(catFilter);
    }
    sql += ' ORDER BY c.sort_order, p.sort_order, p.id';
    products = db.prepare(sql).all(...params);
  } else {
    products = StoreService.getProductsAdmin();
  }

  res.render('admin/products', {
    title: 'Products',
    active: 'products',
    products,
    categories,
    search,
    catFilter,
    flash: takeFlash(req)
  });
});

router.post('/products/sync-all', (req, res) => {
  StoreService.syncAllProductStock();
  flash(req, 'All product stock counts synchronized.');
  res.redirect('/admin/products');
});

router.post('/products', (req, res) => {
  StoreService.createProduct({
    category_id: parseInt(req.body.category_id, 10),
    name: String(req.body.name || 'Untitled').trim(),
    description: String(req.body.description || ''),
    price: parseFloat(req.body.price),
    active: !!req.body.active,
    sort_order: parseInt(req.body.sort_order, 10),
    auto_deliver: !!req.body.auto_deliver
  });
  flash(req, 'Product added.');
  res.redirect('/admin/products');
});
router.post('/products/:id/update', (req, res) => {
  StoreService.updateProduct(req.params.id, {
    category_id: parseInt(req.body.category_id, 10),
    name: String(req.body.name || '').trim(),
    description: String(req.body.description || ''),
    price: parseFloat(req.body.price),
    active: !!req.body.active,
    sort_order: parseInt(req.body.sort_order, 10),
    auto_deliver: !!req.body.auto_deliver
  });

  if (req.body.action === 'quick_add' && req.body.quick_lines) {
    const lines = String(req.body.quick_lines).split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length > 0) {
      const added = StoreService.addStockToPool(req.params.id, lines);
      flash(req, `Product updated and ${added} stock items added.`);
    } else {
      flash(req, 'Product updated.');
    }
  } else {
    flash(req, 'Product updated.');
  }

  res.redirect('/admin/products');
});

router.post('/products/:id/duplicate', (req, res) => {
  const p = StoreService.getProduct(req.params.id, false);
  if (p) {
    StoreService.createProduct({
      category_id: p.category_id,
      name: p.name + ' (Copy)',
      description: p.description,
      price: p.price,
      active: 0,
      sort_order: p.sort_order + 1,
      auto_deliver: p.auto_deliver
    });
    flash(req, 'Product duplicated as draft.');
  }
  res.redirect('/admin/products');
});

// Stock Pool Routes
router.get('/products/:id/stock', (req, res) => {
  const product = StoreService.getProduct(req.params.id, false);
  if (!product) return res.redirect('/admin/products');

  const pool = db.prepare('SELECT * FROM product_stock_pool WHERE product_id = ? AND is_sold = 0 ORDER BY id DESC').all(product.id);
  const sold = db.prepare(`
    SELECT p.*, o.order_number
    FROM product_stock_pool p
    LEFT JOIN orders o ON o.id = p.order_id
    WHERE p.product_id = ? AND p.is_sold = 1
    ORDER BY p.id DESC LIMIT 100
  `).all(product.id);

  res.render('admin/product-stock', { title: 'Manage Stock: ' + product.name, active: 'products', product, pool, sold, flash: takeFlash(req) });
});

router.post('/products/:id/stock/add', (req, res) => {
  const lines = String(req.body.lines || '').split('\n').map(l => l.trim()).filter(l => l);
  if (lines.length > 0) {
    const added = StoreService.addStockToPool(req.params.id, lines);
    flash(req, `Processed ${lines.length} lines. ${added} new items added to stock.`);
  }
  res.redirect(`/admin/products/${req.params.id}/stock`);
});

router.post('/products/:id/stock/clear', (req, res) => {
  db.prepare('DELETE FROM product_stock_pool WHERE product_id = ? AND is_sold = 0').run(req.params.id);
  StoreService.syncProductStockCount(req.params.id);
  flash(req, 'Unsold stock cleared.');
  res.redirect(`/admin/products/${req.params.id}/stock`);
});
router.post('/products/:id/delete', (req, res) => {
  StoreService.deleteProduct(req.params.id);
  flash(req, 'Product deleted.');
  res.redirect('/admin/products');
});

// ---- Manual payment methods ------------------------------------------------
router.get('/payments', (req, res) => {
  const methods = db.prepare('SELECT * FROM manual_payment_methods ORDER BY sort_order, id').all();
  res.render('admin/payments', { title: 'Manual Payments', active: 'payments', methods, flash: takeFlash(req) });
});
router.post('/payments', (req, res) => {
  db.prepare('INSERT INTO manual_payment_methods (name, instructions, enabled, sort_order) VALUES (?, ?, ?, ?)').run(
    String(req.body.name || 'Method').trim(),
    String(req.body.instructions || ''),
    req.body.enabled ? 1 : 0,
    parseInt(req.body.sort_order, 10) || 0
  );
  flash(req, 'Payment method added.');
  res.redirect('/admin/payments');
});
router.post('/payments/:id/update', (req, res) => {
  db.prepare('UPDATE manual_payment_methods SET name = ?, instructions = ?, enabled = ?, sort_order = ? WHERE id = ?').run(
    String(req.body.name || '').trim(),
    String(req.body.instructions || ''),
    req.body.enabled ? 1 : 0,
    parseInt(req.body.sort_order, 10) || 0,
    req.params.id
  );
  flash(req, 'Payment method updated.');
  res.redirect('/admin/payments');
});
router.post('/payments/:id/delete', (req, res) => {
  db.prepare('DELETE FROM manual_payment_methods WHERE id = ?').run(req.params.id);
  flash(req, 'Payment method deleted.');
  res.redirect('/admin/payments');
});

// ---- Banners ---------------------------------------------------------------
router.get('/banners', (req, res) => {
  const banners = db.prepare('SELECT * FROM banners ORDER BY sort_order, id').all();
  res.render('admin/banners', { title: 'Banners', active: 'banners', banners, flash: takeFlash(req) });
});
router.post('/banners', (req, res) => {
  db.prepare('INSERT INTO banners (text, enabled, sort_order) VALUES (?, ?, ?)').run(
    String(req.body.text || '').trim(),
    req.body.enabled ? 1 : 0,
    parseInt(req.body.sort_order, 10) || 0
  );
  flash(req, 'Banner added.');
  res.redirect('/admin/banners');
});
router.post('/banners/:id/update', (req, res) => {
  db.prepare('UPDATE banners SET text = ?, enabled = ?, sort_order = ? WHERE id = ?').run(
    String(req.body.text || '').trim(),
    req.body.enabled ? 1 : 0,
    parseInt(req.body.sort_order, 10) || 0,
    req.params.id
  );
  flash(req, 'Banner updated.');
  res.redirect('/admin/banners');
});
router.post('/banners/:id/delete', (req, res) => {
  db.prepare('DELETE FROM banners WHERE id = ?').run(req.params.id);
  flash(req, 'Banner deleted.');
  res.redirect('/admin/banners');
});

// ---- Settings (shop + Maya) ------------------------------------------------
router.get('/settings', (req, res) => {
  res.render('admin/settings', {
    title: 'Settings',
    active: 'settings',
    s: {
      shop_name: getSetting('shop_name', ''),
      shop_tagline: getSetting('shop_tagline', ''),
      currency: getSetting('currency', 'PHP'),
      maya_enabled: getSetting('maya_enabled', '0'),
      maya_mode: getSetting('maya_mode', 'sandbox'),
      maya_public_key: getSetting('maya_public_key', ''),
      maya_secret_key: getSetting('maya_secret_key', ''),
      maya_webhook_secret: getSetting('maya_webhook_secret', ''),
      cf_turnstile_site_key: getSetting('cf_turnstile_site_key', ''),
      cf_turnstile_secret_key: getSetting('cf_turnstile_secret_key', ''),
      cf_site_verification: getSetting('cf_site_verification', ''),
    },
    flash: takeFlash(req),
  });
});
router.post('/settings', (req, res) => {
  setSetting('shop_name', String(req.body.shop_name || '').trim());
  setSetting('shop_tagline', String(req.body.shop_tagline || '').trim());
  setSetting('currency', String(req.body.currency || 'PHP').trim().toUpperCase());
  flash(req, 'Shop settings saved.');
  res.redirect('/admin/settings');
});
router.post('/settings/maya', (req, res) => {
  setSetting('maya_enabled', req.body.maya_enabled ? '1' : '0');
  setSetting('maya_mode', req.body.maya_mode === 'live' ? 'live' : 'sandbox');
  setSetting('maya_public_key', String(req.body.maya_public_key || '').trim());
  setSetting('maya_secret_key', String(req.body.maya_secret_key || '').trim());
  setSetting('maya_webhook_secret', String(req.body.maya_webhook_secret || '').trim());
  flash(req, 'Maya configuration saved.');
  res.redirect('/admin/settings');
});

router.post('/settings/cloudflare', (req, res) => {
  setSetting('cf_turnstile_site_key', String(req.body.cf_turnstile_site_key || '').trim());
  setSetting('cf_turnstile_secret_key', String(req.body.cf_turnstile_secret_key || '').trim());
  setSetting('cf_site_verification', String(req.body.cf_site_verification || '').trim());
  flash(req, 'Cloudflare settings saved.');
  res.redirect('/admin/settings');
});

// Change admin password
router.post('/settings/password', (req, res) => {
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.session.adminId);
  const current = String(req.body.current_password || '');
  const next = String(req.body.new_password || '');
  if (!admin || !bcrypt.compareSync(current, admin.password_hash)) {
    flash(req, 'Current password is incorrect.', 'error');
    return res.redirect('/admin/settings');
  }
  if (next.length < 6) {
    flash(req, 'New password must be at least 6 characters.', 'error');
    return res.redirect('/admin/settings');
  }
  db.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(next, 10), admin.id);
  flash(req, 'Password updated.');
  res.redirect('/admin/settings');
});

module.exports = router;
