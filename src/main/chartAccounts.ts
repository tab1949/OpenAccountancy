import type Database from "better-sqlite3";
import type { AccountCategory, AccountDirection, ChartAccount, ChartAccountInput, OperationResult, UnmappedDetail, VoucherLineInput } from "../common/contracts";
import attributes from "./subjectAttributes.json";

type Standard = keyof typeof attributes;
interface AccountRow {
  code: string;
  name: string;
  category: AccountCategory;
  direction: AccountDirection;
  parent_code: string;
  level: number;
}

export function ensureChartSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS chart_detail_accounts (
      code TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('借', '贷', '借或贷')),
      parent_code TEXT NOT NULL,
      level INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS chart_detail_mappings (
      root_code TEXT NOT NULL,
      detail TEXT NOT NULL,
      account_code TEXT NOT NULL REFERENCES chart_detail_accounts(code),
      PRIMARY KEY (root_code, detail)
    );
  `);
  const schema = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'chart_detail_accounts'")
    .get() as { sql: string };
  if (!schema.sql.includes("'借或贷'")) {
    db.transaction(() => {
      db.exec(`
        CREATE TABLE chart_detail_accounts_new (
          code TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
          direction TEXT NOT NULL CHECK (direction IN ('借', '贷', '借或贷')),
          parent_code TEXT NOT NULL, level INTEGER NOT NULL
        );
        INSERT INTO chart_detail_accounts_new
        SELECT code, name, category,
          CASE direction
            WHEN '借方' THEN '借' WHEN '贷方' THEN '贷'
            WHEN '借(可贷)' THEN '借或贷' WHEN '借/贷' THEN '借或贷'
            WHEN '贷(可借)' THEN '借或贷' WHEN '借/贷(结转后无余额)' THEN '借或贷'
            WHEN '借(结转后无余额)' THEN '借' WHEN '借(期末结转后无余额)' THEN '借'
            ELSE direction
          END, parent_code, level
        FROM chart_detail_accounts;
        CREATE TABLE chart_detail_mappings_new (
          root_code TEXT NOT NULL, detail TEXT NOT NULL,
          account_code TEXT NOT NULL REFERENCES chart_detail_accounts_new(code),
          PRIMARY KEY (root_code, detail)
        );
        INSERT INTO chart_detail_mappings_new SELECT root_code, detail, account_code FROM chart_detail_mappings;
        DROP TABLE chart_detail_mappings;
        DROP TABLE chart_detail_accounts;
        ALTER TABLE chart_detail_accounts_new RENAME TO chart_detail_accounts;
        ALTER TABLE chart_detail_mappings_new RENAME TO chart_detail_mappings;
      `);
    })();
  }
}

function standard(db: Database.Database): Standard {
  const row = db.prepare("SELECT value FROM bookset_meta WHERE key = 'accounting_standard_code'").get() as { value: string } | undefined;
  if (row?.value !== "ASBE_2006" && row?.value !== "SBE_2011") throw new Error("账套会计准则无效，无法读取科目表。");
  return row.value;
}

export function listChartAccounts(db: Database.Database): ChartAccount[] {
  ensureChartSchema(db);
  const standardAttributes: Record<string, { category: string; direction: string }> = attributes[standard(db)];
  const roots = db.prepare("SELECT account_code, account_name FROM voucher_account_catalog WHERE is_active = 1 ORDER BY account_code")
    .all() as Array<{ account_code: string; account_name: string }>;
  const rows = db.prepare("SELECT code, name, category, direction, parent_code, level FROM chart_detail_accounts ORDER BY code").all() as AccountRow[];
  const used = new Set((db.prepare("SELECT DISTINCT account_code FROM chart_detail_mappings").all() as Array<{ account_code: string }>).map((row) => row.account_code));
  const result: ChartAccount[] = roots.map((root) => {
    const meta = standardAttributes[root.account_code];
    if (!meta) throw new Error(`总账科目 ${root.account_code} 缺少准则属性。`);
    if (meta.direction !== "借" && meta.direction !== "贷" && meta.direction !== "借或贷") {
      throw new Error(`总账科目 ${root.account_code} 的余额方向无效。`);
    }
    return { code: root.account_code, name: root.account_name, category: meta.category as AccountCategory, direction: meta.direction,
      parentCode: null, level: 1, used: true };
  });
  for (const row of rows) {
    result.push({ code: row.code, name: row.name, category: row.category, direction: row.direction,
      parentCode: row.parent_code, level: row.level, used: used.has(row.code) });
  }
  return result.sort((a, b) => a.code.localeCompare(b.code));
}

function accountStructure(db: Database.Database): { levels: number; codeLengths: number[] } {
  const row = db.prepare("SELECT setting_value FROM bookset_settings WHERE setting_key = 'accountStructure'")
    .get() as { setting_value: string } | undefined;
  if (!row) throw new Error("账套科目结构未设置。");
  const value = JSON.parse(row.setting_value) as { levels: number; codeLengths: number[] };
  if (!Number.isInteger(value.levels) || !Array.isArray(value.codeLengths) || value.codeLengths.length !== value.levels ||
    value.codeLengths.some((length) => !Number.isInteger(length) || length < 1)) {
    throw new Error("账套科目结构无效。");
  }
  return value;
}

export function saveChartAccount(db: Database.Database, input: ChartAccountInput, originalCode?: string): OperationResult {
  const accounts = listChartAccounts(db);
  const original = originalCode ? accounts.find((account) => account.code === originalCode) : undefined;
  if (originalCode && !original) return { ok: false, message: "科目不存在，请刷新后重试。" };
  if (original && original.level === 1) return { ok: false, message: "总账科目不可修改。" };
  const parent = accounts.find((account) => account.code === input.parentCode);
  if (!parent || (original && parent.code !== original.parentCode)) return { ok: false, message: "上级科目无效。" };
  if (!original && parent.used && parent.level > 1) return { ok: false, message: "已被凭证明细使用的末级科目不能新增下级科目。" };
  const structure = accountStructure(db);
  const level = parent.level + 1;
  if (level > structure.levels) return { ok: false, message: "该科目已达到最大级次。" };
  const segmentLength = structure.codeLengths[level - 1]!;
  if (!input.code.startsWith(parent.code) || !/^\d+$/.test(input.code) || input.code.length !== parent.code.length + segmentLength) {
    return { ok: false, message: `科目编码须以上级编码开头，并增加 ${segmentLength} 位数字。` };
  }
  const name = input.name.trim();
  if (!name) return { ok: false, message: "科目名称不能为空。" };
  const allowed: AccountCategory[] = standard(db) === "ASBE_2006"
    ? ["资产", "负债", "共同", "所有者权益", "成本", "损益"]
    : ["资产", "负债", "所有者权益", "成本", "损益"];
  if (!allowed.includes(input.category) || !["借", "贷", "借或贷"].includes(input.direction)) return { ok: false, message: "科目类型或余额方向无效。" };
  if (accounts.some((account) => account.code === input.code && account.code !== originalCode)) return { ok: false, message: "科目编码已存在。" };
  if (original && input.code !== original.code && (original.used || accounts.some((account) => account.parentCode === original.code))) {
    return { ok: false, message: "已使用或存在下级科目的编码不能修改。" };
  }
  if (original) {
    db.prepare("UPDATE chart_detail_accounts SET code = ?, name = ?, category = ?, direction = ? WHERE code = ?")
      .run(input.code, name, input.category, input.direction, original.code);
  } else {
    db.prepare("INSERT INTO chart_detail_accounts (code, name, category, direction, parent_code, level) VALUES (?, ?, ?, ?, ?, ?)")
      .run(input.code, name, input.category, input.direction, parent.code, level);
  }
  return { ok: true, message: original ? "科目已更新。" : "科目已新增。" };
}

export function deleteChartAccount(db: Database.Database, code: string): OperationResult {
  const accounts = listChartAccounts(db);
  const account = accounts.find((item) => item.code === code);
  if (!account) return { ok: false, message: "科目不存在，请刷新后重试。" };
  if (account.level === 1) return { ok: false, message: "总账科目不可删除。" };
  if (account.used || accounts.some((item) => item.parentCode === code)) return { ok: false, message: "科目已被使用或存在下级科目，不能删除。" };
  db.prepare("DELETE FROM chart_detail_accounts WHERE code = ?").run(code);
  return { ok: true, message: "科目已删除。" };
}

export function listUnmappedDetails(db: Database.Database, voucherIds?: number[]): UnmappedDetail[] {
  ensureChartSchema(db);
  const rows = db.prepare("SELECT voucher_id, payload_json FROM voucher_records ORDER BY voucher_date, voucher_no, voucher_id").all() as Array<{ voucher_id: number; payload_json: string }>;
  const selected = voucherIds ? new Set(voucherIds) : null;
  const mapped = db.prepare("SELECT 1 FROM chart_detail_mappings WHERE root_code = ? AND detail = ?");
  const accounts = new Map(listChartAccounts(db).filter((account) => account.level === 1).map((account) => [account.code, account.name]));
  const result = new Map<string, UnmappedDetail>();
  for (const row of rows) {
    if (selected && !selected.has(row.voucher_id)) continue;
    const payload = JSON.parse(row.payload_json) as { lines: VoucherLineInput[] };
    if (!Array.isArray(payload.lines)) throw new Error(`凭证 ${row.voucher_id} 的分录数据无效。`);
    for (const line of payload.lines) {
      const detail = line.detail.trim();
      if (!line.accountCode || !detail || mapped.get(line.accountCode, detail)) continue;
      const rootName = accounts.get(line.accountCode);
      if (!rootName) throw new Error(`凭证 ${row.voucher_id} 的总账科目 ${line.accountCode} 不存在。`);
      const key = JSON.stringify([line.accountCode, detail]);
      const existing = result.get(key);
      if (existing) existing.count += 1;
      else result.set(key, { rootCode: line.accountCode, rootName, detail, count: 1 });
    }
  }
  return [...result.values()];
}

export function mapVoucherDetail(db: Database.Database, rootCode: string, detail: string, accountCode: string): OperationResult {
  const accounts = listChartAccounts(db);
  const root = accounts.find((item) => item.code === rootCode && item.level === 1);
  const account = accounts.find((item) => item.code === accountCode && item.level > 1 && item.code.startsWith(rootCode));
  if (!root || !account || !detail.trim()) return { ok: false, message: "请选择该总账科目下的有效明细科目。" };
  if (accounts.some((item) => item.parentCode === accountCode)) return { ok: false, message: "请选择末级明细科目。" };
  if (!listUnmappedDetails(db).some((item) => item.rootCode === rootCode && item.detail === detail)) {
    return { ok: false, message: "该明细已映射或不存在，请刷新后重试。" };
  }
  db.prepare("INSERT INTO chart_detail_mappings (root_code, detail, account_code) VALUES (?, ?, ?)")
    .run(rootCode, detail, accountCode);
  return { ok: true, message: "凭证明细已映射到科目。" };
}

export function createAccountForVoucherDetail(db: Database.Database, rootCode: string, detail: string, input: ChartAccountInput): OperationResult {
  ensureChartSchema(db);
  try {
    return db.transaction(() => {
      const accounts = listChartAccounts(db);
      const root = accounts.find((account) => account.level === 1 && account.code === rootCode);
      const parent = accounts.find((account) => account.code === input.parentCode);
      if (!root || !parent || !parent.code.startsWith(root.code)) {
        return { ok: false, message: "上级科目必须属于该凭证的总账科目。" };
      }
      if (!listUnmappedDetails(db).some((item) => item.rootCode === rootCode && item.detail === detail)) {
        return { ok: false, message: "该明细已关联或不存在，请刷新后重试。" };
      }
      const name = input.name.trim();
      const getMapping = db.prepare("SELECT account_code FROM chart_detail_mappings WHERE root_code = ? AND detail = ?");
      if (name && name !== detail && getMapping.get(rootCode, name)) {
        return { ok: false, message: "该科目名称已关联其他明细科目，请修改名称。" };
      }
      const saved = saveChartAccount(db, input);
      if (!saved.ok) return saved;
      const mapped = mapVoucherDetail(db, rootCode, detail, input.code);
      if (!mapped.ok) throw new Error(mapped.message);
      if (name !== detail) {
        db.prepare("INSERT INTO chart_detail_mappings (root_code, detail, account_code) VALUES (?, ?, ?)")
          .run(rootCode, name, input.code);
      }
      return { ok: true, message: "科目已新建并关联凭证明细。" };
    })();
  } catch (error) {
    return { ok: false, message: `新建科目失败：${error instanceof Error ? error.message : String(error)}` };
  }
}
