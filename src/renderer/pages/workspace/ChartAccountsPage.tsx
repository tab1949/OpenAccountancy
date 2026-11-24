import { useEffect, useState } from "react";
import type { ReactElement } from "react";
import { useOutletContext } from "react-router-dom";
import type { AccountCategory, ChartAccount, ChartAccountInput } from "../../../common/contracts";
import { categoriesForStandard } from "../../../common/accountCategories";
import { DEFAULT_ACCOUNT_INDENT, indentAccount } from "../../../common/accountIndent";
import { ChartAccountEditor } from "../../components/ChartAccountEditor";
import type { ShellContextState } from "../types";

type Editor = ChartAccountInput & { originalCode?: string };

export function ChartAccountsPage(): ReactElement {
  const { shellState } = useOutletContext<ShellContextState>();
  const [accounts, setAccounts] = useState<ChartAccount[]>([]);
  const [indentStyle, setIndentStyle] = useState(DEFAULT_ACCOUNT_INDENT);
  const [standard, setStandard] = useState<"ASBE_2006" | "SBE_2011">("ASBE_2006");
  const [editor, setEditor] = useState<Editor | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [editing, setEditing] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, ChartAccountInput>>({});
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const refresh = async (): Promise<void> => {
    setLoading(true);
    try {
      const [list, settings] = await Promise.all([window.openAccountancy.listChartAccounts(), window.openAccountancy.getBooksetSettings()]);
      if (!settings) throw new Error("请先打开账套。");
      setAccounts(list);
      setIndentStyle(settings.accountStructure.indentStyle);
      setStandard(settings.identity.accountingStandard);
    } catch (error) {
      setMessage(`读取科目表失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    setAccounts([]);
    setEditor(null);
    setEditing(false);
    setDeleting(false);
    void refresh();
  }, [shellState]);

  const categories = categoriesForStandard(standard);
  const visible = accounts.filter((account) => `${account.code} ${account.name}`.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const startAdd = (): void => {
    const parent = accounts[0];
    if (!parent) { setMessage("没有可用的上级科目。"); return; }
    setDeleting(false);
    setEditing(false);
    setEditor({ parentCode: parent.code, code: parent.code, name: "", category: parent.category, direction: "借" });
  };
  const startEditing = (): void => {
    if (editing) { setEditing(false); return; }
    setEditor(null);
    setDeleting(false);
    setDrafts(Object.fromEntries(accounts.filter((account) => account.parentCode).map((account) => [account.code, {
      parentCode: account.parentCode!, code: account.code, name: account.name,
      category: account.category, direction: account.direction
    }])));
    setEditing(true);
  };
  const updateDraft = (code: string, patch: Partial<ChartAccountInput>): void => {
    setDrafts((current) => ({ ...current, [code]: { ...current[code]!, ...patch } }));
  };
  const saveDraft = async (code: string): Promise<void> => {
    const draft = drafts[code];
    if (!draft) return;
    try {
      const result = await window.openAccountancy.saveChartAccount(draft, code);
      setMessage(result.message);
      if (result.ok) { setEditing(false); await refresh(); }
    } catch (error) {
      setMessage(`保存科目失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const save = async (): Promise<void> => {
    if (!editor) return;
    try {
      const result = await window.openAccountancy.saveChartAccount(editor, editor.originalCode);
      setMessage(result.message);
      if (result.ok) { setEditor(null); await refresh(); }
    } catch (error) {
      setMessage(`保存科目失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const remove = async (account: ChartAccount): Promise<void> => {
    if (!window.confirm(`确认删除科目 ${account.code} ${account.name}？`)) return;
    try {
      const result = await window.openAccountancy.deleteChartAccount(account.code);
      setMessage(result.message);
      if (result.ok) await refresh();
    } catch (error) {
      setMessage(`删除科目失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  return (
    <section className="panel">
      <h2>科目表</h2>
      <div className="auth-actions">
        <button type="button" className="btn" onClick={startAdd}>新增</button>
        <button type="button" className="btn" onClick={() => { setDeleting(!deleting); setEditing(false); setEditor(null); }}>{deleting ? "退出删除" : "删除"}</button>
        <button type="button" className="btn" onClick={startEditing}>{editing ? "退出修改" : "修改"}</button>
        <button type="button" className="btn" onClick={() => setSearchOpen(true)}>查找</button>
        {search ? <button type="button" className="btn" onClick={() => { setSearch(""); setSearchInput(""); }}>清除查找</button> : null}
      </div>
      {message ? <p role="status">{message}</p> : null}
      {searchOpen ? (
        <div className="chart-dialog" role="dialog" aria-label="查找科目">
          <label>科目编码或名称<input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} /></label>
          <button type="button" className="btn" onClick={() => { setSearch(searchInput.trim()); setSearchOpen(false); }}>确认</button>
          <button type="button" className="btn" onClick={() => setSearchOpen(false)}>取消</button>
        </div>
      ) : null}
      {editor ? <ChartAccountEditor accounts={accounts} standard={standard} value={editor}
        onChange={(value) => setEditor({ ...editor, ...value })} onSave={() => void save()} onCancel={() => setEditor(null)} /> : null}
      <div className="voucher-result-scroll">
        <table className="voucher-result-table">
          <thead><tr><th>序号</th><th>级次</th><th>科目编码</th><th>科目名称</th><th>科目类型</th><th>余额方向</th><th>操作</th></tr></thead>
          <tbody>
            {visible.map((account, index) => {
              const protectedAccount = account.level === 1 || account.used || accounts.some((item) => item.parentCode === account.code);
              const draft = editing ? drafts[account.code] : undefined;
              return <tr key={account.code} className={deleting ? (protectedAccount ? "chart-protected" : "chart-delete-row") : editing && account.level === 1 ? "chart-protected" : ""}
                onClick={deleting && !protectedAccount ? () => void remove(account) : undefined}>
                <td>{index + 1}</td><td>{account.level}</td>
                <td style={{ whiteSpace: "pre-wrap" }}>{draft ? <><span>{indentAccount("", account.level, indentStyle)}</span><input aria-label={`${account.code} 科目编码`} value={draft.code} disabled={account.used || accounts.some((item) => item.parentCode === account.code)} onChange={(event) => updateDraft(account.code, { code: event.target.value })} /></> : indentAccount(account.code, account.level, indentStyle)}</td>
                <td style={{ whiteSpace: "pre-wrap" }}>{draft ? <><span>{indentAccount("", account.level, indentStyle)}</span><input aria-label={`${account.code} 科目名称`} value={draft.name} onChange={(event) => updateDraft(account.code, { name: event.target.value })} /></> : indentAccount(account.name, account.level, indentStyle)}</td>
                <td>{draft ? <select aria-label={`${account.code} 科目类型`} value={draft.category} onChange={(event) => updateDraft(account.code, { category: event.target.value as AccountCategory })}>{categories.map((category) => <option key={category}>{category}</option>)}</select> : account.category}</td>
                <td>{draft ? (["借", "贷", "借或贷"] as const).map((direction) => <label key={direction}><input type="radio" name={`direction-${account.code}`} checked={draft.direction === direction} onChange={() => updateDraft(account.code, { direction })} />{direction}</label>) : account.direction}</td>
                <td>{draft ? <button type="button" onClick={() => void saveDraft(account.code)}>保存</button> : deleting && !protectedAccount ? <button type="button" onClick={(event) => { event.stopPropagation(); void remove(account); }}>删除</button> : "—"}</td>
              </tr>;
            })}
            {!visible.length ? <tr><td colSpan={7}>{loading ? "正在读取..." : "没有匹配科目。"}</td></tr> : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}
