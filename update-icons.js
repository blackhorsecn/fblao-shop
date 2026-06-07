const path = require('path');
const { db } = require('./src/db');

console.log('Updating manual_payment_methods icon_url to local static assets...');
const updates = [
  ['/static/img/payments/gcash.svg', '%GCash%'],
  ['/static/img/payments/bpi.svg', '%BPI%'],
  ['/static/img/payments/unionbank.svg', '%UnionBank%'],
];
let changed = 0;
for (const [url, namePattern] of updates) {
  const stmt = db.prepare('UPDATE manual_payment_methods SET icon_url = ? WHERE name LIKE ?');
  const info = stmt.run(url, namePattern);
  if (info && info.changes) changed += info.changes;
}
console.log('Updated rows:', changed);
process.exit(0);
