/**
 * One-time seed: one asset and one active (overdue) loan for integration testing.
 * Run: node scripts/seed-test-loan.js
 */
const { db } = require('../database');

const now = new Date();
const outDate = new Date(now);
outDate.setDate(outDate.getDate() - 10);
const dueDate = new Date(outDate);
dueDate.setDate(dueDate.getDate() + 7);

const assetId = 'LAP-TEST-001';
const outStr = outDate.toISOString();
const dueStr = dueDate.toISOString();

db.exec('BEGIN');
try {
  db.prepare(
    `INSERT OR IGNORE INTO assets (id, type, status, created_at) VALUES (?, ?, ?, ?)`
  ).run(assetId, 'Laptop', 'Loaned', now.toISOString());
  db.prepare("UPDATE assets SET status = 'Loaned' WHERE id = ?").run(assetId);
  db.prepare(
    `INSERT INTO loans (asset_id, staff_name, staff_email, out_date, due_date, in_date) VALUES (?, ?, ?, ?, ?, NULL)`
  ).run(assetId, 'Test User', 'test@school.edu', outStr, dueStr);
  db.exec('COMMIT');
  console.log('Seed OK: asset', assetId, 'and one overdue active loan.');
} catch (e) {
  db.exec('ROLLBACK');
  console.error(e);
  process.exit(1);
}
