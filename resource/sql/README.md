# OpenAccountancy SQLite Schema

This directory contains SQL for two database scopes required by the project:

1. DATABASE `System`
2. DATABASE `AccountingBookXXX` (one database per accounting book)

## Files

- `01_system_database.sql`
  - System-level data only: configuration, users, password/security-question hashes, login-limit counters, bookset registry, cache, and audit events.
- `02_accounting_book_template.sql`
  - Template schema for each independent book database.
  - Covers accounting standard dictionary, chart of accounts, periods, vouchers, voucher lines, attachments, posting logs, and core business triggers.

## 3NF notes

The schema is designed to meet 3NF:

- No repeating groups in the same table.
- Relationship tables use foreign keys for dependency control.
- Derived/aggregate fields are avoided in base transaction tables.
- Dictionaries (standard, account class, voucher type, cache namespace) are split from transaction data.

## How to initialize

### 1) Initialize `System` database

```sql
.read resource/sql/01_system_database.sql
```

### 2) Initialize one book database

```sql
.read resource/sql/02_accounting_book_template.sql
```

Use a separate DB file name per book, for example:

- `AccountingBook001.db`
- `AccountingBookABC.db`

## About accounting standards data

`standard_subject` table is prepared for full subject catalogs from:

- `doc/reference/企业会计准则.md`
- `doc/reference/小企业会计准则.md`

The app can import those catalogs during book creation based on selected standard.
