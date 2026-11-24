import { useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import { Link, useLocation, useOutletContext } from "react-router-dom";
import type {
  CarryForwardAccount,
  CarryForwardBalanceRow,
  CarryForwardKind,
  FiscalPeriodSetting
} from "../../../common/contracts";
import { useCurrentAccountingPeriod } from "../../CurrentAccountingPeriodContext";
import type { ShellContextState } from "../types";
import { DEFAULT_ACCOUNT_INDENT, indentAccount } from "../../../common/accountIndent";

const titles: Record<CarryForwardKind, string> = {
  custom: "自定义结转",
  cogs: "销售成本结转",
  "profit-loss": "期间损益结转"
};

function periodKey(period: Pick<FiscalPeriodSetting, "year" | "periodNo">): string {
  return `${period.year}:${period.periodNo}`;
}

function parsePeriodKey(value: string): { year: number; periodNo: number } {
  const [year, periodNo] = value.split(":").map(Number);
  return { year: year!, periodNo: periodNo! };
}

function periodLabel(period: FiscalPeriodSetting): string {
  return `${String(period.year).padStart(4, "0")}年${String(period.periodNo).padStart(2, "0")}期`;
}

function balanceLabel(balance: number): string {
  if (!balance) return "0.00";
  return `${Math.abs(balance).toFixed(2)} ${balance > 0 ? "借" : "贷"}`;
}

export function CarryForwardPage(): JSX.Element {
  const { currentAccountingPeriod } = useCurrentAccountingPeriod();
  const { shellState } = useOutletContext<ShellContextState>();
  const location = useLocation();
  const kind: CarryForwardKind = location.pathname.endsWith("/carry-cogs")
    ? "cogs"
    : location.pathname.endsWith("/carry-pl") ? "profit-loss" : "custom";
  const [periods, setPeriods] = useState<FiscalPeriodSetting[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const [accounts, setAccounts] = useState<CarryForwardAccount[]>([]);
  const [indentStyle, setIndentStyle] = useState(DEFAULT_ACCOUNT_INDENT);
  const [sourceAccountCode, setSourceAccountCode] = useState("");
  const [targetAccountCode, setTargetAccountCode] = useState("");
  const [sourceRowIds, setSourceRowIds] = useState<string[]>([]);
  const [targetRowId, setTargetRowId] = useState("");
  const [summary, setSummary] = useState(titles[kind]);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const sourceCandidates = useMemo(() => accounts.filter((account) =>
    kind === "cogs" ? account.category === "资产" :
      kind === "profit-loss" ? account.category === "损益" : true
  ), [accounts, kind]);
  const targetCandidates = useMemo(() => accounts.filter((account) =>
    kind === "cogs" ? account.category === "损益" :
      kind === "profit-loss" ? account.category === "所有者权益" : true
  ), [accounts, kind]);
  const sourceAccount = sourceCandidates.find((account) => account.code === sourceAccountCode);
  const targetAccount = targetCandidates.find((account) => account.code === targetAccountCode);
  const visibleSourceRows = kind === "custom"
    ? sourceAccount?.rows ?? []
    : sourceCandidates.flatMap((account) => account.rows);
  const visibleTargetRows = targetAccount?.rows ?? [];
  const sourceRowsById = useMemo(() => new Map(
    sourceCandidates.flatMap((account) => account.rows.map((row) => [row.id, row] as const))
  ), [sourceCandidates]);
  const selectedSourceRows = sourceRowIds.map((id) => sourceRowsById.get(id)).filter((row): row is CarryForwardBalanceRow => Boolean(row));
  const selectedNet = selectedSourceRows.reduce((total, row) => total + row.balance, 0);

  useEffect(() => {
    let active = true;
    setPeriods([]);
    setAccounts([]);
    setSelectedPeriod("");
    setSourceAccountCode("");
    setTargetAccountCode("");
    setSourceRowIds([]);
    setTargetRowId("");
    setSummary(titles[kind]);
    setMessage("");
    void window.openAccountancy.getBooksetSettings().then((settings) => {
      if (!active) return;
      if (!settings) throw new Error("请先打开账套。");
      setIndentStyle(settings.accountStructure.indentStyle);
      const sorted = [...settings.periods.items].sort((a, b) => a.startDate.localeCompare(b.startDate));
      const current = currentAccountingPeriod && sorted.find((period) =>
        period.year === currentAccountingPeriod.year && period.periodNo === currentAccountingPeriod.periodNo
      );
      const initial = current?.status === "open"
        ? current
        : [...sorted].reverse().find((period) => period.status === "open" && (!current || period.startDate <= current.startDate));
      setPeriods(sorted);
      if (initial) setSelectedPeriod(periodKey(initial));
      else setMessage("当前账套没有可结转的未结账期间。");
    }).catch((error: unknown) => {
      if (active) setMessage(`读取账套设置失败：${error instanceof Error ? error.message : String(error)}`);
    });
    return () => { active = false; };
  }, [kind, currentAccountingPeriod, shellState]);

  useEffect(() => {
    if (!selectedPeriod) return;
    let active = true;
    const { year, periodNo } = parsePeriodKey(selectedPeriod);
    setAccounts([]);
    setSourceAccountCode("");
    setTargetAccountCode("");
    setSourceRowIds([]);
    setTargetRowId("");
    setMessage("");
    void window.openAccountancy.getCarryForwardAccounts(year, periodNo).then((result) => {
      if (!active) return;
      const eligibleSources = result.accounts.filter((account) =>
        kind === "cogs" ? account.category === "资产" :
          kind === "profit-loss" ? account.category === "损益" : true
      );
      const eligibleTargets = result.accounts.filter((account) =>
        kind === "cogs" ? account.category === "损益" :
          kind === "profit-loss" ? account.category === "所有者权益" : true
      );
      setAccounts(result.accounts);
      setSourceAccountCode(eligibleSources[0]?.code ?? "");
      setTargetAccountCode(eligibleTargets[0]?.code ?? "");
    }).catch((error: unknown) => {
      if (active) setMessage(`读取科目余额失败：${error instanceof Error ? error.message : String(error)}`);
    });
    return () => { active = false; };
  }, [kind, selectedPeriod]);

  const selectablePeriods = periods.filter((period) => {
    if (period.status === "closed") return false;
    if (!currentAccountingPeriod) return true;
    return period.startDate <= currentAccountingPeriod.startDate;
  });

  const selectSourceRow = (row: CarryForwardBalanceRow, checked: boolean): void => {
    setSourceRowIds((current) => {
      if (!checked) return current.filter((id) => id !== row.id);
      const sameAccountRows = visibleSourceRows.filter((item) => item.rootCode === row.rootCode);
      const removeIds = row.isTotal
        ? sameAccountRows.filter((item) => !item.isTotal).map((item) => item.id)
        : sameAccountRows.filter((item) => item.isTotal).map((item) => item.id);
      return [...current.filter((id) => id !== row.id && !removeIds.includes(id)), row.id];
    });
  };

  const submit = async (): Promise<void> => {
    if (!selectedPeriod || !sourceRowIds.length || !targetRowId) {
      setMessage("请选择结转期间、至少一条来源明细和一条承接科目。");
      return;
    }
    if (!summary.trim()) {
      setMessage("凭证摘要不能为空。");
      return;
    }
    setBusy(true);
    setMessage("");
    try {
      const { year, periodNo } = parsePeriodKey(selectedPeriod);
      const result = await window.openAccountancy.generateCarryForwardVouchers({
        kind,
        year,
        periodNo,
        sourceRowIds,
        targetRowId,
        summary: summary.trim()
      });
      setMessage(result.message);
      if (result.ok) {
        setShowConfirmation(false);
        setSourceRowIds([]);
        setTargetRowId("");
      }
    } catch (error) {
      setMessage(`生成结转凭证失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setBusy(false);
    }
  };

  const accountLabel = (account: CarryForwardAccount): string => `${account.code} ${account.name}`;
  const renderRows = (rows: CarryForwardBalanceRow[], side: "source" | "target"): JSX.Element => (
    <div className="carry-table-scroll">
      <table className="carry-table">
        <thead><tr><th>选择</th>{kind !== "custom" && side === "source" ? <th>总账科目</th> : null}<th>明细 / 余额</th><th>期末余额</th></tr></thead>
        <tbody>
          {rows.map((row) => {
            const checked = side === "source" ? sourceRowIds.includes(row.id) : targetRowId === row.id;
            const disabled = side === "source" && row.balance === 0;
            const root = accounts.find((account) => account.code === row.rootCode);
            return (
              <tr key={row.id} className={row.isTotal ? "carry-total-row" : undefined}>
                <td><input
                  type="checkbox"
                  aria-label={`${side === "source" ? "来源" : "承接"} ${row.rootName} ${row.detail || "期末余额"}`}
                  checked={checked}
                  disabled={disabled}
                  onChange={(event) => {
                    if (side === "source") selectSourceRow(row, event.target.checked);
                    else setTargetRowId(event.target.checked ? row.id : "");
                  }}
                /></td>
                {kind !== "custom" && side === "source" ? <td>{root ? accountLabel(root) : row.rootName}</td> : null}
                <td style={{ whiteSpace: "pre-wrap" }}>{row.isTotal ? "期末余额" : indentAccount(row.detail, row.level, indentStyle)}</td>
                <td>{balanceLabel(row.balance)}</td>
              </tr>
            );
          })}
          {!rows.length ? <tr><td colSpan={kind !== "custom" && side === "source" ? 4 : 3}>{side === "source" && kind !== "custom" ? "当前没有符合条件的科目。" : "请选择科目。"}</td></tr> : null}
        </tbody>
      </table>
    </div>
  );

  return (
    <section className="panel carry-forward-page">
      <h2>{titles[kind]}</h2>
      <div className="carry-filters">
        <label>结转期间
          <select value={selectedPeriod} onChange={(event) => setSelectedPeriod(event.target.value)}>
            <option value="">请选择期间</option>
            {periods.map((period) => (
              <option key={periodKey(period)} value={periodKey(period)} disabled={!selectablePeriods.includes(period)}>
                {periodLabel(period)}{period.status === "closed" ? "（已结账）" : ""}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="carry-help">
        仅统计已记账凭证。来源按期末余额冲销；右侧选择承接科目，系统按所选来源余额自动计算对应金额。每张凭证最多 11 行，超过时自动拆分。
      </p>
      {message ? <p role="status">{message}{message.includes("映射") ? <> <Link to="/app/ledger/accounts">前往科目表</Link></> : null}</p> : null}
      {selectedPeriod && accounts.length ? (
        <div className="carry-direction-layout">
          <section className="carry-side">
            <div className="carry-side-heading">
              <h3>来源科目</h3>
              {kind !== "custom"
                ? <span>{kind === "cogs" ? "全部资产类科目" : "全部损益类科目"}</span>
                : <label>选择科目
                  <select value={sourceAccountCode} onChange={(event) => {
                    setSourceAccountCode(event.target.value);
                    setSourceRowIds([]);
                  }}>
                    {sourceCandidates.map((account) => <option key={account.code} value={account.code}>{accountLabel(account)}</option>)}
                  </select>
                </label>}
            </div>
            {renderRows(visibleSourceRows, "source")}
            <p className="carry-selection-total">已选来源：{selectedSourceRows.length} 项，净额 {balanceLabel(selectedNet)}</p>
          </section>
          <div className="carry-direction-arrow" aria-label="从左向右结转">→</div>
          <section className="carry-side">
            <div className="carry-side-heading">
              <h3>承接科目</h3>
              <label>选择科目
                <select value={targetAccountCode} onChange={(event) => {
                  setTargetAccountCode(event.target.value);
                  setTargetRowId("");
                }}>
                  {targetCandidates.map((account) => <option key={account.code} value={account.code}>{accountLabel(account)}</option>)}
                </select>
              </label>
            </div>
            {renderRows(visibleTargetRows, "target")}
            <p className="carry-selection-total">{targetRowId ? "已选择承接科目" : "请选择一个承接科目"}</p>
          </section>
        </div>
      ) : null}
      <div className="carry-actions">
        <button type="button" className="btn btn-primary" disabled={busy || !sourceRowIds.length || !targetRowId} onClick={() => {
          setSummary(titles[kind]);
          setShowConfirmation(true);
        }}>确定</button>
      </div>
      {showConfirmation ? (
        <div className="modal-backdrop" role="presentation">
          <section className="modal-card modal-card-narrow carry-confirmation" role="dialog" aria-modal="true" aria-labelledby="carry-confirmation-title">
            <h3 id="carry-confirmation-title">是否确认当前结转操作？确认后将生成相应凭证。</h3>
            <label>凭证摘要
              <input value={summary} onChange={(event) => setSummary(event.target.value)} autoFocus />
            </label>
            {message ? <p role="status">{message}</p> : null}
            <div className="modal-actions">
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void submit()}>确认</button>
              <button type="button" className="btn" disabled={busy} onClick={() => setShowConfirmation(false)}>取消</button>
            </div>
          </section>
        </div>
      ) : null}
    </section>
  );
}
