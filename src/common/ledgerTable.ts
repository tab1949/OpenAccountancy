import type { LedgerKind, LedgerResult, TrialBalanceRow } from "./contracts";
import { accountCategories } from "./accountCategories";
import { DEFAULT_ACCOUNT_INDENT, indentAccount } from "./accountIndent";

type Cell = string | number;
export interface LedgerHeaderCell {
  label: string;
  colSpan?: number;
  rowSpan?: number;
}

export interface LedgerTable {
  headers: string[];
  headerRows: LedgerHeaderCell[][];
  rows: Array<{ kind: string; cells: Cell[] }>;
}

export function formatLedgerCell(value: Cell, kind: LedgerKind): string {
  if (typeof value !== "number") return value;
  return kind === "trial-balance" && value === 0 ? "" : value.toFixed(2);
}

export function accountSummaryTable(result: LedgerResult, indentStyle = DEFAULT_ACCOUNT_INDENT): LedgerTable {
  if (result.kind !== "trial-balance") throw new Error("科目汇总表数据类型无效。");
  const headers = ["科目名称", "借方发生额", "贷方发生额", "科目名称", "借方发生额", "贷方发生额"];
  for (const row of result.balances) {
    if (!accountCategories.includes(row.category)) throw new Error(`科目 ${row.code} 的科目类型无效。`);
  }
  const categories = accountCategories.filter((category) => result.balances.some((row) => row.category === category));
  const ordered = categories.flatMap((category) => result.balances.filter((row) => row.category === category));
  const split = Math.ceil(ordered.length / 2);
  const left = ordered.slice(0, split);
  const right = ordered.slice(split);
  const column = (rows: TrialBalanceRow[]): Cell[][] => {
    const entries: Cell[][] = [];
    let previous: TrialBalanceRow["category"] | undefined;
    for (const row of rows) {
      if (row.category !== previous) {
        entries.push([`${categories.indexOf(row.category) + 1}.${row.category}类`, "", ""]);
        previous = row.category;
      }
      entries.push([`${indentAccount(row.code, row.level, indentStyle)} ${indentAccount(row.name, row.level, indentStyle)}`, row.debit, row.credit]);
    }
    return entries;
  };
  const leftCells = column(left);
  const rightCells = column(right);
  const total = (rows: TrialBalanceRow[]): Cell[] => {
    let debit = 0, credit = 0;
    for (const row of rows) {
      if (row.level !== 1) continue;
      debit += Math.round(row.debit * 100);
      credit += Math.round(row.credit * 100);
      if (!Number.isSafeInteger(debit) || !Number.isSafeInteger(credit)) throw new Error("科目汇总表合计超出计算范围。");
    }
    return ["合计", debit / 100, credit / 100];
  };
  return {
    headers,
    headerRows: [headers.map((label) => ({ label }))],
    rows: [
      ...Array.from({ length: Math.max(leftCells.length, rightCells.length) }, (_, index) => ({
        kind: "account", cells: [...(leftCells[index] ?? ["", "", ""]), ...(rightCells[index] ?? ["", "", ""])]
      })),
      { kind: "total", cells: [...total(left), ...total(right)] }
    ]
  };
}

export function ledgerTable(result: LedgerResult, indentStyle = DEFAULT_ACCOUNT_INDENT): LedgerTable {
  if (result.kind !== "trial-balance") {
    const general = result.kind === "general";
    const headers = general ? ["序号", "期间", "摘要", "借方", "贷方", "方向", "余额"] : ["序号", "日期", "凭证号", "摘要", "借方", "贷方", "方向", "余额"];
    return {
      headers,
      headerRows: [headers.map((label) => ({ label }))],
      rows: result.rows.map((row, index) => ({
        kind: row.kind,
        cells: general
          ? [String(index + 1), row.date, row.summary, row.debit, row.credit, row.direction, row.balance]
          : [String(index + 1), row.date, row.voucherNo, row.summary, row.debit, row.credit, row.direction, row.balance]
      }))
    };
  }
  const keys: Array<keyof Pick<TrialBalanceRow, "openingDebit" | "openingCredit" | "debit" | "credit" | "closingDebit" | "closingCredit">> =
    ["openingDebit", "openingCredit", "debit", "credit", "closingDebit", "closingCredit"];
  const roots = result.balances.filter((row) => row.level === 1);
  const totals = keys.map((key) => {
    const cents = roots.reduce((sum, row) => sum + Math.round(row[key] * 100), 0);
    if (!Number.isSafeInteger(cents)) throw new Error("科目余额表合计超出计算范围。");
    return cents / 100;
  });
  const groupLabels = ["期初余额", "本期发生额", "期末余额"];
  return {
    headers: ["序号", "科目编码", "科目名称", ...groupLabels.flatMap((label) => [`${label}借方`, `${label}贷方`])],
    headerRows: [
      [
        ...["序号", "科目编码", "科目名称"].map((label) => ({ label, rowSpan: 2 })),
        ...groupLabels.map((label) => ({ label, colSpan: 2 }))
      ],
      ["借方", "贷方", "借方", "贷方", "借方", "贷方"].map((label) => ({ label }))
    ],
    rows: [
      ...result.balances.map((row, index) => ({ kind: "account", cells: [String(index + 1), indentAccount(row.code, row.level, indentStyle), indentAccount(row.name, row.level, indentStyle), ...keys.map((key) => row[key])] })),
      { kind: "total", cells: ["合计", "", "", ...totals] }
    ]
  };
}
