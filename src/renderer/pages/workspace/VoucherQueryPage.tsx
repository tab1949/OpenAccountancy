import { useEffect, useMemo, useState } from "react";
import type { VoucherRecord, VoucherSearchPayload } from "@common/contracts";
import { VoucherEditor } from "./VoucherEditor";

type DatePreset = "custom" | "month" | "3days" | "7days" | "30days" | "90days" | "lastWeek" | "lastMonth";
type SortKey = "voucherDate" | "voucherNo" | "amount";

function dateOnly(date: Date): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function getPresetRange(preset: Exclude<DatePreset, "custom">): { from: string; to: string } {
  const today = new Date();
  const end = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  let start = new Date(end);

  if (preset === "month") start = new Date(end.getFullYear(), end.getMonth(), 1);
  if (preset === "3days") start.setDate(end.getDate() - 2);
  if (preset === "7days") start.setDate(end.getDate() - 6);
  if (preset === "30days") start.setDate(end.getDate() - 29);
  if (preset === "90days") start.setDate(end.getDate() - 89);
  if (preset === "lastWeek") {
    const daysSinceMonday = (end.getDay() + 6) % 7;
    start.setDate(end.getDate() - daysSinceMonday - 7);
    end.setDate(end.getDate() - daysSinceMonday - 1);
  }
  if (preset === "lastMonth") {
    start = new Date(end.getFullYear(), end.getMonth() - 1, 1);
    end.setDate(0);
  }

  return { from: dateOnly(start), to: dateOnly(end) };
}

function amountText(value: number): string {
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function VoucherQueryPage(): JSX.Element {
  const [records, setRecords] = useState<VoucherRecord[]>([]);
  const [datePreset, setDatePreset] = useState<DatePreset>("month");
  const [dateFrom, setDateFrom] = useState(() => getPresetRange("month").from);
  const [dateTo, setDateTo] = useState(() => getPresetRange("month").to);
  const [month, setMonth] = useState("");
  const [voucherNoFrom, setVoucherNoFrom] = useState("");
  const [voucherNoTo, setVoucherNoTo] = useState("");
  const [keyword, setKeyword] = useState("");
  const [selected, setSelected] = useState<VoucherRecord | null>(null);
  const [editing, setEditing] = useState<VoucherRecord | null>(null);
  const [message, setMessage] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("voucherDate");
  const [sortAscending, setSortAscending] = useState(false);
  const [searching, setSearching] = useState(false);
  const [unposting, setUnposting] = useState(false);

  const search = async (): Promise<boolean> => {
    setSearching(true);
    setMessage("");
    try {
      const filters: VoucherSearchPayload = {
        dateFrom: month ? undefined : dateFrom || undefined,
        dateTo: month ? undefined : dateTo || undefined,
        month: month || undefined,
        voucherNoFrom: voucherNoFrom ? Number(voucherNoFrom) : undefined,
        voucherNoTo: voucherNoTo ? Number(voucherNoTo) : undefined,
        keyword: keyword.trim() || undefined
      };
      setRecords(await window.openAccountancy.searchVouchers(filters));
      return true;
    } catch (error) {
      setMessage(`查询失败：${(error as Error).message}`);
      return false;
    } finally {
      setSearching(false);
    }
  };

  useEffect(() => {
    void search();
  }, []);

  const sortedRecords = useMemo(() => [...records].sort((a, b) => {
    let result = 0;
    if (sortKey === "voucherDate") result = a.voucherDate.localeCompare(b.voucherDate);
    if (sortKey === "voucherNo") result = a.voucherNo - b.voucherNo;
    if (sortKey === "amount") result = a.amount - b.amount;
    return sortAscending ? result : -result;
  }), [records, sortAscending, sortKey]);

  const updatePreset = (preset: DatePreset): void => {
    setDatePreset(preset);
    if (preset !== "custom") {
      const range = getPresetRange(preset);
      setDateFrom(range.from);
      setDateTo(range.to);
    }
  };

  const startEdit = (record: VoucherRecord): void => {
    if (record.periodClosed) {
      window.alert("该账期已结账，无法修改");
      return;
    }
    setSelected(null);
    setEditing(record);
  };

  const remove = async (record: VoucherRecord): Promise<void> => {
    if (record.periodClosed) {
      window.alert("该账期已结账，无法删除");
      return;
    }

    let confirmUnpost = false;
    const isPast = record.isPastPeriod;
    if (record.status === "posted" && isPast) {
      confirmUnpost = window.confirm("您正在尝试反记账，确认则表示您知晓相关风险，并删除该凭证。删除该凭证后关联的账目将会自动重新计算。");
    } else {
      confirmUnpost = window.confirm("您确认删除该凭证吗？");
    }
    if (!confirmUnpost) return;

    const result = await window.openAccountancy.deleteVoucher(record.voucherId, record.status === "posted" && isPast);
    setMessage(result.message);
    if (result.ok) {
      setSelected(null);
      if (!await search()) {
        setMessage(`${result.message} 但查询结果刷新失败，请手动重新查询。`);
        return;
      }
    }
  };

  const unpost = async (record: VoucherRecord): Promise<void> => {
    if (record.periodClosed) {
      setMessage("该账期已结账，无法撤销记账。");
      return;
    }
    if (!window.confirm(`警告：确认撤销 ${record.voucherDate} 第 ${record.voucherNo} 号凭证的记账？凭证将变为未记账，相关账簿及余额将重新计算。`)) return;
    setUnposting(true);
    setMessage("");
    try {
      const result = await window.openAccountancy.unpostVouchers({ voucherIds: [record.voucherId] });
      if (result.ok) {
        setSelected(null);
        await search();
      }
      setMessage(result.message);
    } catch (error) {
      setMessage(`撤销记账失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setUnposting(false);
    }
  };

  const chooseSort = (key: SortKey): void => {
    if (sortKey === key) setSortAscending((current) => !current);
    else {
      setSortKey(key);
      setSortAscending(true);
    }
  };

  const refreshSelected = async (): Promise<void> => {
    if (!selected) return;
    const refreshed = await window.openAccountancy.getVoucher(selected.voucherId);
    setSelected(refreshed);
  };

  if (editing) {
    return (
      <VoucherEditor
        voucher={editing}
        onCancel={() => setEditing(null)}
        onSaved={async () => {
          setEditing(null);
          await search();
        }}
      />
    );
  }

  return (
    <section className="voucher-query-page">
      <div className="panel voucher-filter-panel">
        <div className="voucher-filter-grid">
          <label>
            时间范围
            <select value={datePreset} onChange={(event) => updatePreset(event.target.value as DatePreset)}>
              <option value="month">本月</option>
              <option value="3days">近3天</option>
              <option value="7days">近7天</option>
              <option value="30days">近30日</option>
              <option value="90days">近90日</option>
              <option value="lastWeek">上周</option>
              <option value="lastMonth">上月</option>
              <option value="custom">自定义</option>
            </select>
          </label>
          <label>开始日期<input type="date" value={dateFrom} onChange={(event) => { setDatePreset("custom"); setDateFrom(event.target.value); }} /></label>
          <label>结束日期<input type="date" value={dateTo} onChange={(event) => { setDatePreset("custom"); setDateTo(event.target.value); }} /></label>
          <label>凭证月份<input type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label>
          <label>凭证号起<input type="number" min="1" value={voucherNoFrom} onChange={(event) => setVoucherNoFrom(event.target.value)} /></label>
          <label>凭证号止<input type="number" min="1" value={voucherNoTo} onChange={(event) => setVoucherNoTo(event.target.value)} /></label>
          <label className="voucher-keyword-field">摘要关键词<input type="search" value={keyword} onChange={(event) => setKeyword(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void search(); }} /></label>
          <button type="button" className="btn btn-primary" disabled={searching} onClick={() => void search()}>{searching ? "查询中..." : "查询"}</button>
        </div>
      </div>

      {message ? <p className="auth-hint">{message}</p> : null}

      <div className="panel voucher-results-panel">
        <div className="voucher-results-heading"><h2>查询结果</h2><span>{records.length} 张</span></div>
        <div className="voucher-result-scroll">
          <table className="voucher-result-table">
            <thead>
              <tr>
                <th><button type="button" onClick={() => chooseSort("voucherDate")}>日期{sortKey === "voucherDate" ? (sortAscending ? " ↑" : " ↓") : ""}</button></th>
                <th><button type="button" onClick={() => chooseSort("voucherNo")}>凭证号{sortKey === "voucherNo" ? (sortAscending ? " ↑" : " ↓") : ""}</button></th>
                <th><button type="button" onClick={() => chooseSort("amount")}>金额{sortKey === "amount" ? (sortAscending ? " ↑" : " ↓") : ""}</button></th>
                <th>状态</th>
                <th>详情</th>
              </tr>
            </thead>
            <tbody>
              {sortedRecords.map((record) => (
                <tr key={record.voucherId}>
                  <td>{record.voucherDate}</td>
                  <td>{record.voucherNo}</td>
                  <td>{amountText(record.amount)}</td>
                  <td>{record.status === "posted" ? "已记账" : "未记账"}</td>
                  <td><button type="button" className="link-button" onClick={() => setSelected(record)}>查看</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {selected ? (
        <div className="modal-backdrop" role="presentation" onClick={() => { if (!unposting) setSelected(null); }}>
          <div className="modal-card voucher-detail-modal" role="dialog" aria-modal="true" aria-label="凭证详情" onClick={(event) => event.stopPropagation()}>
            <header className="voucher-detail-heading">
              <div><h2>记账凭证</h2><p>{selected.voucherDate}　编号：{selected.voucherNo}　附件：共{selected.attachments.length}张</p></div>
              <span>{selected.status === "posted" ? "已记账" : "未记账"}</span>
            </header>
            <div className="voucher-table-scroll">
              <table className="voucher-entry-table voucher-readonly-table">
                <thead><tr><th>行</th><th>摘要</th><th>总账科目</th><th>明细科目</th><th>借方发生额</th><th>贷方发生额</th></tr></thead>
                <tbody>
                  {selected.lines.filter((line) => line.summary || line.accountCode || line.debit || line.credit).map((line) => (
                    <tr key={line.lineNo}><td>{line.lineNo}</td><td>{line.summary}</td><td>{line.accountCode} {line.accountName}</td><td>{line.detail}</td><td>{line.debit ? amountText(line.debit) : ""}</td><td>{line.credit ? amountText(line.credit) : ""}</td></tr>
                  ))}
                </tbody>
                <tfoot><tr><th colSpan={4}>合计</th><th>{amountText(selected.amount)}</th><th>{amountText(selected.amount)}</th></tr></tfoot>
              </table>
            </div>
            {selected.attachments.length ? <ul className="voucher-attachment-list">{selected.attachments.map((file) => <li key={file.filePath}>{file.fileName}</li>)}</ul> : null}
            {message ? <p className="auth-hint">{message}</p> : null}
            <div className="modal-actions">
              {selected.status === "posted" ? <button type="button" className="btn" disabled={selected.periodClosed || unposting} onClick={() => void unpost(selected)}>{unposting ? "撤销中..." : "撤销记账"}</button> : null}
              <button type="button" className="btn btn-primary" disabled={selected.periodClosed || unposting} onClick={() => startEdit(selected)}>编辑</button>
              <button type="button" className="btn btn-danger" disabled={selected.periodClosed || unposting} onClick={() => void remove(selected)}>删除</button>
              <button type="button" className="btn" disabled={unposting} onClick={() => void refreshSelected()}>刷新</button>
              <button type="button" className="btn" disabled={unposting} onClick={() => setSelected(null)}>关闭</button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
