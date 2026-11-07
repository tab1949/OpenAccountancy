import type { LedgerKind, LedgerResult, TrialBalanceRow } from "./contracts";

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

export function ledgerTable(result: LedgerResult): LedgerTable {
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
  return {
    headers: ["序号", "科目编码", "科目名称", "期初借方", "期初贷方", "本期借方", "本期贷方", "期末借方", "期末贷方"],
    headerRows: [
      [
        ...["序号", "科目编码", "科目名称"].map((label) => ({ label, rowSpan: 2 })),
        ...["期初", "本期", "期末"].map((label) => ({ label, colSpan: 2 }))
      ],
      ["借方", "贷方", "借方", "贷方", "借方", "贷方"].map((label) => ({ label }))
    ],
    rows: [
      ...result.balances.map((row, index) => ({ kind: "account", cells: [String(index + 1), row.code, row.name, ...keys.map((key) => row[key])] })),
      { kind: "total", cells: ["合计", "", "", ...totals] }
    ]
  };
}
