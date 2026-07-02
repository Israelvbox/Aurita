import Database from 'better-sqlite3';

let db;

export function initDb(filePath) {
  db = new Database(filePath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS secure_kv (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cache (
      scope TEXT NOT NULL,
      key TEXT NOT NULL,
      json TEXT NOT NULL,
      expires_at INTEGER,
      PRIMARY KEY (scope, key)
    );

    CREATE TABLE IF NOT EXISTS listen_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      item_id TEXT NOT NULL,
      name TEXT,
      artist TEXT,
      genres TEXT,
      played_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_history_played_at ON listen_history (played_at);
    CREATE INDEX IF NOT EXISTS idx_history_item ON listen_history (item_id);
  `);

  return db;
}

export function getDb() {
  return db || null;
}
