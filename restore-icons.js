const { db } = require('./src/db');

console.log('Restoring manual_payment_methods.icon_url to official remote branding URLs...');
const updates = [
  ['https://upload.wikimedia.org/wikipedia/commons/e/eb/GCash_logo.svg', '%GCash%'],
  ['https://upload.wikimedia.org/wikipedia/commons/e/ee/BPI_Logo.svg', '%BPI%'],
  ['https://upload.wikimedia.org/wikipedia/commons/c/c8/UnionBank_of_the_Philippines_logo.svg', '%UnionBank%'],
];
let changed = 0;
for (const [url, pattern] of updates) {
  const stmt = db.prepare('UPDATE manual_payment_methods SET icon_url = ? WHERE name LIKE ?');
  const info = stmt.run(url, pattern);
  if (info && info.changes) changed += info.changes;
}
console.log('Updated rows:', changed);
process.exit(0);
