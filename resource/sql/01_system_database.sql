-- OpenAccountancy - DATABASE System schema (SQLite)
-- Purpose: store system-level configuration, users, login control, bookset registry, cache, and audit data.
-- Normalization target: 3NF (no repeating groups, no partial dependency, no transitive dependency within each relation).

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

BEGIN;

-- ------------------------------------------------------------
-- 1) Dictionary tables
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sys_accounting_standard (
  standard_code TEXT PRIMARY KEY,
  standard_name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

INSERT OR IGNORE INTO sys_accounting_standard (standard_code, standard_name) VALUES
  ('ASBE_2006', '企业会计准则'),
  ('SBE_2011', '小企业会计准则');

CREATE TABLE IF NOT EXISTS sys_cache_namespace (
  namespace_id INTEGER PRIMARY KEY,
  namespace_code TEXT NOT NULL UNIQUE,
  namespace_name TEXT NOT NULL,
  ttl_seconds INTEGER CHECK (ttl_seconds IS NULL OR ttl_seconds >= 0),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

INSERT OR IGNORE INTO sys_cache_namespace (namespace_code, namespace_name, ttl_seconds) VALUES
  ('RECENT_SEARCH', '最近搜索', 86400),
  ('UI_STATE', '界面状态', 2592000),
  ('TEMP_IMPORT', '临时导入缓存', 7200);

-- ------------------------------------------------------------
-- 2) User and authentication domain
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sys_user (
  user_id INTEGER PRIMARY KEY,
  user_name TEXT NOT NULL UNIQUE,
  display_name TEXT,
  is_admin INTEGER NOT NULL DEFAULT 0 CHECK (is_admin IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

CREATE TABLE IF NOT EXISTS sys_user_credential (
  user_id INTEGER PRIMARY KEY,
  password_hash_sha512 TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  password_updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES sys_user(user_id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS sys_user_security_question (
  question_id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL,
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 3),
  question_text TEXT NOT NULL,
  answer_hash_sha512 TEXT NOT NULL,
  answer_salt TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, ordinal),
  FOREIGN KEY (user_id) REFERENCES sys_user(user_id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS sys_user_login_attempt_daily (
  user_id INTEGER NOT NULL,
  attempt_date TEXT NOT NULL, -- YYYY-MM-DD
  failed_count INTEGER NOT NULL DEFAULT 0 CHECK (failed_count >= 0),
  lock_until TEXT,            -- datetime when temporary lock expires
  last_failed_at TEXT,
  PRIMARY KEY (user_id, attempt_date),
  FOREIGN KEY (user_id) REFERENCES sys_user(user_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_sys_user_login_attempt_lock_until
  ON sys_user_login_attempt_daily(lock_until);

-- ------------------------------------------------------------
-- 3) Bookset registry and lifecycle
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sys_accounting_book (
  book_id INTEGER PRIMARY KEY,
  book_code TEXT NOT NULL UNIQUE,
  book_name TEXT NOT NULL,
  organization_name TEXT NOT NULL,
  accounting_standard_code TEXT NOT NULL,
  db_file_path TEXT NOT NULL UNIQUE,
  fiscal_year INTEGER NOT NULL,
  current_period INTEGER NOT NULL CHECK (current_period BETWEEN 1 AND 12),
  book_status TEXT NOT NULL DEFAULT 'active'
    CHECK (book_status IN ('active', 'archived', 'deleted')),
  created_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_opened_at TEXT,
  last_backup_at TEXT,
  FOREIGN KEY (accounting_standard_code) REFERENCES sys_accounting_standard(standard_code),
  FOREIGN KEY (created_by_user_id) REFERENCES sys_user(user_id)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_sys_accounting_book_org_name
  ON sys_accounting_book(organization_name);

CREATE INDEX IF NOT EXISTS idx_sys_accounting_book_last_opened_at
  ON sys_accounting_book(last_opened_at DESC);

CREATE TABLE IF NOT EXISTS sys_accounting_book_open_history (
  history_id INTEGER PRIMARY KEY,
  book_id INTEGER NOT NULL,
  opened_by_user_id INTEGER,
  open_started_at TEXT NOT NULL DEFAULT (datetime('now')),
  open_ended_at TEXT,
  client_fingerprint TEXT,
  FOREIGN KEY (book_id) REFERENCES sys_accounting_book(book_id) ON DELETE CASCADE,
  FOREIGN KEY (opened_by_user_id) REFERENCES sys_user(user_id)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_sys_book_open_history_book_time
  ON sys_accounting_book_open_history(book_id, open_started_at DESC);

-- ------------------------------------------------------------
-- 4) Config and cache
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sys_config_definition (
  config_key TEXT PRIMARY KEY,
  config_name TEXT NOT NULL,
  value_type TEXT NOT NULL CHECK (value_type IN ('string', 'number', 'boolean', 'json')),
  default_value TEXT,
  is_sensitive INTEGER NOT NULL DEFAULT 0 CHECK (is_sensitive IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
) STRICT;

CREATE TABLE IF NOT EXISTS sys_config_value (
  config_value_id INTEGER PRIMARY KEY,
  config_key TEXT NOT NULL,
  target_type TEXT NOT NULL CHECK (target_type IN ('SYSTEM', 'USER', 'BOOK')),
  target_id TEXT NOT NULL,
  config_value TEXT,
  updated_by_user_id INTEGER,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (config_key, target_type, target_id),
  FOREIGN KEY (config_key) REFERENCES sys_config_definition(config_key) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_user_id) REFERENCES sys_user(user_id)
) STRICT;

CREATE TABLE IF NOT EXISTS sys_cache_entry (
  cache_entry_id INTEGER PRIMARY KEY,
  namespace_id INTEGER NOT NULL,
  cache_key TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  expires_at TEXT,
  last_accessed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (namespace_id, cache_key),
  FOREIGN KEY (namespace_id) REFERENCES sys_cache_namespace(namespace_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_sys_cache_entry_expires_at
  ON sys_cache_entry(expires_at);

-- ------------------------------------------------------------
-- 5) Audit
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sys_audit_event (
  audit_event_id INTEGER PRIMARY KEY,
  event_time TEXT NOT NULL DEFAULT (datetime('now')),
  user_id INTEGER,
  event_type TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  event_payload_json TEXT,
  FOREIGN KEY (user_id) REFERENCES sys_user(user_id)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_sys_audit_event_time
  ON sys_audit_event(event_time DESC);

CREATE INDEX IF NOT EXISTS idx_sys_audit_event_target
  ON sys_audit_event(target_type, target_id);

-- ------------------------------------------------------------
-- 6) Update timestamp triggers
-- ------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_sys_user_updated_at
AFTER UPDATE ON sys_user
FOR EACH ROW
BEGIN
  UPDATE sys_user SET updated_at = datetime('now') WHERE user_id = NEW.user_id;
END;

CREATE TRIGGER IF NOT EXISTS trg_sys_accounting_book_updated_at
AFTER UPDATE ON sys_accounting_book
FOR EACH ROW
BEGIN
  UPDATE sys_accounting_book SET updated_at = datetime('now') WHERE book_id = NEW.book_id;
END;

COMMIT;
