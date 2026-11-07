import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { useOutletContext } from "react-router-dom";
import type { ChartAccount, ChartAccountInput, UnmappedDetail, VoucherRecord } from "../../../common/contracts";
import { ChartAccountEditor } from "../../components/ChartAccountEditor";
import type { ShellContextState } from "../types";

function money(value: number): string {
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function BookkeepingPage(): ReactElement {
  const { shellState } = useOutletContext<ShellContextState>();
  const [vouchers, setVouchers] = useState<VoucherRecord[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [postedVouchers, setPostedVouchers] = useState<VoucherRecord[]>([]);
  const [selectedPostedIds, setSelectedPostedIds] = useState<number[]>([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [unposting, setUnposting] = useState(false);
  const [unmapped, setUnmapped] = useState<UnmappedDetail[] | null>(null);
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [standard, setStandard] = useState<"ASBE_2006" | "SBE_2011">("ASBE_2006");
  const [editor, setEditor] = useState<ChartAccountInput | null>(null);
  const [savingAccount, setSavingAccount] = useState(false);

  const refresh = async (): Promise<boolean> => {
    setLoading(true);
    try {
      const [records, posted] = await Promise.all([
        window.openAccountancy.searchVouchers({ status: "draft" }),
        window.openAccountancy.searchVouchers({ status: "posted" })
      ]);
      setVouchers(records);
      setPostedVouchers(posted);
      setSelectedIds((current) => current.filter((id) => records.some((voucher) => voucher.voucherId === id)));
      setSelectedPostedIds((current) => current.filter((id) => posted.some((voucher) => voucher.voucherId === id && !voucher.periodClosed)));
      return true;
    } catch (error) {
      setMessage(`读取凭证失败：${(error as Error).message}`);
      return false;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setVouchers([]);
    setSelectedIds([]);
    setPostedVouchers([]);
    setSelectedPostedIds([]);
    setUnmapped(null);
    setEditor(null);
    void refresh();
  }, [shellState]);

  const toggle = (id: number): void => {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const toggleAll = (): void => {
    setSelectedIds(selectedIds.length === vouchers.length ? [] : vouchers.map((voucher) => voucher.voucherId));
  };

  const unpostSelected = async (): Promise<void> => {
    if (!selectedPostedIds.length) return;
    if (!window.confirm(`警告：确认撤销选中的 ${selectedPostedIds.length} 张凭证的记账？凭证将变为未记账，相关账簿及余额将重新计算。若任一凭证已结账或状态已变化，本次操作将全部取消。`)) return;
    setUnposting(true);
    setMessage("");
    try {
      const result = await window.openAccountancy.unpostVouchers({ voucherIds: selectedPostedIds });
      if (result.ok) {
        setSelectedPostedIds([]);
        if (!await refresh()) {
          setMessage(`${result.message} 但凭证列表刷新失败，请手动刷新。`);
          return;
        }
      }
      setMessage(result.message);
    } catch (error) {
      setMessage(`撤销记账失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setUnposting(false);
    }
  };

  const postSelected = async (): Promise<void> => {
    if (!selectedIds.length) return;
    setPosting(true);
    setMessage("");
    try {
      const eligibleIds = selectedIds.filter((id) => !vouchers.find((voucher) => voucher.voucherId === id)?.periodClosed);
      const unresolved = await window.openAccountancy.listUnmappedDetails(eligibleIds);
      if (unresolved.length) {
        const [list, settings] = await Promise.all([window.openAccountancy.listChartAccounts(), window.openAccountancy.getBooksetSettings()]);
        if (!settings) throw new Error("请先打开账套。");
        setAccounts(list);
        setStandard(settings.identity.accountingStandard);
        setUnmapped(unresolved);
        setMessage("记账前请为新发现的凭证明细新建科目。");
        return;
      }
      const result = await window.openAccountancy.postVouchers({ voucherIds: selectedIds });
      setMessage(result.message);
      if (result.ok) {
        setSelectedIds([]);
        await refresh();
      }
    } catch (error) {
      setMessage(`记账失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setPosting(false);
    }
  };

  const startCreateAccount = (): void => {
    const item = unmapped?.[0];
    if (!item) return;
    const root = accounts.find((account) => account.level === 1 && account.code === item.rootCode);
    if (!root) { setMessage("凭证的总账科目不存在，请刷新后重试。"); return; }
    setEditor({ parentCode: root.code, code: root.code, name: item.detail, category: root.category, direction: "借" });
  };

  const saveAccount = async (): Promise<void> => {
    const item = unmapped?.[0];
    if (!item || !editor || savingAccount) return;
    setSavingAccount(true);
    setMessage("");
    try {
      const result = await window.openAccountancy.createAccountForVoucherDetail(item.rootCode, item.detail, editor);
      setMessage(result.message);
      if (result.ok) {
        setEditor(null);
        const eligibleIds = selectedIds.filter((id) => !vouchers.find((voucher) => voucher.voucherId === id)?.periodClosed);
        try {
          const [remaining, list] = await Promise.all([
            window.openAccountancy.listUnmappedDetails(eligibleIds),
            window.openAccountancy.listChartAccounts()
          ]);
          setAccounts(list);
          setUnmapped(remaining.length ? remaining : null);
          setMessage(remaining.length ? "科目已新建并关联，请继续处理其他新科目。" : "科目已新建并关联，请再次点击记账。");
        } catch (error) {
          setUnmapped(null);
          setMessage(`科目已新建并关联，但刷新失败，请重新点击记账：${error instanceof Error ? error.message : String(error)}`);
        }
      }
    } catch (error) {
      setMessage(`新建科目失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSavingAccount(false);
    }
  };

  return (
    <section className="voucher-query-page">
      <div className="panel voucher-bookkeeping-toolbar">
        <div><h2>待记账凭证</h2><p>选择已平衡且未记账的凭证，可直接执行记账，无需审批。</p></div>
        <div className="auth-actions">
          <button type="button" className="btn" disabled={loading || posting || unposting || Boolean(unmapped)} onClick={() => void refresh()}>刷新</button>
          <button type="button" className="btn btn-primary" disabled={loading || posting || unposting || Boolean(unmapped) || selectedIds.length === 0} onClick={() => void postSelected()}>
            {posting ? "记账中..." : `记账（${selectedIds.length}）`}
          </button>
        </div>
      </div>
      {message ? <p className="auth-hint">{message}</p> : null}
      {unmapped?.length && !editor ? <div className="panel" role="dialog" aria-label="记账前新建科目">
        <p>是否将 {unmapped[0]!.rootName} - {unmapped[0]!.detail} 添加到科目表？（剩余 {unmapped.length} 项）</p>
        <button type="button" className="btn btn-primary" onClick={startCreateAccount}>新建科目</button>
        <button type="button" className="btn" onClick={() => setUnmapped(null)}>取消</button>
      </div> : null}
      {editor && unmapped?.length ? <ChartAccountEditor accounts={accounts.filter((account) => account.code.startsWith(unmapped[0]!.rootCode))}
        standard={standard} value={editor} saving={savingAccount} onChange={setEditor}
        onSave={() => void saveAccount()} onCancel={() => setEditor(null)} /> : null}
      <div className="panel voucher-results-panel">
        <div className="voucher-result-scroll">
          <table className="voucher-result-table">
            <thead>
              <tr>
                <th><input type="checkbox" aria-label="全选待记账凭证" disabled={loading || posting || unposting || Boolean(unmapped)} checked={vouchers.length > 0 && selectedIds.length === vouchers.length} onChange={toggleAll} /></th>
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
                  <td><input type="checkbox" aria-label={`选择凭证 ${voucher.voucherNo}`} disabled={loading || posting || unposting || Boolean(unmapped)} checked={selectedIds.includes(voucher.voucherId)} onChange={() => toggle(voucher.voucherId)} /></td>
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
      <div className="panel voucher-results-panel">
        <div className="voucher-results-heading">
          <div><h2>已记账凭证</h2><p>已结账期间的凭证不能撤销记账。</p></div>
          <button type="button" className="btn" disabled={loading || posting || unposting || Boolean(unmapped) || selectedPostedIds.length === 0} onClick={() => void unpostSelected()}>
            {unposting ? "撤销中..." : `撤销记账（${selectedPostedIds.length}）`}
          </button>
        </div>
        <div className="voucher-result-scroll">
          <table className="voucher-result-table">
            <thead><tr>
              <th><input type="checkbox" aria-label="全选可撤销记账凭证"
                checked={postedVouchers.some((voucher) => !voucher.periodClosed) && postedVouchers.filter((voucher) => !voucher.periodClosed).every((voucher) => selectedPostedIds.includes(voucher.voucherId))}
                disabled={loading || posting || unposting || Boolean(unmapped) || !postedVouchers.some((voucher) => !voucher.periodClosed)}
                onChange={(event) => setSelectedPostedIds(event.target.checked ? postedVouchers.filter((voucher) => !voucher.periodClosed).map((voucher) => voucher.voucherId) : [])} /></th>
              <th>日期</th><th>凭证号</th><th>摘要</th><th>借方合计</th><th>贷方合计</th><th>附件</th><th>期间状态</th>
            </tr></thead>
            <tbody>
              {postedVouchers.map((voucher) => <tr key={voucher.voucherId}>
                <td><input type="checkbox" aria-label={`选择已记账凭证 ${voucher.voucherDate} 第 ${voucher.voucherNo} 号`}
                  disabled={voucher.periodClosed || loading || posting || unposting || Boolean(unmapped)}
                  checked={selectedPostedIds.includes(voucher.voucherId)}
                  onChange={() => setSelectedPostedIds((current) => current.includes(voucher.voucherId) ? current.filter((id) => id !== voucher.voucherId) : [...current, voucher.voucherId])} /></td>
                <td>{voucher.voucherDate}</td><td>{voucher.voucherNo}</td>
                <td>{voucher.lines.find((line) => line.summary)?.summary ?? ""}</td>
                <td>{money(voucher.amount)}</td><td>{money(voucher.amount)}</td><td>{voucher.attachments.length}</td>
                <td>{voucher.periodClosed ? "已结账" : "未结账"}</td>
              </tr>)}
              {postedVouchers.length === 0 ? <tr><td colSpan={8} className="voucher-empty-state">{loading ? "正在读取..." : "暂无已记账凭证"}</td></tr> : null}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
