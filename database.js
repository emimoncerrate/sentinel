const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const dataDir = process.env.DATA_DIR || path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'sentinel.db');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(dbPath);

const schema = `
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('Available', 'Loaned', 'Repair', 'Pending')),
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS loans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id TEXT NOT NULL REFERENCES assets(id),
  staff_name TEXT,
  staff_email TEXT,
  out_date TEXT NOT NULL,
  due_date TEXT NOT NULL,
  in_date TEXT,
  returned_at TEXT,
  FOREIGN KEY (asset_id) REFERENCES assets(id)
);

CREATE TABLE IF NOT EXISTS reservations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  asset_id TEXT NOT NULL REFERENCES assets(id),
  staff_name TEXT,
  staff_email TEXT,
  reserved_start TEXT NOT NULL,
  reserved_end TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (asset_id) REFERENCES assets(id)
);
`;

db.exec(schema);

// One-time migration for existing DBs: add Pending to assets CHECK and returned_at to loans
const migrations = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version INTEGER PRIMARY KEY,
  name TEXT NOT NULL
);
`;
db.exec(migrations);

function hasMigrationRun(version) {
  const row = db.prepare('SELECT 1 FROM schema_migrations WHERE version = ?').get(version);
  return !!row;
}

function runMigration1() {
  if (hasMigrationRun(1)) return;

  db.exec('PRAGMA foreign_keys = OFF');
  try {
    // Recreate assets with Pending in CHECK (SQLite cannot alter CHECK)
    db.exec(`
      DROP TABLE IF EXISTS assets_new;
      CREATE TABLE assets_new (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        status TEXT NOT NULL CHECK(status IN ('Available', 'Loaned', 'Repair', 'Pending')),
        created_at TEXT NOT NULL
      );
      INSERT INTO assets_new SELECT id, type, status, created_at FROM assets;
      DROP TABLE assets;
      ALTER TABLE assets_new RENAME TO assets;
    `);
  } finally {
    db.exec('PRAGMA foreign_keys = ON');
  }

  // Add returned_at to loans if missing
  const columns = db.prepare("PRAGMA table_info(loans)").all();
  const hasReturnedAt = columns.some((c) => c.name === 'returned_at');
  if (!hasReturnedAt) {
    db.exec('ALTER TABLE loans ADD COLUMN returned_at TEXT');
  }

  db.prepare('INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (1, ?)').run('pending_and_returned_at');
}

function runMigration2() {
  if (hasMigrationRun(2)) return;
  db.exec(`
    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      asset_id TEXT NOT NULL REFERENCES assets(id),
      staff_name TEXT,
      staff_email TEXT,
      reserved_start TEXT NOT NULL,
      reserved_end TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (asset_id) REFERENCES assets(id)
    )
  `);
  db.prepare('INSERT OR IGNORE INTO schema_migrations (version, name) VALUES (2, ?)').run('reservations_table');
}

runMigration1();
runMigration2();

function getDb() {
  return db;
}

module.exports = { getDb, db };
