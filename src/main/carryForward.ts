import type Database from "better-sqlite3";
import type {
  CarryForwardAccount,
  CarryForwardBalanceRow,
  CarryForwardKind,
  CarryForwardMutationResult,
  CarryForwardAccountsResult,
  GenerateCarryForwardPayload,
  VoucherInput,
  VoucherLineInput
} from "../common/contracts";
import { listChartAccounts } from "./chartAccounts";
import { queryLedger } from "./ledgers";
import { saveVoucherBatch } from "./vouchers";

interface PeriodRow {
  fiscal_year: number;
  period_no: number;
  start_date: string;
  end_date: string;
  status: "open" | "closed";
}

function periodForCarry(db: Database.Database, year: number, periodNo: number): PeriodRow {
  const period = db.prepare(`SELECT fiscal_year, period_no, start_date, end_date, status
    FROM fiscal_periods WHERE fiscal_year = ? AND period_no = ?`).get(year, periodNo) as PeriodRow | undefined;
  if (!period) throw new Error("请选择有效的结转期间。");
  if (period.status === "closed") throw new Error("该期间已结账，不能生成结转凭证。");

  const currentYear = Number((db.prepare("SELECT value FROM bookset_meta WHERE key = 'fiscal_year'").get() as { value: string } | undefined)?.value);
  const currentPeriodNo = Number((db.prepare("SELECT value FROM bookset_meta WHERE key = 'fiscal_period_no'").get() as { value: string } | undefined)?.value);
  const current = db.prepare(`SELECT start_date FROM fiscal_periods
    WHERE fiscal_year = ? AND period_no = ?`).get(currentYear, currentPeriodNo) as { start_date: string } | undefined;
  if (!current) throw new Error("当前会计期间无效，无法执行结转。");
  if (period.start_date > current.start_date) throw new Error("不能选择晚于当前期间的结转期间。");
  return period;
}

function balanceRowId(rootCode: string, detail: string, isTotal: boolean): string {
  return JSON.stringify([rootCode, detail, isTotal]);
}

export function getCarryForwardAccounts(db: Database.Database, year: number, periodNo: number): CarryForwardAccountsResult {
  const period = periodForCarry(db, year, periodNo);
  const accounts = listChartAccounts(db);
  const balances = queryLedger(db, {
    kind: "trial-balance",
    from: { year, periodNo },
    to: { year, periodNo },
    rootsOnly: false
  }).balances;
  const balanceByCode = new Map(balances.map((row) => [row.code, row.closingDebit - row.closingCredit]));
  const accountByCode = new Map(accounts.map((account) => [account.code, account]));
  const roots = accounts.filter((account) => account.level === 1);
  const mappings = db.prepare(`SELECT root_code, detail, account_code FROM chart_detail_mappings
    ORDER BY root_code, detail`).all() as Array<{ root_code: string; detail: string; account_code: string }>;

  return {
    accounts: roots.map((root): CarryForwardAccount => {
      const rows: CarryForwardBalanceRow[] = [{
        id: balanceRowId(root.code, "", true),
        rootCode: root.code,
        rootName: root.name,
        category: root.category,
        detail: "",
        level: 1,
        balance: balanceByCode.get(root.code) ?? 0,
        isTotal: true
      }];
      for (const mapping of mappings.filter((item) => item.root_code === root.code)) {
        const detailAccount = accountByCode.get(mapping.account_code);
        if (!detailAccount) throw new Error(`映射的科目 ${mapping.account_code} 不存在。`);
        rows.push({
          id: balanceRowId(root.code, mapping.detail, false),
          rootCode: root.code,
          rootName: root.name,
          category: root.category,
          detail: mapping.detail,
          level: detailAccount.level,
          balance: balanceByCode.get(mapping.account_code) ?? 0,
          isTotal: false
        });
      }
      return { code: root.code, name: root.name, category: root.category, rows };
    })
  };
}

function validateCategories(kind: CarryForwardKind, source: CarryForwardAccount, target: CarryForwardAccount): void {
  if (kind === "cogs" && (source.category !== "资产" || target.category !== "损益")) {
    throw new Error("销售成本结转仅支持资产类科目结转至损益类科目。");
  }
  if (kind === "profit-loss" && (source.category !== "损益" || target.category !== "所有者权益")) {
    throw new Error("期间损益结转仅支持损益类科目结转至所有者权益类科目。");
  }
  if (!["custom", "cogs", "profit-loss"].includes(kind)) throw new Error("结转类型无效。");
}

function emptyVoucherLines(): VoucherLineInput[] {
  return Array.from({ length: 11 }, (_, index) => ({
    lineNo: index + 1,
    summary: "",
    accountCode: "",
    accountName: "",
    detail: "",
    debit: 0,
    credit: 0
  }));
}

export function generateCarryForwardVouchers(db: Database.Database, payload: GenerateCarryForwardPayload): CarryForwardMutationResult {
  try {
    if (!payload || !Array.isArray(payload.sourceRowIds) || !payload.sourceRowIds.length ||
      typeof payload.targetRowId !== "string" || typeof payload.summary !== "string" || !payload.summary.trim()) {
      throw new Error("请选择结转明细和目标科目，并填写凭证摘要。");
    }

    const period = periodForCarry(db, payload.year, payload.periodNo);
    const available = getCarryForwardAccounts(db, payload.year, payload.periodNo).accounts;
    const accountByCode = new Map(available.map((account) => [account.code, account]));
    const rowById = new Map(available.flatMap((account) => account.rows.map((row) => [row.id, { account, row }] as const)));
    const target = rowById.get(payload.targetRowId);
    if (!target) throw new Error("结转目标科目无效，请刷新后重试。");
    if (payload.sourceRowIds.includes(payload.targetRowId)) throw new Error("来源科目与承接科目不能相同。");

    const sourceRows = payload.sourceRowIds.map((id) => {
      const selected = rowById.get(id);
      if (!selected) throw new Error("结转明细无效，请刷新后重试。");
      const sourceAccount = accountByCode.get(selected.row.rootCode);
      if (!sourceAccount) throw new Error("结转科目不存在，请刷新后重试。");
      validateCategories(payload.kind, sourceAccount, target.account);
      return selected.row;
    });
    if (new Set(payload.sourceRowIds).size !== payload.sourceRowIds.length) throw new Error("结转明细不能重复选择。");
    const selectedIds = new Set(payload.sourceRowIds);
    for (const row of sourceRows) {
      if (row.isTotal && available.find((account) => account.code === row.rootCode)?.rows.some((detail) =>
        !detail.isTotal && selectedIds.has(detail.id))) {
        throw new Error("同一科目的期末余额与明细不能同时结转。");
      }
    }

    if (payload.kind === "profit-loss" && sourceRows.some((row) => row.category !== "损益")) {
      throw new Error("期间损益结转只能选择损益类科目。");
    }
    if (sourceRows.some((row) => !Number.isFinite(row.balance) || row.balance === 0)) {
      throw new Error("所选结转明细存在无余额科目，请重新选择。");
    }

    const sourceAccountForRow = (row: CarryForwardBalanceRow): CarryForwardAccount => {
      const account = accountByCode.get(row.rootCode);
      if (!account) throw new Error("结转科目不存在，请刷新后重试。");
      return account;
    };
    const summary = payload.summary.trim();
    const voucherInputs: VoucherInput[] = [];
    for (let offset = 0; offset < sourceRows.length; offset += 10) {
      const batch = sourceRows.slice(offset, offset + 10);
      const lines = emptyVoucherLines();
      let debitCents = 0;
      let creditCents = 0;
      batch.forEach((row, index) => {
        const account = sourceAccountForRow(row);
        const cents = Math.round(Math.abs(row.balance) * 100);
        const line: VoucherLineInput = {
          lineNo: index + 1,
          summary,
          accountCode: row.rootCode,
          accountName: account.name,
          detail: row.detail,
          debit: row.balance < 0 ? cents / 100 : 0,
          credit: row.balance > 0 ? cents / 100 : 0
        };
        lines[index] = line;
        debitCents += Math.round(line.debit * 100);
        creditCents += Math.round(line.credit * 100);
      });

      const difference = debitCents - creditCents;
      if (difference !== 0) {
        lines[batch.length] = {
          lineNo: batch.length + 1,
          summary,
          accountCode: target.row.rootCode,
          accountName: target.account.name,
          detail: target.row.detail,
          debit: difference < 0 ? -difference / 100 : 0,
          credit: difference > 0 ? difference / 100 : 0
        };
      }
      if (batch.length + (difference === 0 ? 0 : 1) < 2) throw new Error("结转明细不足以生成有效凭证。");
      voucherInputs.push({ voucherDate: period.end_date, lines, attachments: [] });
    }

    const saved = saveVoucherBatch(db, voucherInputs);
    if (!saved.ok) throw new Error(saved.message);
    return {
      ok: true,
      message: `已生成 ${saved.voucherIds.length} 张结转凭证。`,
      voucherIds: saved.voucherIds
    };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "生成结转凭证失败。", voucherIds: [] };
  }
}
