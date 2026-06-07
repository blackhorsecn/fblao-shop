'use strict';

// Thin wrapper around Node's built-in `node:sqlite` (DatabaseSync) that exposes
// the small subset of the better-sqlite3 API this project uses: prepare(), exec(),
// pragma(), and transaction(). No native compilation required.
const { DatabaseSync } = require('node:sqlite');

function openDatabase(filePath) {
  const handle = new DatabaseSync(filePath);

  return {
    _handle: handle,
    prepare: (sql) => handle.prepare(sql),
    exec: (sql) => handle.exec(sql),
    pragma: (statement) => handle.exec(`PRAGMA ${statement};`),
    // Mimic better-sqlite3's db.transaction(fn): returns a wrapped function that
    // runs fn inside BEGIN/COMMIT, rolling back on any thrown error.
    transaction: (fn) =>
      function (...args) {
        handle.exec('BEGIN');
        try {
          const result = fn.apply(this, args);
          handle.exec('COMMIT');
          return result;
        } catch (err) {
          try { handle.exec('ROLLBACK'); } catch (_) { /* ignore */ }
          throw err;
        }
      },
  };
}

module.exports = { openDatabase };
