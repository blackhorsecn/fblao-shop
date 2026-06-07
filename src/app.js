'use strict';

require('dotenv').config();
const path = require('path');
const express = require('express');
const session = require('express-session');

const { shopContext } = require('./middleware');
const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');
const webhookRoutes = require('./routes/webhook');

const app = express();
const PORT = process.env.PORT || 3000;

// Security: Hide Express version
app.disable('x-powered-by');

// Security: Basic headers (poor man's helmet)
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// Railway (and most PaaS) terminate TLS at a proxy; trust it so req.protocol is https.
app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

// Capture the raw body for webhook signature verification.
app.use(
  express.json({
    limit: '10kb', // Security: limit payload size
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use('/static', express.static(path.join(__dirname, '..', 'public')));

const isProd = process.env.NODE_ENV === 'production';

// Security: Ensure SESSION_SECRET is set in production
if (isProd && (!process.env.SESSION_SECRET || process.env.SESSION_SECRET === 'dev-secret')) {
  console.warn('WARNING: SESSION_SECRET is not set or using default value in production!');
}

app.use(
  session({
    name: '__shop_sid', // Security: hide session cookie name
    secret: process.env.SESSION_SECRET || 'dev-secret',
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 8,
      secure: isProd, // Only send over HTTPS in production
      sameSite: isProd ? 'lax' : 'none',
    },
  })
);

// Expose shop settings + helpers to all templates.
app.use(shopContext);

// Health check (used by Railway).
app.get('/health', (req, res) => res.status(200).json({ ok: true }));

app.use('/', publicRoutes);
app.use('/admin', adminRoutes);
app.use('/webhooks', webhookRoutes);

// 404
app.use((req, res) => {
  res.status(404).render('error', { title: 'Not Found', message: 'Page not found.' });
});

// Error handler
app.use((err, req, res, _next) => {
  console.error(err);
  res.status(500).render('error', { title: 'Error', message: err.message || 'Something went wrong.' });
});

app.listen(PORT, () => {
  console.log(`\n  Lion King Studio shop running:  http://localhost:${PORT}`);
  console.log(`  Admin panel:                    http://localhost:${PORT}/admin\n`);
});
