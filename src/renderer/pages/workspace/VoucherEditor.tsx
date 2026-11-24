import { useEffect, useMemo, useState } from "react";
import type { JSX } from "react";
import { amountToUpper } from "../../../common/amount";
import { detailHierarchySuggestions } from "../../../common/detailHierarchy";
import { voucherSummarySuggestions } from "../../../common/voucherSummaries";
import type {
  ChartAccount,
  UnmappedDetail,
  VoucherAccountOption,
  VoucherAttachmentInput,
  VoucherInput,
  VoucherLineInput,
  VoucherRecord
} from "../../../common/contracts";
import { VoucherAccountDialog } from "../../components/VoucherAccountDialog";

interface VoucherEditorProps {
  voucher?: VoucherRecord;
  onSaved: (voucherId: number) => void;
  onCancel?: () => void;
}

function localToday(): string {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function createEmptyLines(): VoucherLineInput[] {
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

function formatAmount(value: number): string {
  return value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function VoucherEditor({ voucher, onSaved, onCancel }: VoucherEditorProps): JSX.Element {
  const [accounts, setAccounts] = useState<VoucherAccountOption[]>([]);
  const [chartAccounts, setChartAccounts] = useState<ChartAccount[]>([]);
  const [voucherDate, setVoucherDate] = useState(voucher?.voucherDate ?? localToday());
  const [lines, setLines] = useState<VoucherLineInput[]>(voucher?.lines.length === 11 ? voucher.lines : createEmptyLines());
  const [attachments, setAttachments] = useState<VoucherAttachmentInput[]>(voucher?.attachments ?? []);
  const [activeAccountLine, setActiveAccountLine] = useState<number | null>(null);
  const [activeDetailLine, setActiveDetailLine] = useState<number | null>(null);
  const [activeSummaryLine, setActiveSummaryLine] = useState<number | null>(null);
  const [accountSearch, setAccountSearch] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedVoucherId, setSavedVoucherId] = useState<number | null>(null);
  const [newAccounts, setNewAccounts] = useState<{ details: UnmappedDetail[]; accounts: ChartAccount[]; standard: "ASBE_2006" | "SBE_2011" } | null>(null);

  useEffect(() => {
    void Promise.all([window.openAccountancy.listVoucherAccounts(), window.openAccountancy.listChartAccounts()])
      .then(([voucherAccounts, chart]) => { setAccounts(voucherAccounts); setChartAccounts(chart); })
      .catch((error: unknown) => setMessage(`读取科目失败：${error instanceof Error ? error.message : String(error)}`));
  }, []);

  const debitTotal = lines.reduce((total, line) => total + Math.round((line.debit || 0) * 100), 0) / 100;
  const creditTotal = lines.reduce((total, line) => total + Math.round((line.credit || 0) * 100), 0) / 100;
  const populatedCount = lines.filter((line) => line.summary.trim() || line.accountCode || line.detail.trim() || line.debit || line.credit).length;
  const balanced = debitTotal > 0 && Math.round(debitTotal * 100) === Math.round(creditTotal * 100);
  const visibleAccounts = useMemo(() => {
    const keyword = accountSearch.trim().toLocaleLowerCase();
    if (!keyword) return accounts;
    return accounts.filter((account) =>
      account.accountCode.toLocaleLowerCase().includes(keyword) || account.accountName.toLocaleLowerCase().includes(keyword)
    );
  }, [accountSearch, accounts]);

  const updateLine = (lineNo: number, patch: Partial<VoucherLineInput>): void => {
    setLines((current) => current.map((line) => (line.lineNo === lineNo ? { ...line, ...patch } : line)));
  };

  const chooseAccount = (lineNo: number, account: VoucherAccountOption): void => {
    updateLine(lineNo, { accountCode: account.accountCode, accountName: account.accountName, detail: "", detailAccountCode: undefined });
    setAccountSearch("");
    setActiveAccountLine(null);
  };

  const changeAccountSearch = (lineNo: number, value: string): void => {
    setActiveAccountLine(lineNo);
    setAccountSearch(value);
    const match = accounts.find((account) => `${account.accountCode} ${account.accountName}` === value || account.accountCode === value || account.accountName === value);
    updateLine(lineNo, match
      ? { accountCode: match.accountCode, accountName: match.accountName, detail: "", detailAccountCode: undefined }
      : { accountCode: "", accountName: "", detail: "", detailAccountCode: undefined });
  };

  const addAttachments = async (): Promise<void> => {
    try {
      const selected = await window.openAccountancy.pickVoucherAttachments();
      const merged = [...attachments];
      for (const item of selected) {
        if (!merged.some((current) => current.filePath === item.filePath)) merged.push(item);
      }
      setAttachments(merged);
      setMessage("");
    } catch (error) {
      setMessage(`选择附件失败：${(error as Error).message}`);
    }
  };

  const checkNewAccounts = async (voucherId: number): Promise<void> => {
    const details = await window.openAccountancy.listUnmappedDetails([voucherId]);
    if (!details.length) {
      onSaved(voucherId);
      return;
    }
    const [chart, settings] = await Promise.all([
      window.openAccountancy.listChartAccounts(),
      window.openAccountancy.getBooksetSettings()
    ]);
    if (!settings) throw new Error("请先打开账套。");
    setNewAccounts({ details, accounts: chart, standard: settings.identity.accountingStandard });
  };

  const save = async (): Promise<void> => {
    if (saving || savedVoucherId !== null) return;
    setSaving(true);
    setMessage("");
    try {
      if (voucher?.periodClosed) {
        setMessage("该账期已结账，无法修改");
        return;
      }
      let confirmUnpost = false;
      if (voucher?.status === "posted" && voucher.isPastPeriod) {
        confirmUnpost = window.confirm("您正在尝试反记账，确认则表示您知晓相关风险。修改该凭证后关联的账目将会自动重新计算。");
        if (!confirmUnpost) return;
      }

      const payload: VoucherInput = {
        voucherId: voucher?.voucherId,
        voucherDate,
        lines,
        attachments
      };
      const result = await window.openAccountancy.saveVoucher(payload, confirmUnpost);
      setMessage(result.message);
      if (result.ok && result.voucherId) {
        setSavedVoucherId(result.voucherId);
        try {
          await checkNewAccounts(result.voucherId);
        } catch (error) {
          setMessage(`凭证已保存，但检查新科目失败：${error instanceof Error ? error.message : String(error)}。可重试检查或完成后在记账时处理。`);
        }
      }
    } catch (error) {
      setMessage(`保存凭证失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const retryAccountCheck = async (): Promise<void> => {
    if (savedVoucherId === null || saving) return;
    setSaving(true);
    setMessage("");
    try {
      await checkNewAccounts(savedVoucherId);
    } catch (error) {
      setMessage(`凭证已保存，但检查新科目失败：${error instanceof Error ? error.message : String(error)}。可重试检查或完成后在记账时处理。`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="voucher-editor">
      <header className="voucher-editor-header">
        <div>
          <h2>{voucher ? `编辑凭证 ${voucher.voucherNo}` : "填制凭证"}</h2>
          <p>每张凭证固定 11 行；空白行无需填写。</p>
        </div>
        {onCancel && savedVoucherId === null ? <button type="button" className="btn btn-small" disabled={saving} onClick={onCancel}>返回</button> : null}
      </header>

      <fieldset className="voucher-editor-fields" disabled={saving || savedVoucherId !== null}>
      <div className="voucher-meta-row">
        <label>日期<input type="date" value={voucherDate} onChange={(event) => setVoucherDate(event.target.value)} /></label>
        {voucher ? <span>凭证号：{voucher.voucherNo}</span> : <span>凭证号：保存时自动生成</span>}
        <span>附件：{attachments.length} 张</span>
        <button type="button" className="btn btn-small" onClick={() => void addAttachments()}>添加原始凭证</button>
      </div>

      {attachments.length ? (
        <ul className="voucher-attachment-list">
          {attachments.map((item) => (
            <li key={item.filePath}>
              <span>{item.fileName}</span>
              <button type="button" aria-label={`移除 ${item.fileName}`} onClick={() => setAttachments((current) => current.filter((file) => file.filePath !== item.filePath))}>移除</button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="voucher-table-scroll">
        <table className="voucher-entry-table">
          <thead>
            <tr>
              <th>行</th>
              <th>摘要</th>
              <th>总账科目</th>
              <th>明细科目</th>
              <th>借方发生额</th>
              <th>贷方发生额</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => {
              const summaryOptions = voucherSummarySuggestions(lines, line.lineNo);
              const account = accounts.find((item) => item.accountCode === line.accountCode);
              const hierarchical = detailHierarchySuggestions(chartAccounts, line.accountCode, line.detail);
              const detailOptions = /[-－—（(）)]/.test(line.detail)
                ? hierarchical
                : [...new Set([...hierarchical, ...(account?.detailOptions ?? []), ...(account?.detailSuggestions ?? [])])];
              const chartPaths = chartAccounts.filter((item) => item.level > 1 && item.code.startsWith(line.accountCode)).map((item) => {
                const names = [item.name];
                let parent = chartAccounts.find((candidate) => candidate.code === item.parentCode);
                while (parent && parent.level > 1) {
                  names.unshift(parent.name);
                  parent = chartAccounts.find((candidate) => candidate.code === parent!.parentCode);
                }
                return { code: item.code, detail: names.join("-") };
              });
              const codeMatches = line.detail.trim() ? chartPaths.filter((item) => item.code.includes(line.detail.trim())) : [];
              const options = [
                ...detailOptions.flatMap<{ detail: string; code: string | undefined }>((detail) => {
                  const matches = chartPaths.filter((item) => item.detail === detail);
                  return matches.length ? matches.map((item) => ({ detail, code: item.code })) : [{ detail, code: undefined }];
                }),
                ...codeMatches.filter((item) => !detailOptions.includes(item.detail))
              ];
              const canEnterAmount = Boolean(line.summary.trim() && line.accountCode);
              return (
                <tr key={line.lineNo}>
                  <td>{line.lineNo}</td>
                  <td className="voucher-summary-cell" onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget)) setActiveSummaryLine(null);
                  }}>
                    <input aria-label={`第${line.lineNo}行摘要`} value={line.summary}
                      onFocus={() => setActiveSummaryLine(line.lineNo)}
                      onKeyDown={(event) => {
                        if (event.key === "ArrowDown" && summaryOptions.length) {
                          event.preventDefault();
                          event.currentTarget.parentElement?.querySelector<HTMLButtonElement>('[role="option"]')?.focus();
                        } else if (event.key === "Escape") setActiveSummaryLine(null);
                      }}
                      onChange={(event) => updateLine(line.lineNo, { summary: event.target.value })} />
                    {activeSummaryLine === line.lineNo && summaryOptions.length ? <div className="voucher-detail-options" role="listbox" aria-label={`第${line.lineNo}行摘要建议`}>
                      {summaryOptions.map((summary) => <button key={summary} type="button" role="option" aria-selected={line.summary === summary}
                        onMouseDown={(event) => event.preventDefault()} onClick={() => { updateLine(line.lineNo, { summary }); setActiveSummaryLine(null); }}>{summary}</button>)}
                    </div> : null}
                  </td>
                  <td className="voucher-account-cell">
                    <input
                      aria-label={`第${line.lineNo}行总账科目`}
                      value={line.accountCode ? `${line.accountCode} ${line.accountName}` : activeAccountLine === line.lineNo ? accountSearch : ""}
                      disabled={!line.summary.trim()}
                      placeholder="编码或名称检索"
                      onFocus={() => {
                        setActiveAccountLine(line.lineNo);
                        setAccountSearch(line.accountCode ? `${line.accountCode} ${line.accountName}` : "");
                      }}
                      onChange={(event) => changeAccountSearch(line.lineNo, event.target.value)}
                      onBlur={() => window.setTimeout(() => setActiveAccountLine((active) => active === line.lineNo ? null : active), 140)}
                    />
                    {activeAccountLine === line.lineNo ? (
                      <div className="voucher-account-options">
                        {visibleAccounts.slice(0, 12).map((option) => (
                          <button key={option.accountCode} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => chooseAccount(line.lineNo, option)}>
                            <strong>{option.accountCode}</strong><span>{option.accountName}</span>
                          </button>
                        ))}
                        {!visibleAccounts.length ? <span className="voucher-no-options">没有匹配科目</span> : null}
                      </div>
                    ) : null}
                  </td>
                  <td className="voucher-detail-cell">
                    <input
                      aria-label={`第${line.lineNo}行明细科目`}
                      disabled={!line.summary.trim() || !line.accountCode}
                      value={line.detail}
                      placeholder={account ? "明细可选：输入或选择建议" : "先选总账科目"}
                      onChange={(event) => updateLine(line.lineNo, { detail: event.target.value, detailAccountCode: undefined })}
                      onFocus={() => setActiveDetailLine(line.lineNo)}
                      onBlur={() => window.setTimeout(() => setActiveDetailLine((active) => active === line.lineNo ? null : active), 140)}
                    />
                    {line.detailAccountCode ? <small>科目编码：{line.detailAccountCode}</small> : null}
                    {activeDetailLine === line.lineNo && options.length > 0 ? (
                      <div className="voucher-detail-options" role="listbox" aria-label={`第${line.lineNo}行可用明细科目`}>
                        {options.map(({ detail, code }) => (
                          <button
                            key={`${detail}-${code ?? ""}`}
                            type="button"
                            role="option"
                            aria-selected={line.detail === detail && line.detailAccountCode === code}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => {
                              updateLine(line.lineNo, { detail, detailAccountCode: code });
                              setActiveDetailLine(null);
                            }}
                          >
                            {detail}{code ? ` (${code})` : ""}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td>
                    <input aria-label={`第${line.lineNo}行借方发生额`} type="number" min="0" step="0.01" disabled={!canEnterAmount || line.credit > 0} value={line.debit || ""} onChange={(event) => updateLine(line.lineNo, { debit: Number(event.target.value) || 0, credit: 0 })} />
                  </td>
                  <td>
                    <input aria-label={`第${line.lineNo}行贷方发生额`} type="number" min="0" step="0.01" disabled={!canEnterAmount || line.debit > 0} value={line.credit || ""} onChange={(event) => updateLine(line.lineNo, { credit: Number(event.target.value) || 0, debit: 0 })} />
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr>
              <th colSpan={4}>总计（大写）{balanced ? <span className="voucher-uppercase">{amountToUpper(debitTotal)}</span> : null}</th>
              <th>{formatAmount(debitTotal)}</th>
              <th>{formatAmount(creditTotal)}</th>
            </tr>
          </tfoot>
        </table>
      </div>
      </fieldset>

      {populatedCount > 0 && !balanced ? <p className="voucher-warning">当前借贷不平衡</p> : null}
      {message ? <p className="auth-hint">{message}</p> : null}
      <div className="auth-actions voucher-editor-actions">
        {balanced && savedVoucherId === null ? <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>{saving ? "保存中..." : "保存凭证"}</button> : null}
        {savedVoucherId !== null && !newAccounts ? <>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void retryAccountCheck()}>重试检查新科目</button>
          <button type="button" className="btn" disabled={saving} onClick={() => onSaved(savedVoucherId)}>完成</button>
        </> : null}
        {onCancel && savedVoucherId === null ? <button type="button" className="btn" disabled={saving} onClick={onCancel}>取消</button> : null}
      </div>
      {savedVoucherId !== null && newAccounts ? <VoucherAccountDialog voucherIds={[savedVoucherId]}
        initialDetails={newAccounts.details} initialAccounts={newAccounts.accounts} standard={newAccounts.standard}
        onComplete={() => onSaved(savedVoucherId)} onCancel={() => onSaved(savedVoucherId)} /> : null}
    </section>
  );
}
