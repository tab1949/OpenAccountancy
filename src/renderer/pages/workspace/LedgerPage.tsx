import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { accountSummaryTable, ledgerTable } from "../../../common/ledgerTable";
import { cashierJournals } from "../../../common/cashierJournal";
import { DEFAULT_ACCOUNT_INDENT } from "../../../common/accountIndent";
import type { CashierJournal, ChartAccount, FiscalPeriodSetting, LedgerExportFormat, LedgerKind, LedgerQuery, LedgerResult } from "../../../common/contracts";
import { useCurrentAccountingPeriod } from "../../CurrentAccountingPeriodContext";
import { LedgerTableHeader } from "../../components/LedgerTableHeader";
import { LedgerTableBody } from "../../components/LedgerTableBody";
import type { ShellContextState } from "../types";

const titles: Record<LedgerKind, string> = {
  general: "科目总账", subsidiary: "科目明细账", journal: "科目日记账", "trial-balance": "科目余额表"
};
function key(year: number, period: number): string { return `${year}:${period}`; }
function parseKey(value: string): { year: number; periodNo: number } {
  const [year, periodNo] = value.split(":").map(Number);
  return { year: year!, periodNo: periodNo! };
}
function label(period: FiscalPeriodSetting): string {
  return `${String(period.year).padStart(4, "0")}年${String(period.periodNo).padStart(2, "0")}期`;
}

export function initialLedgerPeriod(periods: FiscalPeriodSetting[], current: { year: number; periodNo: number } | null, singlePeriod: boolean): string {
  const selected = current && periods.find((period) => period.year === current.year && period.periodNo === current.periodNo);
  const initial = selected || (singlePeriod ? undefined : periods[0]);
  return initial ? key(initial.year, initial.periodNo) : "";
}

export function ledgerPeriodRange(from: string, to: string, singlePeriod: boolean): Pick<LedgerQuery, "from" | "to"> {
  return { from: parseKey(from), to: parseKey(singlePeriod ? from : to) };
}

export function LedgerPage({ kind, cashierJournal, closingReport }: {
  kind: LedgerKind;
  cashierJournal?: CashierJournal;
  closingReport?: LedgerQuery["closingReport"];
}): ReactElement {
  const { currentAccountingPeriod } = useCurrentAccountingPeriod();
  const { shellState } = useOutletContext<ShellContextState>();
  const [periods, setPeriods] = useState<FiscalPeriodSetting[]>([]);
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [indentStyle, setIndentStyle] = useState(DEFAULT_ACCOUNT_INDENT);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [accountCode, setAccountCode] = useState("");
  const [rootsOnly, setRootsOnly] = useState(false);
  const [showSummaryDetails, setShowSummaryDetails] = useState(false);
  const [result, setResult] = useState<LedgerResult | null>(null);
  const [queried, setQueried] = useState<LedgerQuery | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    setResult(null);
    setQueried(null);
    setMessage("");
    setAccounts([]);
    setPeriods([]);
    void Promise.all([window.openAccountancy.getBooksetSettings(), window.openAccountancy.listChartAccounts()])
      .then(([settings, list]) => {
        if (!active) return;
        if (!settings) throw new Error("请先打开账套。");
        const sorted = [...settings.periods.items].sort((a, b) => a.startDate.localeCompare(b.startDate));
        const initial = initialLedgerPeriod(sorted, currentAccountingPeriod, Boolean(closingReport));
        setPeriods(sorted);
        setAccounts(list);
        setIndentStyle(settings.accountStructure.indentStyle);
        setFrom(initial);
        setTo(initial);
        setAccountCode(list[0]?.code ?? "");
      }).catch((error: unknown) => { if (active) setMessage(`读取账簿设置失败：${error instanceof Error ? error.message : String(error)}`); });
    return () => { active = false; };
  }, [kind, cashierJournal, closingReport, shellState]);

  const eligible = useMemo(() => kind === "general" || kind === "journal" ? accounts.filter((account) => account.level === 1) : accounts, [accounts, kind]);
  const table = result ? closingReport === "account-summary" ? accountSummaryTable(result, indentStyle) : ledgerTable(result, indentStyle) : null;
  const search = async (): Promise<void> => {
    const selectedAccountCode = cashierJournal ? cashierJournals[cashierJournal].accountCode : accountCode;
    if (!from || (!closingReport && !to) || (kind !== "trial-balance" && !selectedAccountCode)) {
      setMessage(cashierJournal || kind === "trial-balance" ? "请选择会计期间。" : "请选择会计期间和科目。");
      return;
    }
    const query: LedgerQuery = { kind, ...ledgerPeriodRange(from, to, Boolean(closingReport)), accountCode: selectedAccountCode,
      rootsOnly: closingReport === "account-summary" ? !showSummaryDetails : rootsOnly, cashierJournal, closingReport };
    setBusy(true);
    setMessage("");
    setResult(null);
    setQueried(null);
    try {
      const data = await window.openAccountancy.queryLedger(query);
      setResult(data);
      setQueried(query);
    } catch (error) {
      setMessage(`查询失败：${error instanceof Error ? error.message : String(error)}`);
    } finally { setBusy(false); }
  };
  const exportResult = async (format: LedgerExportFormat): Promise<void> => {
    if (!queried) return;
    setBusy(true);
    try {
      const output = await window.openAccountancy.exportLedger(queried, format);
      setMessage(output.message);
    } catch (error) {
      setMessage(`导出失败：${error instanceof Error ? error.message : String(error)}`);
    } finally { setBusy(false); }
  };

  return (
    <section className="panel ledger-page">
      <h2>{closingReport === "account-summary" ? "科目汇总表" : closingReport === "trial-balance" ? "试算平衡表" : cashierJournal ? cashierJournals[cashierJournal].title : titles[kind]}</h2>
      <p>仅统计已记账凭证；账套启用期以前的余额按零计算。</p>
      <div className="ledger-filters">
        <label>{closingReport ? "会计期间" : "起始期间"}<select value={from} onChange={(event) => setFrom(event.target.value)}><option value="">请选择</option>{periods.map((period) =>
          <option key={key(period.year, period.periodNo)} value={key(period.year, period.periodNo)}>{label(period)}</option>)}</select></label>
        {!closingReport && <label>结束期间<select value={to} onChange={(event) => setTo(event.target.value)}><option value="">请选择</option>{periods.map((period) =>
          <option key={key(period.year, period.periodNo)} value={key(period.year, period.periodNo)}>{label(period)}</option>)}</select></label>}
        {!cashierJournal && (closingReport === "account-summary" ? <label><input type="checkbox" checked={showSummaryDetails} onChange={(event) => setShowSummaryDetails(event.target.checked)} />显示明细科目</label> : kind !== "trial-balance" ? <label>科目<select value={accountCode} onChange={(event) => setAccountCode(event.target.value)}>
          <option value="">请选择</option>{eligible.map((account) => <option key={account.code} value={account.code}>{account.code} {account.name}</option>)}
        </select></label> : <label><input type="checkbox" checked={rootsOnly} onChange={(event) => setRootsOnly(event.target.checked)} />仅显示总账科目</label>)}
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void search()}>查询</button>
      </div>
      {message ? <p role="status">{message} {message.includes("映射") ? <Link to="/app/ledger/accounts">前往科目表</Link> : null}</p> : null}
      {result && table ? <>
        <div className="auth-actions">{(["pdf", "xlsx", "csv"] as const).map((format) =>
          <button key={format} type="button" className="btn" disabled={busy} onClick={() => void exportResult(format)}>导出 {format.toUpperCase()}</button>)}</div>
        {!cashierJournal && <p>{closingReport === "account-summary" ? "各栏合计仅统计本栏总账科目；两栏合计相加为全部总账科目的发生额。" : result.account ? `${result.account.code} ${result.account.name}` : queried?.rootsOnly ? "仅总账科目" : "全部科目（合计仅统计总账科目）"}</p>}
        <div className="voucher-result-scroll"><table className={`voucher-result-table ledger-table${result.kind === "trial-balance" ? " ledger-trial-balance-table" : ""}`}>
          <LedgerTableHeader rows={table.headerRows} />
          <LedgerTableBody table={table} kind={result.kind} />
        </table></div>
      </> : null}
    </section>
  );
}
