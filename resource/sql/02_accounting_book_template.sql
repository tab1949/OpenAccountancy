-- OpenAccountancy - DATABASE AccountingBookXXX schema template (SQLite)
-- Purpose: each accounting book uses one standalone database file (e.g., AccountingBook001.db).
-- Normalization target: 3NF.

PRAGMA foreign_keys = ON;
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;

BEGIN;

-- ------------------------------------------------------------
-- 1) Book metadata and period dimension
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS book_profile (
  profile_id INTEGER PRIMARY KEY CHECK (profile_id = 1),
  book_code TEXT NOT NULL UNIQUE,
  book_name TEXT NOT NULL,
  organization_name TEXT NOT NULL,
  accounting_standard_code TEXT NOT NULL CHECK (accounting_standard_code IN ('ASBE_2006', 'SBE_2011')),
  base_currency_code TEXT NOT NULL DEFAULT 'CNY',
  fiscal_year_start_month INTEGER NOT NULL DEFAULT 1 CHECK (fiscal_year_start_month BETWEEN 1 AND 12),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_by_user_id INTEGER,
  remarks TEXT
) STRICT;

CREATE TABLE IF NOT EXISTS fiscal_period (
  period_id INTEGER PRIMARY KEY,
  fiscal_year INTEGER NOT NULL,
  period_no INTEGER NOT NULL CHECK (period_no BETWEEN 1 AND 12),
  period_start_date TEXT NOT NULL,
  period_end_date TEXT NOT NULL,
  period_status TEXT NOT NULL DEFAULT 'open' CHECK (period_status IN ('open', 'closed')),
  closed_at TEXT,
  closed_by_user_id INTEGER,
  UNIQUE (fiscal_year, period_no)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_fiscal_period_status
  ON fiscal_period(period_status, fiscal_year, period_no);

-- ------------------------------------------------------------
-- 2) Accounting standard dictionary and chart of account
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS account_class (
  account_class_id INTEGER PRIMARY KEY,
  class_code TEXT NOT NULL UNIQUE,
  class_name TEXT NOT NULL
) STRICT;

INSERT OR IGNORE INTO account_class (account_class_id, class_code, class_name) VALUES
  (1, 'ASSET', '资产类'),
  (2, 'LIABILITY', '负债类'),
  (3, 'COMMON', '共同类'),
  (4, 'EQUITY', '所有者权益类'),
  (5, 'COST', '成本类'),
  (6, 'P_L', '损益类');

CREATE TABLE IF NOT EXISTS standard_subject (
  standard_subject_id INTEGER PRIMARY KEY,
  standard_code TEXT NOT NULL CHECK (standard_code IN ('ASBE_2006', 'SBE_2011')),
  sequence_no INTEGER NOT NULL,
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_class_id INTEGER NOT NULL,
  UNIQUE (standard_code, account_code),
  UNIQUE (standard_code, sequence_no),
  FOREIGN KEY (account_class_id) REFERENCES account_class(account_class_id)
) STRICT;

-- Each book can customize chart-of-account based on selected standard.
CREATE TABLE IF NOT EXISTS chart_of_account (
  account_id INTEGER PRIMARY KEY,
  account_code TEXT NOT NULL UNIQUE,
  account_name TEXT NOT NULL,
  account_class_id INTEGER NOT NULL,
  parent_account_id INTEGER,
  account_level INTEGER NOT NULL CHECK (account_level BETWEEN 1 AND 3),
  balance_direction TEXT NOT NULL CHECK (balance_direction IN ('debit', 'credit', 'both')),
  allows_manual_detail INTEGER NOT NULL DEFAULT 0 CHECK (allows_manual_detail IN (0, 1)),
  requires_source_document INTEGER NOT NULL DEFAULT 0 CHECK (requires_source_document IN (0, 1)),
  is_leaf INTEGER NOT NULL DEFAULT 1 CHECK (is_leaf IN (0, 1)),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  standard_subject_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (account_class_id) REFERENCES account_class(account_class_id),
  FOREIGN KEY (parent_account_id) REFERENCES chart_of_account(account_id),
  FOREIGN KEY (standard_subject_id) REFERENCES standard_subject(standard_subject_id)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_chart_of_account_parent
  ON chart_of_account(parent_account_id);

CREATE INDEX IF NOT EXISTS idx_chart_of_account_class
  ON chart_of_account(account_class_id, account_code);

-- Optional fixed detail options for a general account.
CREATE TABLE IF NOT EXISTS account_detail_option (
  detail_option_id INTEGER PRIMARY KEY,
  general_account_id INTEGER NOT NULL,
  detail_code TEXT,
  detail_name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  UNIQUE (general_account_id, detail_name),
  FOREIGN KEY (general_account_id) REFERENCES chart_of_account(account_id) ON DELETE CASCADE
) STRICT;

-- Suggestion history for free-text detail names.
CREATE TABLE IF NOT EXISTS account_detail_usage_hint (
  general_account_id INTEGER NOT NULL,
  detail_name TEXT NOT NULL,
  use_count INTEGER NOT NULL DEFAULT 1 CHECK (use_count >= 1),
  last_used_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (general_account_id, detail_name),
  FOREIGN KEY (general_account_id) REFERENCES chart_of_account(account_id) ON DELETE CASCADE
) STRICT;

-- ------------------------------------------------------------
-- 3) Voucher domain
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS voucher_type (
  voucher_type_id INTEGER PRIMARY KEY,
  voucher_type_code TEXT NOT NULL UNIQUE,
  voucher_type_name TEXT NOT NULL
) STRICT;

INSERT OR IGNORE INTO voucher_type (voucher_type_code, voucher_type_name) VALUES
  ('MEMO', '记账凭证'),
  ('RECEIPT', '收款凭证'),
  ('PAYMENT', '付款凭证'),
  ('TRANSFER', '转账凭证');

CREATE TABLE IF NOT EXISTS voucher (
  voucher_id INTEGER PRIMARY KEY,
  period_id INTEGER NOT NULL,
  voucher_type_id INTEGER NOT NULL,
  voucher_date TEXT NOT NULL,
  voucher_no INTEGER NOT NULL CHECK (voucher_no > 0),
  voucher_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (voucher_status IN ('draft', 'reviewed', 'posted', 'void')),
  source_reference TEXT,
  remarks TEXT,
  created_by_user_id INTEGER,
  reviewed_by_user_id INTEGER,
  posted_by_user_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (period_id, voucher_no),
  FOREIGN KEY (period_id) REFERENCES fiscal_period(period_id),
  FOREIGN KEY (voucher_type_id) REFERENCES voucher_type(voucher_type_id)
) STRICT;

CREATE INDEX IF NOT EXISTS idx_voucher_query_date
  ON voucher(voucher_date);

CREATE INDEX IF NOT EXISTS idx_voucher_query_status
  ON voucher(voucher_status, period_id);

CREATE TABLE IF NOT EXISTS voucher_line (
  voucher_line_id INTEGER PRIMARY KEY,
  voucher_id INTEGER NOT NULL,
  line_no INTEGER NOT NULL CHECK (line_no BETWEEN 1 AND 11),
  summary_text TEXT NOT NULL,
  general_account_id INTEGER NOT NULL,
  detail_option_id INTEGER,
  manual_detail_name TEXT,
  debit_amount REAL NOT NULL DEFAULT 0 CHECK (debit_amount >= 0),
  credit_amount REAL NOT NULL DEFAULT 0 CHECK (credit_amount >= 0),
  business_party_name TEXT,
  line_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (voucher_id, line_no),
  FOREIGN KEY (voucher_id) REFERENCES voucher(voucher_id) ON DELETE CASCADE,
  FOREIGN KEY (general_account_id) REFERENCES chart_of_account(account_id),
  FOREIGN KEY (detail_option_id) REFERENCES account_detail_option(detail_option_id),
  CHECK (
    (debit_amount > 0 AND credit_amount = 0)
    OR (debit_amount = 0 AND credit_amount > 0)
  )
) STRICT;

CREATE INDEX IF NOT EXISTS idx_voucher_line_summary
  ON voucher_line(summary_text);

CREATE INDEX IF NOT EXISTS idx_voucher_line_account
  ON voucher_line(general_account_id);

CREATE TABLE IF NOT EXISTS voucher_attachment (
  attachment_id INTEGER PRIMARY KEY,
  voucher_id INTEGER NOT NULL,
  voucher_line_id INTEGER,
  file_name TEXT NOT NULL,
  file_ext TEXT,
  mime_type TEXT,
  file_sha256 TEXT,
  storage_uri TEXT NOT NULL,
  file_size_bytes INTEGER CHECK (file_size_bytes IS NULL OR file_size_bytes >= 0),
  uploaded_by_user_id INTEGER,
  uploaded_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (voucher_id) REFERENCES voucher(voucher_id) ON DELETE CASCADE,
  FOREIGN KEY (voucher_line_id) REFERENCES voucher_line(voucher_line_id) ON DELETE CASCADE
) STRICT;

CREATE TABLE IF NOT EXISTS voucher_posting_log (
  posting_log_id INTEGER PRIMARY KEY,
  voucher_id INTEGER NOT NULL,
  action_type TEXT NOT NULL CHECK (action_type IN ('post', 'unpost')),
  action_by_user_id INTEGER,
  action_time TEXT NOT NULL DEFAULT (datetime('now')),
  reason TEXT,
  FOREIGN KEY (voucher_id) REFERENCES voucher(voucher_id) ON DELETE CASCADE
) STRICT;

CREATE INDEX IF NOT EXISTS idx_voucher_posting_log_voucher
  ON voucher_posting_log(voucher_id, action_time DESC);

-- ------------------------------------------------------------
-- 4) Business constraints via triggers
-- ------------------------------------------------------------
CREATE TRIGGER IF NOT EXISTS trg_voucher_updated_at
AFTER UPDATE ON voucher
FOR EACH ROW
BEGIN
  UPDATE voucher SET updated_at = datetime('now') WHERE voucher_id = NEW.voucher_id;
END;

-- Prevent changing vouchers in closed periods.
CREATE TRIGGER IF NOT EXISTS trg_voucher_no_change_when_period_closed_update
BEFORE UPDATE ON voucher
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM fiscal_period fp
  WHERE fp.period_id = OLD.period_id
    AND fp.period_status = 'closed'
)
BEGIN
  SELECT RAISE(ABORT, 'Cannot update voucher in closed period.');
END;

CREATE TRIGGER IF NOT EXISTS trg_voucher_no_change_when_period_closed_delete
BEFORE DELETE ON voucher
FOR EACH ROW
WHEN EXISTS (
  SELECT 1 FROM fiscal_period fp
  WHERE fp.period_id = OLD.period_id
    AND fp.period_status = 'closed'
)
BEGIN
  SELECT RAISE(ABORT, 'Cannot delete voucher in closed period.');
END;

CREATE TRIGGER IF NOT EXISTS trg_voucher_line_no_change_when_period_closed
BEFORE INSERT ON voucher_line
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM voucher v
  JOIN fiscal_period fp ON fp.period_id = v.period_id
  WHERE v.voucher_id = NEW.voucher_id
    AND fp.period_status = 'closed'
)
BEGIN
  SELECT RAISE(ABORT, 'Cannot insert voucher line into closed period.');
END;

CREATE TRIGGER IF NOT EXISTS trg_voucher_line_no_update_when_period_closed
BEFORE UPDATE ON voucher_line
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM voucher v
  JOIN fiscal_period fp ON fp.period_id = v.period_id
  WHERE v.voucher_id = OLD.voucher_id
    AND fp.period_status = 'closed'
)
BEGIN
  SELECT RAISE(ABORT, 'Cannot update voucher line in closed period.');
END;

CREATE TRIGGER IF NOT EXISTS trg_voucher_line_no_delete_when_period_closed
BEFORE DELETE ON voucher_line
FOR EACH ROW
WHEN EXISTS (
  SELECT 1
  FROM voucher v
  JOIN fiscal_period fp ON fp.period_id = v.period_id
  WHERE v.voucher_id = OLD.voucher_id
    AND fp.period_status = 'closed'
)
BEGIN
  SELECT RAISE(ABORT, 'Cannot delete voucher line in closed period.');
END;

-- Ensure voucher is balanced when status changes to posted.
CREATE TRIGGER IF NOT EXISTS trg_voucher_post_must_be_balanced
BEFORE UPDATE OF voucher_status ON voucher
FOR EACH ROW
WHEN NEW.voucher_status = 'posted'
BEGIN
  SELECT CASE
    WHEN (
      SELECT COUNT(1) FROM voucher_line vl WHERE vl.voucher_id = NEW.voucher_id
    ) = 0
    THEN RAISE(ABORT, 'Cannot post voucher without lines.')
  END;

  SELECT CASE
    WHEN (
      SELECT IFNULL(SUM(vl.debit_amount), 0) FROM voucher_line vl WHERE vl.voucher_id = NEW.voucher_id
    ) != (
      SELECT IFNULL(SUM(vl.credit_amount), 0) FROM voucher_line vl WHERE vl.voucher_id = NEW.voucher_id
    )
    THEN RAISE(ABORT, 'Cannot post unbalanced voucher.')
  END;
END;

-- Keep detail usage hint table updated for manual detail text.
CREATE TRIGGER IF NOT EXISTS trg_voucher_line_manual_detail_hint
AFTER INSERT ON voucher_line
FOR EACH ROW
WHEN NEW.manual_detail_name IS NOT NULL AND trim(NEW.manual_detail_name) <> ''
BEGIN
  INSERT INTO account_detail_usage_hint (general_account_id, detail_name, use_count, last_used_at)
  VALUES (NEW.general_account_id, NEW.manual_detail_name, 1, datetime('now'))
  ON CONFLICT(general_account_id, detail_name)
  DO UPDATE SET
    use_count = use_count + 1,
    last_used_at = datetime('now');
END;

COMMIT;
