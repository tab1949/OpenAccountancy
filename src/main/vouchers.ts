import type Database from "better-sqlite3";
import type {
  BookkeepingResult,
  OperationResult,
  VoucherAccountOption,
  VoucherAttachmentInput,
  VoucherInput,
  VoucherMutationResult,
  VoucherRecord,
  VoucherSearchPayload
} from "../common/contracts";

interface VoucherRow {
  voucher_id: number;
  voucher_date: string;
  voucher_no: number;
  status: "draft" | "posted";
  amount: number;
  payload_json: string;
}

interface VoucherPayload {
  lines: VoucherInput["lines"];
  attachments: VoucherAttachmentInput[];
}

export interface VoucherSubjectSeed {
  code: string;
  name: string;
  manual: boolean;
  requiresAttachment: boolean;
  fixedDetails: string[];
}

export function ensureVoucherSchema(db: Database.Database, subjectSeeds?: VoucherSubjectSeed[]): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS voucher_records (
      voucher_id INTEGER PRIMARY KEY AUTOINCREMENT,
      voucher_date TEXT NOT NULL,
      voucher_no INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted')),
      amount REAL NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE (voucher_date, voucher_no)
    );
    CREATE INDEX IF NOT EXISTS idx_voucher_records_date ON voucher_records(voucher_date, voucher_no);
    CREATE INDEX IF NOT EXISTS idx_voucher_records_status ON voucher_records(status, voucher_date);

    CREATE TABLE IF NOT EXISTS voucher_account_catalog (
      account_code TEXT PRIMARY KEY,
      account_name TEXT NOT NULL,
      allows_manual_detail INTEGER NOT NULL,
      requires_attachment INTEGER NOT NULL,
      fixed_details_json TEXT NOT NULL DEFAULT '[]',
      is_active INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS voucher_detail_hints (
      account_code TEXT NOT NULL,
      detail_name TEXT NOT NULL,
      use_count INTEGER NOT NULL DEFAULT 1,
      last_used_at TEXT NOT NULL,
      PRIMARY KEY (account_code, detail_name)
    );

    CREATE TABLE IF NOT EXISTS voucher_period_state (
      period_key TEXT PRIMARY KEY,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
      closed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS voucher_posting_log (
      posting_log_id INTEGER PRIMARY KEY AUTOINCREMENT,
      voucher_id INTEGER NOT NULL,
      action_type TEXT NOT NULL CHECK (action_type IN ('post', 'unpost')),
      action_time TEXT NOT NULL,
      FOREIGN KEY (voucher_id) REFERENCES voucher_records(voucher_id) ON DELETE CASCADE
    );
  `);

  if (!subjectSeeds?.length) return;

  const accounts = subjectSeeds;
  const codes = accounts.map((account) => account.code);
  db.prepare(`DELETE FROM voucher_account_catalog WHERE account_code NOT IN (${codes.map(() => "?").join(",")})`).run(...codes);
  const upsertAccount = db.prepare(`
    INSERT INTO voucher_account_catalog
      (account_code, account_name, allows_manual_detail, requires_attachment, fixed_details_json)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(account_code) DO UPDATE SET
      account_name = excluded.account_name,
      allows_manual_detail = excluded.allows_manual_detail,
      requires_attachment = excluded.requires_attachment,
      fixed_details_json = excluded.fixed_details_json,
      is_active = 1
  `);
  for (const account of accounts) {
    upsertAccount.run(
      account.code,
      account.name,
      account.manual ? 1 : 0,
      account.requiresAttachment ? 1 : 0,
      JSON.stringify(account.fixedDetails)
    );
  }
}

function parsePayload(row: VoucherRow): VoucherPayload {
  try {
    const payload = JSON.parse(row.payload_json) as VoucherPayload;
    return {
      lines: Array.isArray(payload.lines) ? payload.lines : [],
      attachments: Array.isArray(payload.attachments) ? payload.attachments : []
    };
  } catch {
    return { lines: [], attachments: [] };
  }
}

function isPeriodClosed(db: Database.Database, voucherDate: string): boolean {
  const fiscalPeriod = db.prepare(`SELECT status FROM fiscal_periods
    WHERE start_date <= ? AND end_date >= ? ORDER BY fiscal_year, period_no LIMIT 1`)
    .get(voucherDate, voucherDate) as { status: "open" | "closed" } | undefined;
  if (fiscalPeriod) return fiscalPeriod.status === "closed";

  const periodKey = voucherDate.slice(0, 7);
  const state = db
    .prepare("SELECT status FROM voucher_period_state WHERE period_key = ?")
    .get(periodKey) as { status: "open" | "closed" } | undefined;
  return state?.status === "closed";
}

function currentPeriodKey(db: Database.Database): string {
  const row = db.prepare("SELECT value FROM bookset_meta WHERE key = 'fiscal_period'")
    .get() as { value: string } | undefined;
  const match = row?.value.match(/(\d{4})\D*(\d{1,2})/);
  if (match) {
    return `${match[1]}-${match[2].padStart(2, "0")}`;
  }
  return new Date().toISOString().slice(0, 7);
}

function isCurrentPeriod(db: Database.Database, voucherDate: string): boolean {
  const yearRow = db.prepare("SELECT value FROM bookset_meta WHERE key = 'fiscal_year'").get() as { value: string } | undefined;
  const periodRow = db.prepare("SELECT value FROM bookset_meta WHERE key = 'fiscal_period_no'").get() as { value: string } | undefined;
  const currentYear = Number(yearRow?.value ?? NaN);
  const currentPeriodNo = Number(periodRow?.value ?? NaN);
  if (Number.isInteger(currentYear) && Number.isInteger(currentPeriodNo)) {
    const period = db.prepare(`SELECT start_date, end_date FROM fiscal_periods
      WHERE fiscal_year = ? AND period_no = ?`).get(currentYear, currentPeriodNo) as { start_date: string; end_date: string } | undefined;
    if (period) return voucherDate >= period.start_date && voucherDate <= period.end_date;
  }
  return voucherDate.slice(0, 7) === currentPeriodKey(db);
}

function isPastPeriod(db: Database.Database, voucherDate: string): boolean {
  const yearRow = db.prepare("SELECT value FROM bookset_meta WHERE key = 'fiscal_year'").get() as { value: string } | undefined;
  const periodRow = db.prepare("SELECT value FROM bookset_meta WHERE key = 'fiscal_period_no'").get() as { value: string } | undefined;
  const year = Number(yearRow?.value ?? NaN);
  const periodNo = Number(periodRow?.value ?? NaN);
  if (Number.isInteger(year) && Number.isInteger(periodNo)) {
    const period = db.prepare("SELECT start_date FROM fiscal_periods WHERE fiscal_year = ? AND period_no = ?")
      .get(year, periodNo) as { start_date: string } | undefined;
    if (period) return voucherDate < period.start_date;
  }
  return voucherDate.slice(0, 7) < currentPeriodKey(db);
}

function toRecord(db: Database.Database, row: VoucherRow): VoucherRecord {
  const payload = parsePayload(row);
  return {
    voucherId: row.voucher_id,
    voucherDate: row.voucher_date,
    voucherNo: row.voucher_no,
    status: row.status,
    amount: row.amount,
    lines: payload.lines,
    attachments: payload.attachments,
    periodClosed: isPeriodClosed(db, row.voucher_date),
    isCurrentPeriod: isCurrentPeriod(db, row.voucher_date),
    isPastPeriod: isPastPeriod(db, row.voucher_date)
  };
}

function validateVoucher(db: Database.Database, input: VoucherInput): { ok: true; amount: number } | { ok: false; message: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.voucherDate) || Number.isNaN(Date.parse(input.voucherDate))) {
    return { ok: false, message: "请选择有效的凭证日期。" };
  }

  if (input.lines.length !== 11) {
    return { ok: false, message: "每张凭证必须包含 11 行分录。" };
  }

  const populated = input.lines.filter((line) =>
    line.summary.trim() || line.accountCode || line.detail.trim() || line.debit !== 0 || line.credit !== 0
  );
  if (populated.length < 2) {
    return { ok: false, message: "凭证至少需要两条完整分录。" };
  }

  let debitCents = 0;
  let creditCents = 0;
  let requiresAttachment = false;

  for (const line of populated) {
    if (!line.summary.trim()) {
      return { ok: false, message: `第 ${line.lineNo} 行请先填写摘要。` };
    }

    if (!line.accountCode.trim()) {
      return { ok: false, message: `第 ${line.lineNo} 行请选择总账科目。` };
    }

    const account = db
      .prepare("SELECT account_name, allows_manual_detail, requires_attachment, fixed_details_json FROM voucher_account_catalog WHERE account_code = ? AND is_active = 1")
      .get(line.accountCode) as {
        account_name: string;
        allows_manual_detail: number;
        requires_attachment: number;
        fixed_details_json: string;
      } | undefined;
    if (!account || account.account_name !== line.accountName) {
      return { ok: false, message: `第 ${line.lineNo} 行科目无效，请重新选择。` };
    }

    const fixedDetails = JSON.parse(account.fixed_details_json) as string[];
    if (!account.allows_manual_detail && fixedDetails.length > 0 && !fixedDetails.includes(line.detail.trim())) {
      return { ok: false, message: `第 ${line.lineNo} 行明细科目必须从固定选项中选择。` };
    }

    if (!Number.isFinite(line.debit) || !Number.isFinite(line.credit) || line.debit < 0 || line.credit < 0) {
      return { ok: false, message: `第 ${line.lineNo} 行金额无效。` };
    }

    const debit = Math.round(line.debit * 100);
    const credit = Math.round(line.credit * 100);
    if ((debit > 0) === (credit > 0)) {
      return { ok: false, message: `第 ${line.lineNo} 行只能填写借方或贷方其中一项金额。` };
    }

    debitCents += debit;
    creditCents += credit;
    requiresAttachment ||= account.requires_attachment === 1;
  }

  if (debitCents <= 0 || debitCents !== creditCents) {
    return { ok: false, message: "当前借贷不平衡。" };
  }

  if (requiresAttachment && input.attachments.length === 0) {
    return { ok: false, message: "当前分录要求提供原始凭证附件。" };
  }

  return { ok: true, amount: debitCents / 100 };
}

export function listVoucherAccounts(db: Database.Database, keyword = ""): VoucherAccountOption[] {
  ensureVoucherSchema(db);
  const normalized = keyword.trim();
  const rows = db.prepare(`
    SELECT account_code, account_name, allows_manual_detail, requires_attachment, fixed_details_json
    FROM voucher_account_catalog
    WHERE is_active = 1 AND (? = '' OR account_code LIKE ? OR account_name LIKE ?)
    ORDER BY account_code
  `).all(normalized, `%${normalized}%`, `%${normalized}%`) as Array<{
    account_code: string;
    account_name: string;
    allows_manual_detail: number;
    requires_attachment: number;
    fixed_details_json: string;
  }>;

  const getHints = db.prepare(`
    SELECT detail_name FROM voucher_detail_hints
    WHERE account_code = ? ORDER BY use_count DESC, datetime(last_used_at) DESC LIMIT 10
  `);

  return rows.map((row) => ({
    accountCode: row.account_code,
    accountName: row.account_name,
    allowsManualDetail: row.allows_manual_detail === 1,
    requiresAttachment: row.requires_attachment === 1,
    detailOptions: JSON.parse(row.fixed_details_json) as string[],
    detailSuggestions: (getHints.all(row.account_code) as Array<{ detail_name: string }>).map((item) => item.detail_name)
  }));
}

export function getVoucherDetailSuggestions(db: Database.Database, accountCode: string): string[] {
  ensureVoucherSchema(db);
  const account = db.prepare("SELECT fixed_details_json, allows_manual_detail FROM voucher_account_catalog WHERE account_code = ? AND is_active = 1")
    .get(accountCode) as { fixed_details_json: string; allows_manual_detail: number } | undefined;
  if (!account) {
    return [];
  }

  const fixed = JSON.parse(account.fixed_details_json) as string[];
  const hints = db.prepare(`
    SELECT detail_name FROM voucher_detail_hints
    WHERE account_code = ? ORDER BY use_count DESC, datetime(last_used_at) DESC LIMIT 10
  `).all(accountCode) as Array<{ detail_name: string }>;
  return [...new Set([...fixed, ...hints.map((item) => item.detail_name)])];
}

export function searchVouchers(db: Database.Database, query: VoucherSearchPayload): VoucherRecord[] {
  ensureVoucherSchema(db);
  const conditions: string[] = [];
  const params: unknown[] = [];
  if (query.dateFrom) {
    conditions.push("voucher_date >= ?");
    params.push(query.dateFrom);
  }
  if (query.dateTo) {
    conditions.push("voucher_date <= ?");
    params.push(query.dateTo);
  }
  if (query.month) {
    conditions.push("substr(voucher_date, 1, 7) = ?");
    params.push(query.month);
  }
  if (query.voucherNoFrom !== undefined) {
    conditions.push("voucher_no >= ?");
    params.push(query.voucherNoFrom);
  }
  if (query.voucherNoTo !== undefined) {
    conditions.push("voucher_no <= ?");
    params.push(query.voucherNoTo);
  }
  if (query.status) {
    conditions.push("status = ?");
    params.push(query.status);
  }
  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
  const rows = db.prepare(`SELECT voucher_id, voucher_date, voucher_no, status, amount, payload_json
    FROM voucher_records ${where} ORDER BY voucher_date DESC, voucher_no DESC`).all(...params) as VoucherRow[];
  const keyword = query.keyword?.trim().toLocaleLowerCase();
  return rows
    .filter((row) => {
      if (!keyword) {
        return true;
      }
      return parsePayload(row).lines.some((line) => line.summary.toLocaleLowerCase().includes(keyword));
    })
    .map((row) => toRecord(db, row));
}

export function getVoucher(db: Database.Database, voucherId: number): VoucherRecord | null {
  ensureVoucherSchema(db);
  const row = db.prepare("SELECT voucher_id, voucher_date, voucher_no, status, amount, payload_json FROM voucher_records WHERE voucher_id = ?")
    .get(voucherId) as VoucherRow | undefined;
  return row ? toRecord(db, row) : null;
}

export function saveVoucher(db: Database.Database, input: VoucherInput, confirmUnpost: boolean): VoucherMutationResult {
  ensureVoucherSchema(db);
  const validation = validateVoucher(db, input);
  if (!validation.ok) {
    return { ok: false, message: validation.message };
  }

  const now = new Date().toISOString();
  const payloadJson = JSON.stringify({ lines: input.lines, attachments: input.attachments });
  const transaction = db.transaction(() => {
    let voucherId = input.voucherId;
    let existing: VoucherRow | undefined;
    if (voucherId !== undefined) {
      existing = db.prepare("SELECT voucher_id, voucher_date, voucher_no, status, amount, payload_json FROM voucher_records WHERE voucher_id = ?")
        .get(voucherId) as VoucherRow | undefined;
      if (!existing) {
        throw new Error("凭证不存在或已被删除。");
      }
      if (isPeriodClosed(db, existing.voucher_date) || isPeriodClosed(db, input.voucherDate)) {
        throw new Error("该账期已结账，无法修改");
      }
      if (existing.status === "posted" && isPastPeriod(db, existing.voucher_date) && !confirmUnpost) {
        throw new Error("需要确认反记账警告后才能修改该往期凭证。");
      }

      db.prepare(`UPDATE voucher_records SET voucher_date = ?, status = 'draft', amount = ?, payload_json = ?, updated_at = ? WHERE voucher_id = ?`)
        .run(input.voucherDate, validation.amount, payloadJson, now, voucherId);
      if (existing.status === "posted") {
        db.prepare("INSERT INTO voucher_posting_log (voucher_id, action_type, action_time) VALUES (?, 'unpost', ?)")
          .run(voucherId, now);
      }
    } else {
      const next = db.prepare("SELECT COALESCE(MAX(voucher_no), 0) + 1 AS next_no FROM voucher_records WHERE substr(voucher_date, 1, 7) = ?")
        .get(input.voucherDate.slice(0, 7)) as { next_no: number };
      const result = db.prepare(`INSERT INTO voucher_records
        (voucher_date, voucher_no, status, amount, payload_json, created_at, updated_at)
        VALUES (?, ?, 'draft', ?, ?, ?, ?)`)
        .run(input.voucherDate, next.next_no, validation.amount, payloadJson, now, now);
      voucherId = Number(result.lastInsertRowid);
    }

    const saveHint = db.prepare(`
      INSERT INTO voucher_detail_hints (account_code, detail_name, use_count, last_used_at)
      VALUES (?, ?, 1, ?)
      ON CONFLICT(account_code, detail_name)
      DO UPDATE SET use_count = use_count + 1, last_used_at = excluded.last_used_at
    `);
    for (const line of input.lines) {
      if (line.accountCode && line.detail.trim()) {
        saveHint.run(line.accountCode, line.detail.trim(), now);
      }
    }
    return voucherId!;
  });

  try {
    const voucherId = transaction();
    return { ok: true, message: input.voucherId ? "凭证修改成功。" : "凭证保存成功。", voucherId };
  } catch (error) {
    return { ok: false, message: (error as Error).message || "凭证保存失败。" };
  }
}

export function deleteVoucher(db: Database.Database, voucherId: number, confirmUnpost: boolean): OperationResult {
  ensureVoucherSchema(db);
  const row = db.prepare("SELECT voucher_id, voucher_date, voucher_no, status, amount, payload_json FROM voucher_records WHERE voucher_id = ?")
    .get(voucherId) as VoucherRow | undefined;
  if (!row) {
    return { ok: false, message: "凭证不存在或已被删除。" };
  }
  if (isPeriodClosed(db, row.voucher_date)) {
    return { ok: false, message: "该账期已结账，无法删除" };
  }
  if (row.status === "posted" && isPastPeriod(db, row.voucher_date) && !confirmUnpost) {
    return { ok: false, message: "需要确认反记账警告后才能删除该往期凭证。" };
  }

  const transaction = db.transaction(() => {
    if (row.status === "posted") {
      db.prepare("INSERT INTO voucher_posting_log (voucher_id, action_type, action_time) VALUES (?, 'unpost', ?)")
        .run(voucherId, new Date().toISOString());
    }
    db.prepare("DELETE FROM voucher_records WHERE voucher_id = ?").run(voucherId);
  });
  try {
    transaction();
    return { ok: true, message: "凭证已删除。" };
  } catch (error) {
    return { ok: false, message: (error as Error).message || "删除凭证失败。" };
  }
}

export function postVouchers(db: Database.Database, voucherIds: number[]): BookkeepingResult {
  ensureVoucherSchema(db);
  const uniqueIds = [...new Set(voucherIds)];
  if (uniqueIds.length === 0) {
    return { ok: false, message: "请选择要记账的凭证。", affectedCount: 0 };
  }

  const now = new Date().toISOString();
  const transaction = db.transaction(() => {
    for (const voucherId of uniqueIds) {
      const row = db.prepare("SELECT voucher_id, voucher_date, status, amount FROM voucher_records WHERE voucher_id = ?")
        .get(voucherId) as { voucher_id: number; voucher_date: string; status: "draft" | "posted"; amount: number } | undefined;
      if (!row) {
        throw new Error("选中的凭证中有记录不存在，请刷新后重试。");
      }
      if (row.status === "posted") {
        throw new Error("选中的凭证中包含已记账凭证，请刷新后重试。");
      }
      if (isPeriodClosed(db, row.voucher_date)) {
        throw new Error("选中的凭证包含已结账期间，无法记账。");
      }
      db.prepare("UPDATE voucher_records SET status = 'posted', updated_at = ? WHERE voucher_id = ?").run(now, voucherId);
      db.prepare("INSERT INTO voucher_posting_log (voucher_id, action_type, action_time) VALUES (?, 'post', ?)").run(voucherId, now);
    }
  });

  try {
    transaction();
    return { ok: true, message: `已记账 ${uniqueIds.length} 张凭证。`, affectedCount: uniqueIds.length };
  } catch (error) {
    return { ok: false, message: (error as Error).message || "记账失败。", affectedCount: 0 };
  }
}
