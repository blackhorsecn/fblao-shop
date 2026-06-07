'use strict';

const { getSettings } = require('./db');
const { formatMoney, nl2br, escapeHtml } = require('./helpers');

function shopContext(req, res, next) {
  const settings = getSettings();
  res.locals.settings = settings;
  res.locals.shopName = settings.shop_name || 'Shop';
  res.locals.shopTagline = settings.shop_tagline || '';
  res.locals.currency = settings.currency || 'PHP';
  res.locals.money = (amt) => formatMoney(amt, settings.currency || 'PHP');
  res.locals.nl2br = nl2br;
  res.locals.escapeHtml = escapeHtml;
  res.locals.isAdmin = !!(req.session && req.session.adminId);
  res.locals.currentPath = req.path;
  res.locals.baseUrl = (process.env.BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
  next();
}

function requireAdmin(req, res, next) {
  if (req.session && req.session.adminId) return next();
  if (req.xhr || req.headers.accept.indexOf('json') > -1) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  return res.redirect('/admin/login');
}

// Wrapper for async routes to catch errors
const asyncHandler = (fn) => (req, res, next) => {
  return Promise.resolve(fn(req, res, next)).catch(next);
};

module.exports = { shopContext, requireAdmin, asyncHandler };
