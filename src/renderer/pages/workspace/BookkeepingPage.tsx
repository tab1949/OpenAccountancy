import { useEffect, useState } from "react";
import type { VoucherRecord } from "@common/contracts";

function money(value: number): string {
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function BookkeepingPage(): JSX.Element {
  const [vouchers, setVouchers] = useState<VoucherRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);

  const refresh = async (): Promise<void> => {
    setLoading(true);
    try {
      const records = await window.openAccountancy.searchVouchers({ status: "draft" });
      setVouchers(records);
      setSelectedIds((current) => current.filter((id) => records.some((voucher) => voucher.voucherId === id)));
    } catch (error) {
      setMessage(`读取凭证失败：${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const toggle = (id: number): void => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const toggleAll = (): void => {
    setSelectedIds(selectedIds.length === vouchers.length ? [] : vouchers.map((voucher) => voucher.voucherId));
  };

  const postSelected = async (): Promise<void> => {
    if (!selectedIds.length) return;
    setPosting(true);
    setMessage("");
    try {
      const result = await window.openAccountancy.postVouchers({ voucherIds: selectedIds });
      setMessage(result.message);
      if (result.ok) {
        setSelectedIds([]);
        await refresh();
      }
    } finally {
      setPosting(false);
    }
  };

  return (
    <section className="voucher-query-page">
      <div className="panel voucher-bookkeeping-toolbar">
        <div><h2>待记账凭证</h2><p>选择已平衡且未记账的凭证，可直接执行记账，无需审批。</p></div>
        <div className="auth-actions">
          <button type="button" className="btn" disabled={loading} onClick={() => void refresh()}>刷新</button>
          <button type="button" className="btn btn-primary" disabled={posting || selectedIds.length === 0} onClick={() => void postSelected()}>
            {posting ? "记账中..." : `记账（${selectedIds.length}）`}
          </button>
        </div>
      </div>
      {message ? <p className="auth-hint">{message}</p> : null}
      <div className="panel voucher-results-panel">
        <div className="voucher-result-scroll">
          <table className="voucher-result-table">
            <thead>
              <tr>
                <th><input type="checkbox" aria-label="全选待记账凭证" checked={vouchers.length > 0 && selectedIds.length === vouchers.length} onChange={toggleAll} /></th>
                <th>日期</th>
                <th>凭证号</th>
                <th>摘要</th>
                <th>借方合计</th>
                <th>贷方合计</th>
                <th>附件</th>
              </tr>
            </thead>
            <tbody>
              {vouchers.map((voucher) => (
                <tr key={voucher.voucherId}>
                  <td><input type="checkbox" aria-label={`选择凭证 ${voucher.voucherNo}`} checked={selectedIds.includes(voucher.voucherId)} onChange={() => toggle(voucher.voucherId)} /></td>
                  <td>{voucher.voucherDate}</td>
                  <td>{voucher.voucherNo}</td>
                  <td>{voucher.lines.find((line) => line.summary)?.summary ?? ""}</td>
                  <td>{money(voucher.amount)}</td>
                  <td>{money(voucher.amount)}</td>
                  <td>{voucher.attachments.length}</td>
                </tr>
              ))}
              {vouchers.length === 0 && !loading ? <tr><td colSpan={7} className="voucher-empty-state">暂无待记账凭证</td></tr> : null}
              {loading ? <tr><td colSpan={7} className="voucher-empty-state">正在读取...</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
