import type { DatabaseSync } from "node:sqlite";

export const SCHEMA_VERSION = 1;

const STATEMENTS: string[] = [
  "PRAGMA journal_mode = WAL",
  "PRAGMA foreign_keys = ON",
  "PRAGMA busy_timeout = 5000",
  `CREATE TABLE IF NOT EXISTS users (
    id            TEXT PRIMARY KEY,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'member',
    timezone      TEXT NOT NULL DEFAULT 'Asia/Shanghai',
    disabled      INTEGER NOT NULL DEFAULT 0,
    created_at    INTEGER NOT NULL,
    updated_at    INTEGER NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash   TEXT NOT NULL UNIQUE,
    created_at   INTEGER NOT NULL,
    last_used_at INTEGER NOT NULL,
    expires_at   INTEGER NOT NULL,
    revoked_at   INTEGER,
    user_agent   TEXT,
    ip           TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS api_keys (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name         TEXT NOT NULL,
    prefix       TEXT NOT NULL,
    key_hash     TEXT NOT NULL UNIQUE,
    created_at   INTEGER NOT NULL,
    last_used_at INTEGER,
    revoked_at   INTEGER
  )`,
  `CREATE TABLE IF NOT EXISTS heartbeats (
    id            TEXT PRIMARY KEY,
    user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    entity        TEXT NOT NULL,
    type          TEXT NOT NULL DEFAULT 'file',
    category      TEXT,
    time          REAL NOT NULL,
    project       TEXT,
    project_root_count INTEGER,
    branch        TEXT,
    language      TEXT,
    dependencies  TEXT,
    lines         INTEGER,
    lineno        INTEGER,
    cursorpos     INTEGER,
    is_write      INTEGER NOT NULL DEFAULT 0,
    machine_name_id TEXT,
    user_agent    TEXT,
    editor        TEXT,
    os            TEXT,
    ai_line_changes INTEGER,
    human_line_changes INTEGER,
    ai_session    TEXT,
    ai_input_tokens INTEGER,
    ai_output_tokens INTEGER,
    ai_prompt_length INTEGER,
    ai_subscription_plan TEXT,
    created_at    INTEGER NOT NULL
  )`,
  "CREATE UNIQUE INDEX IF NOT EXISTS ux_hb_dedup ON heartbeats(user_id, entity, time)",
  "CREATE INDEX IF NOT EXISTS ix_hb_user_time ON heartbeats(user_id, time)",
  `CREATE TABLE IF NOT EXISTS durations (
    id             TEXT PRIMARY KEY,
    user_id        TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    start_time     REAL NOT NULL,
    end_time       REAL NOT NULL,
    duration       REAL NOT NULL,
    project        TEXT,
    branch         TEXT,
    language       TEXT,
    category       TEXT,
    entity         TEXT,
    is_write       INTEGER,
    num_heartbeats INTEGER NOT NULL,
    machine_name_id TEXT,
    editor         TEXT,
    os             TEXT,
    day            TEXT NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS ix_dur_user_day ON durations(user_id, day)",
  "CREATE INDEX IF NOT EXISTS ix_dur_user_start ON durations(user_id, start_time)",
  `CREATE TABLE IF NOT EXISTS audit_logs (
    id         TEXT PRIMARY KEY,
    user_id    TEXT,
    action     TEXT NOT NULL,
    target     TEXT,
    ip         TEXT,
    user_agent TEXT,
    meta       TEXT,
    created_at INTEGER NOT NULL
  )`,
  "CREATE INDEX IF NOT EXISTS ix_audit_time ON audit_logs(created_at)",
  "CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
];

export function migrate(db: DatabaseSync): void {
  for (const sql of STATEMENTS) db.exec(sql);
  const row = db.prepare("SELECT value FROM meta WHERE key = ?").get("schema_version") as
    | { value: string }
    | undefined;
  if (!row) {
    db.prepare("INSERT INTO meta(key, value) VALUES(?, ?)").run("schema_version", String(SCHEMA_VERSION));
  }
}

