import type Database from "better-sqlite3";
import type { ChartAccount, LedgerQuery, LedgerResult, LedgerRow, TrialBalanceRow, VoucherLineInput } from "../common/contracts";
import { listChartAccounts } from "./chartAccounts";

interface Period {
  fiscal_year: number;
  period_no: number;
  start_date: string;
  end_date: string;
}

interface Posting {
  date: string;
  voucherNo: number;
  voucherId: number;
  lineNo: number;
  rootCode: string;
  accountCode: string;
  summary: string;
  debit: number;
  credit: number;
  period: Period;
}

function cents(value: number): number {
  if (!Number.isFinite(value) || value < 0) throw new Error("凭证金额无效，无法生成账簿。");
  const result = Math.round(value * 100);
  if (!Number.isSafeInteger(result)) throw new Error("凭证金额超出计算范围。");
  return result;
}

function add(a: number, b: number): number {
  const result = a + b;
  if (!Number.isSafeInteger(result)) throw new Error("账簿金额超出计算范围。");
  return result;
}

function money(value: number): number { return value / 100; }
function direction(value: number): "借" | "贷" | "平" { return value > 0 ? "借" : value < 0 ? "贷" : "平"; }
function periodLabel(period: Period): string { return `${String(period.fiscal_year).padStart(4, "0")}-${String(period.period_no).padStart(2, "0")}`; }

export function queryLedger(db: Database.Database, query: LedgerQuery): LedgerResult {
  if (!["general", "subsidiary", "journal", "trial-balance"].includes(query.kind)) throw new Error("账簿类型无效。");
  const accounts = listChartAccounts(db);
  const account = query.kind === "trial-balance" ? undefined : accounts.find((item) => item.code === query.accountCode);
  if (query.kind !== "trial-balance" && !account) throw new Error("请选择有效科目。");
  if ((query.kind === "general" || query.kind === "journal") && account?.level !== 1) throw new Error("请选择总账科目。");

  const periods = db.prepare("SELECT fiscal_year, period_no, start_date, end_date FROM fiscal_periods ORDER BY start_date, fiscal_year, period_no").all() as Period[];
  const fromIndex = periods.findIndex((period) => period.fiscal_year === query.from.year && period.period_no === query.from.periodNo);
  const toIndex = periods.findIndex((period) => period.fiscal_year === query.to.year && period.period_no === query.to.periodNo);
  if (fromIndex < 0 || toIndex < fromIndex) throw new Error("请选择有效的起止会计期间。");
  for (let index = 0; index < periods.length; index += 1) {
    const period = periods[index]!;
    if (period.start_date > period.end_date || (index > 0 && periods[index - 1]!.end_date >= period.start_date)) {
      throw new Error("会计期间日期无效或重叠，请先检查期间设置。");
    }
  }
  const from = periods[fromIndex]!;
  const to = periods[toIndex]!;
  const meta = db.prepare("SELECT key, value FROM bookset_meta WHERE key IN ('enable_fiscal_year', 'enable_fiscal_period_no')")
    .all() as Array<{ key: string; value: string }>;
  const enabled = periods.find((period) => period.fiscal_year === Number(meta.find((item) => item.key === "enable_fiscal_year")?.value) &&
    period.period_no === Number(meta.find((item) => item.key === "enable_fiscal_period_no")?.value));
  if (!enabled) throw new Error("账套启用期间不存在，无法计算期初余额。");
  if (from.start_date < enabled.start_date) throw new Error("查询起始期间不能早于账套启用期间。");

  const rootCodes = new Set(accounts.filter((item) => item.level === 1).map((item) => item.code));
  const mapped = new Map((db.prepare("SELECT root_code, detail, account_code FROM chart_detail_mappings").all() as Array<{ root_code: string; detail: string; account_code: string }>)
    .map((item) => [JSON.stringify([item.root_code, item.detail]), item.account_code]));
  const validCodes = new Set(accounts.map((item) => item.code));
  const rows = db.prepare("SELECT voucher_id, voucher_date, voucher_no, payload_json FROM voucher_records WHERE status = 'posted' AND voucher_date <= ? ORDER BY voucher_date, voucher_no, voucher_id")
    .all(to.end_date) as Array<{ voucher_id: number; voucher_date: string; voucher_no: number; payload_json: string }>;
  const postings: Posting[] = [];
  for (const row of rows) {
    if (row.voucher_date < enabled.start_date) throw new Error(`凭证 ${row.voucher_id} 早于账套启用期间，无法计算期初余额。`);
    const matches = periods.filter((period) => period.start_date <= row.voucher_date && period.end_date >= row.voucher_date);
    if (matches.length !== 1) throw new Error(`凭证 ${row.voucher_id} 的日期不属于唯一的会计期间。`);
    const payload = JSON.parse(row.payload_json) as { lines: VoucherLineInput[] };
    if (!Array.isArray(payload.lines)) throw new Error(`凭证 ${row.voucher_id} 的分录数据无效。`);
    for (const line of payload.lines) {
      if (!line.accountCode && !line.debit && !line.credit) continue;
      if (!rootCodes.has(line.accountCode) || typeof line.detail !== "string" || typeof line.summary !== "string") {
        throw new Error(`凭证 ${row.voucher_id} 的科目或分录数据无效。`);
      }
      const needsDetail = query.kind === "trial-balance" ? !query.rootsOnly : account?.level !== 1 && account?.code.startsWith(line.accountCode);
      const detail = line.detail.trim();
      const code = detail ? mapped.get(JSON.stringify([line.accountCode, detail])) : line.accountCode;
      if (needsDetail && (!code || !validCodes.has(code) || !code.startsWith(line.accountCode))) {
        throw new Error(`凭证 ${row.voucher_id} 的明细“${detail}”尚未映射，请在科目表中先完成映射。`);
      }
      postings.push({ date: row.voucher_date, voucherNo: row.voucher_no, voucherId: row.voucher_id, lineNo: line.lineNo,
        rootCode: line.accountCode, accountCode: code ?? line.accountCode, summary: line.summary,
        debit: cents(line.debit), credit: cents(line.credit), period: matches[0]! });
    }
  }
  postings.sort((a, b) => a.date.localeCompare(b.date) || a.voucherNo - b.voucherNo || a.voucherId - b.voucherId || a.lineNo - b.lineNo);

  const matchesAccount = (posting: Posting, target: ChartAccount): boolean =>
    target.level === 1 ? posting.rootCode === target.code : posting.accountCode.startsWith(target.code);
  const sum = (items: Posting[]): { debit: number; credit: number; net: number } => {
    let debit = 0, credit = 0;
    for (const item of items) { debit = add(debit, item.debit); credit = add(credit, item.credit); }
    return { debit, credit, net: add(debit, -credit) };
  };
  if (query.kind === "trial-balance") {
    const visible = query.rootsOnly ? accounts.filter((item) => item.level === 1) : accounts;
    const balances: TrialBalanceRow[] = visible.map((item) => {
      const selected = postings.filter((posting) => matchesAccount(posting, item));
      const opening = sum(selected.filter((posting) => posting.date < from.start_date)).net;
      const movement = sum(selected.filter((posting) => posting.date >= from.start_date));
      const closing = add(opening, movement.net);
      return { code: item.code, name: item.name, level: item.level, openingDebit: money(Math.max(opening, 0)),
        openingCredit: money(Math.max(-opening, 0)), debit: money(movement.debit), credit: money(movement.credit),
        closingDebit: money(Math.max(closing, 0)), closingCredit: money(Math.max(-closing, 0)) };
    });
    return { kind: query.kind, rows: [], balances };
  }
  const selected = postings.filter((posting) => matchesAccount(posting, account!));
  let running = sum(selected.filter((posting) => posting.date < from.start_date)).net;
  const ledgerRows: LedgerRow[] = [{ kind: "opening", date: "", voucherNo: "", summary: "期初余额", debit: 0, credit: 0, direction: direction(running), balance: money(Math.abs(running)) }];
  for (const period of periods.slice(fromIndex, toIndex + 1)) {
    const items = selected.filter((item) => item.period.fiscal_year === period.fiscal_year && item.period.period_no === period.period_no);
    for (const item of items) {
      running = add(running, add(item.debit, -item.credit));
      if (query.kind !== "general") ledgerRows.push({ kind: "entry", date: item.date, voucherNo: String(item.voucherNo).padStart(4, "0"),
        summary: item.summary, debit: money(item.debit), credit: money(item.credit), direction: direction(running), balance: money(Math.abs(running)) });
    }
    const month = sum(items);
    const year = sum(selected.filter((item) => item.period.fiscal_year === period.fiscal_year && item.date <= period.end_date));
    ledgerRows.push({ kind: "period", date: periodLabel(period), voucherNo: "", summary: "本月合计",
      debit: money(month.debit), credit: money(month.credit), direction: direction(running), balance: money(Math.abs(running)) });
    ledgerRows.push({ kind: "year", date: periodLabel(period), voucherNo: "", summary: "本年累计",
      debit: money(year.debit), credit: money(year.credit), direction: direction(running), balance: money(Math.abs(running)) });
  }
  return { kind: query.kind, account, rows: ledgerRows, balances: [] };
}
