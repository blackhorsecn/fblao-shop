'use strict';

const path = require('path');
const fs = require('fs');
const { openDatabase } = require('./sqlite');
const bcrypt = require('bcryptjs');

// DATA_DIR can be overridden (e.g. a mounted Railway volume at /data) so the
// SQLite file survives redeploys. Defaults to the local ./data folder.
const DATA_DIR = process.env.DATA_DIR
  ? path.resolve(process.env.DATA_DIR)
  : path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = openDatabase(path.join(DATA_DIR, 'shop.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  category_id INTEGER REFERENCES categories(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price       REAL NOT NULL DEFAULT 0,
  stock       INTEGER NOT NULL DEFAULT 0,
  active      INTEGER NOT NULL DEFAULT 1,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  auto_deliver INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS product_stock_pool (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
  content    TEXT NOT NULL,
  is_sold    INTEGER NOT NULL DEFAULT 0,
  order_id   INTEGER REFERENCES orders(id) ON DELETE SET NULL,
  added_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS manual_payment_methods (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  name         TEXT NOT NULL,
  instructions TEXT NOT NULL DEFAULT '',
  enabled      INTEGER NOT NULL DEFAULT 1,
  sort_order   INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS banners (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  text       TEXT NOT NULL,
  enabled    INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number     TEXT UNIQUE NOT NULL,
  email            TEXT NOT NULL,
  product_id       INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name     TEXT NOT NULL,
  quantity         INTEGER NOT NULL DEFAULT 1,
  unit_price       REAL NOT NULL DEFAULT 0,
  total            REAL NOT NULL DEFAULT 0,
  currency         TEXT NOT NULL DEFAULT 'PHP',
  payment_type     TEXT NOT NULL DEFAULT 'maya',
  manual_method_id INTEGER REFERENCES manual_payment_methods(id) ON DELETE SET NULL,
  status           TEXT NOT NULL DEFAULT 'pending',
  maya_checkout_id TEXT,
  maya_reference   TEXT,
  delivered_content TEXT,
  admin_notes      TEXT,
  created_at       TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at          TEXT,
  delivered_at     TEXT
);
`);

// Migrations for existing database
try { db.exec("ALTER TABLE products ADD COLUMN auto_deliver INTEGER NOT NULL DEFAULT 1"); } catch(e){}

// ---------------------------------------------------------------------------
// Settings helpers
// ---------------------------------------------------------------------------
const getSettingStmt = db.prepare('SELECT value FROM settings WHERE key = ?');
const setSettingStmt = db.prepare(
  'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);

function getSetting(key, fallback = null) {
  const row = getSettingStmt.get(key);
  return row ? row.value : fallback;
}
function setSetting(key, value) {
  setSettingStmt.run(key, value == null ? '' : String(value));
}
function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = {};
  for (const r of rows) out[r.key] = r.value;
  return out;
}

// ---------------------------------------------------------------------------
// First-run seeding
// ---------------------------------------------------------------------------
function seed() {
  const seeded = getSetting('seeded');
  if (seeded === '1') return;

  const defaults = {
    shop_name: '狮子王工作室 — FB账号BM批发',
    shop_tagline: 'Premium digital accounts · Instant delivery · 24/7 auto-shop',
    currency: process.env.CURRENCY || 'PHP',
    maya_mode: process.env.MAYA_MODE || 'sandbox',
    maya_public_key: process.env.MAYA_PUBLIC_KEY || '',
    maya_secret_key: process.env.MAYA_SECRET_KEY || '',
    maya_webhook_secret: process.env.MAYA_WEBHOOK_SECRET || '',
    maya_enabled: process.env.MAYA_PUBLIC_KEY ? '1' : '0',
  };
  for (const [k, v] of Object.entries(defaults)) setSetting(k, v);

  // Seed admin from env
  const username = process.env.ADMIN_USERNAME || 'admin';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const exists = db.prepare('SELECT id FROM admins WHERE username = ?').get(username);
  if (!exists) {
    db.prepare('INSERT INTO admins (username, password_hash) VALUES (?, ?)').run(
      username,
      bcrypt.hashSync(password, 10)
    );
  }

  // Banners
  const insBanner = db.prepare('INSERT INTO banners (text, enabled, sort_order) VALUES (?, 1, ?)');
  insBanner.run('🎉 Welcome! All accounts are delivered instantly after payment is confirmed.', 1);
  insBanner.run('💬 Need help? Use "Query Order" to check your order status anytime.', 2);

  // Manual payment methods
  const insManual = db.prepare(
    'INSERT INTO manual_payment_methods (name, instructions, enabled, sort_order) VALUES (?, ?, 1, ?)'
  );
  insManual.run(
    'GCash',
    'Send the exact total to GCash number 0917-000-0000 (Juan D.).\nUse your ORDER NUMBER as the reference/note.\nAfter sending, your order will be confirmed by our staff, usually within 30 minutes.',
    1
  );
  insManual.run(
    'Bank Transfer (BPI)',
    'Transfer the exact total to:\nBank: BPI\nAccount Name: Lion King Studio\nAccount No: 1234-5678-90\nUse your ORDER NUMBER as the reference.\nUpload nothing — we verify by reference number.',
    2
  );

  // Categories + products (sample catalog matching an FB-account autoshop)
  const insCat = db.prepare('INSERT INTO categories (name, sort_order) VALUES (?, ?)');
  const insProd = db.prepare(
    'INSERT INTO products (category_id, name, description, price, stock, active, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  const catFB = insCat.run('Facebook Accounts', 1).lastInsertRowid;
  insProd.run(catFB, 'FB Aged Account (2018-2020)', 'Email-verified, with profile photo. Random country.', 120, 35, 1, 1);
  insProd.run(catFB, 'FB Account + 2FA', 'Includes 2FA secret. Cookie + token provided.', 180, 20, 1, 2);
  insProd.run(catFB, 'FB Brand New (PVA)', 'Phone-verified fresh account. Ready to warm up.', 60, 100, 1, 3);

  const catBM = insCat.run('Business Manager (BM)', 2).lastInsertRowid;
  insProd.run(catBM, 'BM1 (Limit 250)', 'Verified BM, 1 ad account, $250 daily limit.', 350, 12, 1, 1);
  insProd.run(catBM, 'BM5 (No Limit)', 'Verified BM, 5 ad accounts, unlimited spend.', 1500, 4, 1, 2);

  const catMail = insCat.run('Email & Tools', 3).lastInsertRowid;
  insProd.run(catMail, 'Outlook Email (Aged)', 'Full access, used for account recovery.', 25, 200, 1, 1);
  insProd.run(catMail, 'Proxy (Residential, 1 month)', 'Static residential proxy, PH/US location.', 90, 50, 1, 2);

  setSetting('seeded', '1');
}

seed();

module.exports = { db, getSetting, setSetting, getSettings };
