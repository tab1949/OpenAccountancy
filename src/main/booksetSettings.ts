import type Database from "better-sqlite3";
import type {
  BooksetSettings,
  CreateBooksetPayload,
  FiscalPeriodSetting,
  SaveBooksetSettingsPayload,
  UpdateFiscalPeriodPayload
} from "../common/contracts";

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function dateString(year: number, month: number, day: number): string {
  return `${String(year).padStart(4, "0")}-${pad(month)}-${pad(day)}`;
}

function monthLength(year: number, month: number): number {
  if (month === 2) {
    const leap = year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
    return leap ? 29 : 28;
  }
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function defaultPeriod(year: number, periodNo: number): FiscalPeriodSetting {
  const endDay = monthLength(year, periodNo);
  return {
    year,
    periodNo,
    startDate: dateString(year, periodNo, 1),
    endDate: dateString(year, periodNo, endDay),
    status: "open",
    used: false
  };
}

function getMeta(db: Database.Database, key: string): string {
  const row = db.prepare("SELECT value FROM bookset_meta WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? "";
}

function setMeta(db: Database.Database, key: string, value: string): void {
  db.prepare("INSERT INTO bookset_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(key, value);
}

function setSetting(db: Database.Database, key: string, value: unknown): void {
  db.prepare("INSERT INTO bookset_settings (setting_key, setting_value) VALUES (?, ?) ON CONFLICT(setting_key) DO UPDATE SET setting_value = excluded.setting_value")
    .run(key, JSON.stringify(value));
}

function getSetting<T>(db: Database.Database, key: string, fallback: T): T {
  const row = db.prepare("SELECT setting_value FROM bookset_settings WHERE setting_key = ?").get(key) as { setting_value: string } | undefined;
  if (!row) return fallback;
  try {
    return JSON.parse(row.setting_value) as T;
  } catch {
    return fallback;
  }
}

export function ensureBooksetSettingsSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS bookset_settings (
      setting_key TEXT PRIMARY KEY,
      setting_value TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS fiscal_periods (
      fiscal_year INTEGER NOT NULL,
      period_no INTEGER NOT NULL CHECK (period_no BETWEEN 1 AND 12),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
      closed_at TEXT,
      PRIMARY KEY (fiscal_year, period_no)
    );
  `);
}

export function initializeBooksetSettings(db: Database.Database, payload: CreateBooksetPayload): void {
  ensureBooksetSettingsSchema(db);
  const period = `${String(payload.fiscalYear).padStart(4, "0")}年${pad(payload.fiscalPeriodNo)}期`;
  const now = new Date().toISOString();
  const insertPeriod = db.prepare(`INSERT OR IGNORE INTO fiscal_periods
    (fiscal_year, period_no, start_date, end_date, status)
    VALUES (?, ?, ?, ?, 'open')`);
  for (let month = 1; month <= 12; month += 1) {
    const item = defaultPeriod(payload.fiscalYear, month);
    insertPeriod.run(item.year, item.periodNo, item.startDate, item.endDate);
  }

  setMeta(db, "book_code", payload.bookCode);
  setMeta(db, "accounting_standard_code", payload.accountingStandard);
  setMeta(db, "base_currency_code", payload.baseCurrency);
  setMeta(db, "fiscal_year", String(payload.fiscalYear));
  setMeta(db, "fiscal_period_no", String(payload.fiscalPeriodNo));
  setMeta(db, "enable_fiscal_year", String(payload.fiscalYear));
  setMeta(db, "enable_fiscal_period_no", String(payload.fiscalPeriodNo));
  setMeta(db, "fiscal_period", period);
  setMeta(db, "company_name", payload.name.trim());
  setMeta(db, "contact", "");
  setMeta(db, "address", "");
  setMeta(db, "tax_id", "");
  setMeta(db, "bank_accounts", "[]");
  setMeta(db, "created_at", now);

  setSetting(db, "fiscalYearStartDate", dateString(payload.fiscalYear, 1, 1));
  setSetting(db, "periodDays", 30);
  setSetting(db, "periodsPerYear", 12);
  setSetting(db, "automaticNewYear", true);
  setSetting(db, "accountStructure", { levels: 4, codeLengths: [4, 2, 2, 2], firstMonthClosed: false });
  setSetting(db, "businessRules", { checkCashDeficit: false });
  setSetting(db, "closingAndLedger", { requireReviewedBeforeClose: false, sameBalanceDirection: false });
  setSetting(db, "backup", { path: "", frequencyDays: 7, time: "23:00", lastBackupAt: "" });
}

function readPeriodRows(db: Database.Database): FiscalPeriodSetting[] {
  const rows = db.prepare(`
    SELECT fiscal_year, period_no, start_date, end_date, status FROM fiscal_periods
    ORDER BY fiscal_year, period_no
  `).all() as Array<{ fiscal_year: number; period_no: number; start_date: string; end_date: string; status: "open" | "closed" }>;
  const hasVoucher = db.prepare("SELECT 1 FROM voucher_records WHERE voucher_date >= ? AND voucher_date <= ? LIMIT 1");
  return rows.map((row) => ({
    year: row.fiscal_year,
    periodNo: row.period_no,
    startDate: row.start_date,
    endDate: row.end_date,
    status: row.status,
    used: hasVoucher.get(row.start_date, row.end_date) !== undefined
  }));
}

export function getBooksetSettings(db: Database.Database): BooksetSettings {
  ensureBooksetSettingsSchema(db);
  const fiscalYearMeta = getMeta(db, "fiscal_year");
  const fiscalPeriodMeta = getMeta(db, "fiscal_period_no");
  const enabledYearMeta = getMeta(db, "enable_fiscal_year");
  const enabledPeriodMeta = getMeta(db, "enable_fiscal_period_no");
  const year = fiscalYearMeta !== "" ? Number(fiscalYearMeta) : new Date().getFullYear();
  const periodNo = fiscalPeriodMeta !== "" ? Number(fiscalPeriodMeta) : new Date().getMonth() + 1;
  const accountStructure = getSetting(db, "accountStructure", { levels: 4, codeLengths: [4, 2, 2, 2], firstMonthClosed: false });
  const periods = readPeriodRows(db);
  return {
    identity: {
      bookCode: getMeta(db, "book_code"),
      companyName: getMeta(db, "company_name") || getMeta(db, "bookset_name"),
      contact: getMeta(db, "contact"),
      address: getMeta(db, "address"),
      taxId: getMeta(db, "tax_id"),
      bankAccounts: getSetting(db, "bankAccounts", JSON.parse(getMeta(db, "bank_accounts") || "[]") as string[]),
      accountingStandard: (getMeta(db, "accounting_standard_code") || "ASBE_2006") as "ASBE_2006" | "SBE_2011",
      fiscalYear: enabledYearMeta !== "" ? Number(enabledYearMeta) : year,
      fiscalPeriodNo: enabledPeriodMeta !== "" ? Number(enabledPeriodMeta) : periodNo,
      baseCurrency: getMeta(db, "base_currency_code") || "CNY"
    },
    periods: {
      fiscalYearStartDate: getSetting(db, "fiscalYearStartDate", dateString(year, 1, 1)),
      periodDays: getSetting(db, "periodDays", 30),
      periodsPerYear: getSetting(db, "periodsPerYear", 12),
      automaticNewYear: getSetting(db, "automaticNewYear", true),
      years: [...new Set(periods.map((item) => item.year))],
      items: periods
    },
    accountStructure,
    businessRules: getSetting(db, "businessRules", { checkCashDeficit: false }),
    closingAndLedger: getSetting(db, "closingAndLedger", { requireReviewedBeforeClose: false, sameBalanceDirection: false }),
    backup: getSetting(db, "backup", { path: "", frequencyDays: 7, time: "23:00", lastBackupAt: "" })
  };
}

export function saveBooksetSettings(db: Database.Database, payload: SaveBooksetSettingsPayload): { ok: boolean; message: string } {
  ensureBooksetSettingsSchema(db);
  if (!payload.identity.companyName.trim()) return { ok: false, message: "公司名称不能为空。" };
  if (!Number.isInteger(payload.periods.periodDays) || payload.periods.periodDays < 20 || payload.periods.periodDays > 45) {
    return { ok: false, message: "每期天数必须在 20 至 45 天之间。" };
  }
  if (!Number.isInteger(payload.periods.periodsPerYear) || payload.periods.periodsPerYear < 1 || payload.periods.periodsPerYear > 12) {
    return { ok: false, message: "年度期间个数必须在 1 至 12 之间。" };
  }
  if (!Number.isInteger(payload.accountStructure.levels) || payload.accountStructure.levels < 4 || payload.accountStructure.levels > 10) {
    return { ok: false, message: "科目级次必须为 4 至 10 级。" };
  }
  if (payload.accountStructure.codeLengths.length !== payload.accountStructure.levels ||
    payload.accountStructure.codeLengths.some((length) => !Number.isInteger(length) || length < 1 || length > 10)) {
    return { ok: false, message: "每一级科目编码长度必须为 1 至 10 位，且与科目级次一致。" };
  }

  const existing = getBooksetSettings(db);
  const allPeriods = readPeriodRows(db);
  if (payload.periods.periodsPerYear < existing.periods.periodsPerYear) {
    const removedPeriods = allPeriods.filter((period) => period.periodNo > payload.periods.periodsPerYear);
    if (removedPeriods.some((period) => period.used || period.status === "closed")) {
      return { ok: false, message: "拟移除的期间中包含已使用或已结账期间，不能减少年度期间个数。" };
    }
  }
  if (existing.accountStructure.firstMonthClosed) {
    if (payload.accountStructure.levels !== existing.accountStructure.levels ||
      payload.accountStructure.codeLengths.some((length, index) => length !== existing.accountStructure.codeLengths[index])) {
      return { ok: false, message: "首次月结账后，科目结构已锁定，无法修改。" };
    }
  } else {
    if (payload.accountStructure.levels < existing.accountStructure.levels) {
      return { ok: false, message: "科目级次只允许调大，不能调小。" };
    }
    for (let index = 0; index < existing.accountStructure.codeLengths.length; index += 1) {
      if ((payload.accountStructure.codeLengths[index] ?? 0) < existing.accountStructure.codeLengths[index]!) {
        return { ok: false, message: `第 ${index + 1} 级编码长度只允许调大，不能调小。` };
      }
    }
  }

  const tx = db.transaction(() => {
    setMeta(db, "company_name", payload.identity.companyName.trim());
    setMeta(db, "bookset_name", payload.identity.companyName.trim());
    setMeta(db, "contact", payload.identity.contact.trim());
    setMeta(db, "address", payload.identity.address.trim());
    setMeta(db, "tax_id", payload.identity.taxId.trim());
    setMeta(db, "bank_accounts", JSON.stringify(payload.identity.bankAccounts.filter((item) => item.trim())));
    setSetting(db, "fiscalYearStartDate", payload.periods.fiscalYearStartDate);
    setSetting(db, "periodDays", payload.periods.periodDays);
    setSetting(db, "periodsPerYear", payload.periods.periodsPerYear);
    setSetting(db, "automaticNewYear", payload.periods.automaticNewYear);
    if (payload.periods.periodsPerYear < existing.periods.periodsPerYear) {
      db.prepare("DELETE FROM fiscal_periods WHERE period_no > ?").run(payload.periods.periodsPerYear);
    } else if (payload.periods.periodsPerYear > existing.periods.periodsPerYear) {
      const insert = db.prepare("INSERT OR IGNORE INTO fiscal_periods (fiscal_year, period_no, start_date, end_date) VALUES (?, ?, ?, ?)");
      for (const year of new Set(allPeriods.map((period) => period.year))) {
        for (let periodNo = existing.periods.periodsPerYear + 1; periodNo <= payload.periods.periodsPerYear; periodNo += 1) {
          const period = defaultPeriod(year, periodNo);
          insert.run(period.year, period.periodNo, period.startDate, period.endDate);
        }
      }
    }
    setSetting(db, "accountStructure", { ...payload.accountStructure, firstMonthClosed: existing.accountStructure.firstMonthClosed });
    setSetting(db, "businessRules", payload.businessRules);
    setSetting(db, "closingAndLedger", payload.closingAndLedger);
    setSetting(db, "backup", payload.backup);
  });
  tx();
  return { ok: true, message: "账套设置已保存。" };
}

export function updateFiscalPeriod(db: Database.Database, payload: UpdateFiscalPeriodPayload): { ok: boolean; message: string } {
  ensureBooksetSettingsSchema(db);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(payload.startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(payload.endDate) || payload.startDate > payload.endDate) {
    return { ok: false, message: "请输入有效的期间起止日期。" };
  }
  const days = Math.round((Date.parse(`${payload.endDate}T00:00:00Z`) - Date.parse(`${payload.startDate}T00:00:00Z`)) / 86_400_000) + 1;
  if (days < 20 || days > 45) return { ok: false, message: "每期长度必须在 20 至 45 天之间。" };
  const row = db.prepare("SELECT start_date, end_date, status FROM fiscal_periods WHERE fiscal_year = ? AND period_no = ?")
    .get(payload.year, payload.periodNo) as { start_date: string; end_date: string; status: "open" | "closed" } | undefined;
  if (!row) return { ok: false, message: "会计期间不存在。" };
  if (row.status === "closed") return { ok: false, message: "已结账期间不能修改。" };
  if (row.start_date <= new Date().toISOString().slice(0, 10)) return { ok: false, message: "仅允许修改未来期间。" };
  if (db.prepare("SELECT 1 FROM voucher_records WHERE voucher_date BETWEEN ? AND ? LIMIT 1").get(row.start_date, row.end_date)) {
    return { ok: false, message: "该期间已有凭证，不能修改。" };
  }
  const overlapping = db.prepare(`SELECT 1 FROM fiscal_periods
    WHERE fiscal_year = ? AND NOT (period_no = ?)
      AND start_date <= ? AND end_date >= ? LIMIT 1`)
    .get(payload.year, payload.periodNo, payload.endDate, payload.startDate);
  if (overlapping) return { ok: false, message: "该期间与其他期间日期重叠。" };
  db.prepare("UPDATE fiscal_periods SET start_date = ?, end_date = ? WHERE fiscal_year = ? AND period_no = ?")
    .run(payload.startDate, payload.endDate, payload.year, payload.periodNo);
  return { ok: true, message: "会计期间已更新。" };
}

export function addFiscalYear(db: Database.Database, year: number): { ok: boolean; message: string } {
  ensureBooksetSettingsSchema(db);
  if (!Number.isInteger(year) || year < 0 || year > 9999) return { ok: false, message: "年度必须在 0000 至 9999 之间。" };
  const exists = db.prepare("SELECT 1 FROM fiscal_periods WHERE fiscal_year = ? LIMIT 1").get(year);
  if (exists) return { ok: false, message: "该会计年度已存在。" };
  const periodsPerYear = getSetting(db, "periodsPerYear", 12);
  const insert = db.prepare("INSERT INTO fiscal_periods (fiscal_year, period_no, start_date, end_date) VALUES (?, ?, ?, ?)");
  const tx = db.transaction(() => {
    for (let month = 1; month <= periodsPerYear; month += 1) {
      const period = defaultPeriod(year, month);
      insert.run(period.year, period.periodNo, period.startDate, period.endDate);
    }
  });
  tx();
  return { ok: true, message: `${String(year).padStart(4, "0")} 年度已新增。` };
}

export function closeFiscalPeriod(db: Database.Database, year: number, periodNo: number): { ok: boolean; message: string; nextYear?: number } {
  ensureBooksetSettingsSchema(db);
  const period = db.prepare("SELECT status FROM fiscal_periods WHERE fiscal_year = ? AND period_no = ?")
    .get(year, periodNo) as { status: "open" | "closed" } | undefined;
  if (!period) return { ok: false, message: "会计期间不存在。" };
  if (period.status === "closed") return { ok: false, message: "该期间已经结账。" };
  const rules = getBooksetSettings(db);
  if (rules.closingAndLedger.requireReviewedBeforeClose) {
    const drafts = db.prepare("SELECT COUNT(*) AS count FROM voucher_records WHERE substr(voucher_date,1,7) = ? AND status = 'draft'")
      .get(`${String(year).padStart(4, "0")}-${pad(periodNo)}`) as { count: number };
    if (drafts.count > 0) return { ok: false, message: "结账前仍有未记账凭证，请完成处理。" };
  }
  const now = new Date().toISOString();
  const tx = db.transaction(() => {
    db.prepare("UPDATE fiscal_periods SET status = 'closed', closed_at = ? WHERE fiscal_year = ? AND period_no = ?")
      .run(now, year, periodNo);
    db.prepare(`INSERT INTO voucher_period_state (period_key, status, closed_at)
      VALUES (?, 'closed', ?)
      ON CONFLICT(period_key) DO UPDATE SET status = 'closed', closed_at = excluded.closed_at`)
      .run(`${String(year).padStart(4, "0")}-${pad(periodNo)}`, now);
    const structure = rules.accountStructure;
    if (!structure.firstMonthClosed) setSetting(db, "accountStructure", { ...structure, firstMonthClosed: true });
    if (periodNo === rules.periods.periodsPerYear && rules.periods.automaticNewYear) {
      const nextYear = year + 1;
      if (nextYear <= 9999) {
        const insert = db.prepare("INSERT OR IGNORE INTO fiscal_periods (fiscal_year, period_no, start_date, end_date) VALUES (?, ?, ?, ?)");
        for (let month = 1; month <= rules.periods.periodsPerYear; month += 1) {
          const next = defaultPeriod(nextYear, month);
          insert.run(next.year, next.periodNo, next.startDate, next.endDate);
        }
      }
    }
    const finalPeriod = periodNo === rules.periods.periodsPerYear;
    const nextYear = finalPeriod ? year + 1 : year;
    const nextPeriodNo = finalPeriod ? 1 : periodNo + 1;
    if (nextYear <= 9999 && (!finalPeriod || rules.periods.automaticNewYear)) {
      setMeta(db, "fiscal_year", String(nextYear));
      setMeta(db, "fiscal_period_no", String(nextPeriodNo));
      setMeta(db, "fiscal_period", `${String(nextYear).padStart(4, "0")}年${pad(nextPeriodNo)}期`);
    }
  });
  tx();
  return { ok: true, message: "期间结账完成。" };
}
