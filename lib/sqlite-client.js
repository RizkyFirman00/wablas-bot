import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function createSqliteClient({ filename = "./data/sessions.sqlite", now = Date.now } = {}) {
  if (filename !== ":memory:") mkdirSync(dirname(resolve(filename)), { recursive: true });
  const db = new Database(filename);
  db.pragma("journal_mode = WAL");
  db.pragma("busy_timeout = 5000");
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
  `);
  const read = db.prepare("SELECT value FROM sessions WHERE key = ? AND expires_at > ?");
  const write = db.prepare(`
    INSERT INTO sessions (key, value, expires_at) VALUES (?, ?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, expires_at = excluded.expires_at
  `);
  const remove = db.prepare("DELETE FROM sessions WHERE key = ?");
  const prune = db.prepare("DELETE FROM sessions WHERE expires_at <= ?");
  const save = db.transaction((key, value, ex) => {
    const time = now();
    prune.run(time);
    write.run(key, value, time + ex * 1000);
  });

  return {
    get(key) {
      return read.get(key, now())?.value ?? null;
    },
    set(key, value, { ex }) {
      if (!Number.isFinite(ex) || ex <= 0) throw new Error("Invalid session expiry");
      save(key, value, ex);
      return "OK";
    },
    del(key) {
      return remove.run(key).changes;
    },
    check() {
      db.prepare("SELECT 1").get();
    },
    close() {
      db.close();
    },
  };
}
