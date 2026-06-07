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

// Simple in-memory rate limiter for sensitive routes
const loginAttempts = new Map();
function rateLimit(req, res, next) {
  const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const now = Date.now();
  const limit = 5; // max 5 attempts
  const windowMs = 15 * 60 * 1000; // 15 minutes

  const attempts = loginAttempts.get(ip) || [];
  const recentAttempts = attempts.filter(t => now - t < windowMs);

  if (recentAttempts.length >= limit) {
    return res.status(429).render('error', {
      title: 'Too Many Requests',
      message: 'Too many login attempts. Please try again in 15 minutes.'
    });
  }

  recentAttempts.push(now);
  loginAttempts.set(ip, recentAttempts);
  next();
}

module.exports = { shopContext, requireAdmin, asyncHandler, rateLimit };
