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

console.log(`[Database] Initialized at ${path.join(DATA_DIR, 'shop.db')}`);
if (process.env.DATA_DIR) {
  console.log(`[Database] Using persistent DATA_DIR: ${process.env.DATA_DIR}`);
} else {
  console.log(`[Database] WARNING: No DATA_DIR env var set. Data will be lost on redeploy!`);
}

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
  email            TEXT,
  product_id       INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name     TEXT NOT NULL,
  quantity         INTEGER NOT NULL DEFAULT 1,
  unit_price       REAL NOT NULL DEFAULT 0,
  total            REAL NOT NULL DEFAULT 0,
  currency         TEXT NOT NULL DEFAULT 'PHP',
  payment_type     TEXT NOT NULL DEFAULT 'maya',
  manual_method_id INTEGER REFERENCES manual_payment_methods(id) ON DELETE SET NULL,
  telegram_username TEXT,
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
try { db.exec("ALTER TABLE orders ADD COLUMN telegram_username TEXT"); } catch(e){}
try { db.exec("ALTER TABLE orders ALTER COLUMN email DROP NOT NULL"); } catch(e){
  // SQLite doesn't support DROP NOT NULL directly, we'll just ignore it as it usually allows nulls if not strictly checked
}

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
// Seeding & Syncing (Persistent Storage Management)
// ---------------------------------------------------------------------------
function seed() {
  // Always allow environment variables to override sensitive or key settings on startup/re-deployment.
  // This ensures that if you update keys in Railway, they are applied to the database.
  const syncFromEnv = {
    currency: process.env.CURRENCY,
    maya_mode: process.env.MAYA_MODE,
    maya_public_key: process.env.MAYA_PUBLIC_KEY,
    maya_secret_key: process.env.MAYA_SECRET_KEY,
    maya_webhook_secret: process.env.MAYA_WEBHOOK_SECRET,
  };

  for (const [k, v] of Object.entries(syncFromEnv)) {
    if (v !== undefined) {
      setSetting(k, v);
      if (k === 'maya_public_key' && v) setSetting('maya_enabled', '1');
    }
  }

  // If already seeded OR if we have any categories/products, skip the initial content creation
  const seeded = getSetting('seeded');
  const hasCategories = db.prepare('SELECT id FROM categories LIMIT 1').get();
  if (seeded === '1' || hasCategories) return;

  const defaults = {
    shop_name: '狮子王工作室 — FB账号BM批发',
    shop_tagline: 'Premium digital accounts · Instant delivery · 24/7 auto-shop',
    currency: process.env.CURRENCY || 'PHP',
    maya_mode: process.env.MAYA_MODE || 'sandbox',
    maya_public_key: process.env.MAYA_PUBLIC_KEY || '',
    maya_secret_key: process.env.MAYA_SECRET_KEY || '',
    maya_webhook_secret: process.env.MAYA_WEBHOOK_SECRET || '',
    maya_enabled: process.env.MAYA_PUBLIC_KEY ? '1' : '0',
    telegram_bot_username: process.env.TELEGRAM_BOT_USERNAME || '',
  };
  for (const [k, v] of Object.entries(defaults)) {
    // Only set if not already set by the env-sync above
    if (getSetting(k) === null) setSetting(k, v);
  }

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

  // Categories + products
  const insCat = db.prepare('INSERT INTO categories (name, sort_order) VALUES (?, ?)');
  const insProd = db.prepare(
    'INSERT INTO products (category_id, name, description, price, stock, active, sort_order, auto_deliver) VALUES (?, ?, ?, ?, ?, ?, ?, 1)'
  );

  const catBanks = insCat.run('Verified Bank Accounts', 1).lastInsertRowid;
  insProd.run(catBanks, 'BPI', 'Verified digital account.', 1500, 34, 1, 1);
  insProd.run(catBanks, 'CIMB', 'Verified digital account.', 1500, 0, 1, 2);
  insProd.run(catBanks, 'COINS PH CORPORATE', 'Verified digital account.', 20000, 0, 1, 3);
  insProd.run(catBanks, 'GCASH 100K', 'Verified digital account.', 1000, 0, 1, 4);
  insProd.run(catBanks, 'GCASH 500K', 'Verified digital account.', 3000, 1, 1, 5);
  insProd.run(catBanks, 'GOTYME', 'Verified digital account.', 1500, 5, 1, 6);
  insProd.run(catBanks, 'MAYA BUSINESS NEGOSYANTE', 'Verified digital account.', 900, 65, 1, 7);
  insProd.run(catBanks, 'NEW MAYA BUSINESS', 'Verified digital account.', 900, 15, 1, 8);
  insProd.run(catBanks, 'PAYMAYA 5M', 'Verified digital account.', 15000, 2, 1, 9);
  insProd.run(catBanks, 'PAYMAYA 500K', 'Verified digital account.', 900, 56, 1, 10);
  insProd.run(catBanks, 'POS', 'Verified digital account.', 80000, 3, 1, 11);
  insProd.run(catBanks, 'RCBC', 'Verified digital account.', 1500, 10, 1, 12);
  insProd.run(catBanks, 'UNION BANK NEGOSYANTE', 'Verified digital account.', 20000, 5, 1, 13);

  setSetting('seeded', '1');
}

seed();

module.exports = { db, getSetting, setSetting, getSettings };
