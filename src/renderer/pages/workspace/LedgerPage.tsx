import { useEffect, useMemo, useState } from "react";
import type { ReactElement } from "react";
import { Link, useOutletContext } from "react-router-dom";
import { ledgerTable } from "../../../common/ledgerTable";
import type { ChartAccount, FiscalPeriodSetting, LedgerExportFormat, LedgerKind, LedgerQuery, LedgerResult } from "../../../common/contracts";
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

export function LedgerPage({ kind }: { kind: LedgerKind }): ReactElement {
  const { currentAccountingPeriod } = useCurrentAccountingPeriod();
  const { shellState } = useOutletContext<ShellContextState>();
  const [periods, setPeriods] = useState<FiscalPeriodSetting[]>([]);
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [accountCode, setAccountCode] = useState("");
  const [rootsOnly, setRootsOnly] = useState(false);
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
        const current = currentAccountingPeriod && sorted.find((period) => period.year === currentAccountingPeriod.year && period.periodNo === currentAccountingPeriod.periodNo);
        const initial = current ?? sorted[0];
        setPeriods(sorted);
        setAccounts(list);
        setFrom(initial ? key(initial.year, initial.periodNo) : "");
        setTo(initial ? key(initial.year, initial.periodNo) : "");
        setAccountCode(list[0]?.code ?? "");
      }).catch((error: unknown) => { if (active) setMessage(`读取账簿设置失败：${error instanceof Error ? error.message : String(error)}`); });
    return () => { active = false; };
  }, [kind, shellState]);

  const eligible = useMemo(() => kind === "general" || kind === "journal" ? accounts.filter((account) => account.level === 1) : accounts, [accounts, kind]);
  const table = result ? ledgerTable(result) : null;
  const search = async (): Promise<void> => {
    if (!from || !to || (kind !== "trial-balance" && !accountCode)) {
      setMessage("请选择会计期间和科目。");
      return;
    }
    const query: LedgerQuery = { kind, from: parseKey(from), to: parseKey(to), accountCode, rootsOnly };
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
      <h2>{titles[kind]}</h2>
      <p>仅统计已记账凭证；账套启用期以前的余额按零计算。</p>
      <div className="ledger-filters">
        <label>起始期间<select value={from} onChange={(event) => setFrom(event.target.value)}><option value="">请选择</option>{periods.map((period) =>
          <option key={key(period.year, period.periodNo)} value={key(period.year, period.periodNo)}>{label(period)}</option>)}</select></label>
        <label>结束期间<select value={to} onChange={(event) => setTo(event.target.value)}><option value="">请选择</option>{periods.map((period) =>
          <option key={key(period.year, period.periodNo)} value={key(period.year, period.periodNo)}>{label(period)}</option>)}</select></label>
        {kind !== "trial-balance" ? <label>科目<select value={accountCode} onChange={(event) => setAccountCode(event.target.value)}>
          <option value="">请选择</option>{eligible.map((account) => <option key={account.code} value={account.code}>{account.code} {account.name}</option>)}
        </select></label> : <label><input type="checkbox" checked={rootsOnly} onChange={(event) => setRootsOnly(event.target.checked)} />仅显示总账科目</label>}
        <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void search()}>查询</button>
      </div>
      {message ? <p role="status">{message} {message.includes("映射") ? <Link to="/app/ledger/accounts">前往科目表</Link> : null}</p> : null}
      {result && table ? <>
        <div className="auth-actions">{(["pdf", "xlsx", "csv"] as const).map((format) =>
          <button key={format} type="button" className="btn" disabled={busy} onClick={() => void exportResult(format)}>导出 {format.toUpperCase()}</button>)}</div>
        <p>{result.account ? `${result.account.code} ${result.account.name}` : queried?.rootsOnly ? "仅总账科目" : "全部科目（合计仅统计总账科目）"}</p>
        <div className="voucher-result-scroll"><table className={`voucher-result-table${result.kind === "trial-balance" ? " ledger-trial-balance-table" : ""}`}>
          <LedgerTableHeader rows={table.headerRows} />
          <LedgerTableBody table={table} kind={result.kind} />
        </table></div>
      </> : null}
    </section>
  );
}
