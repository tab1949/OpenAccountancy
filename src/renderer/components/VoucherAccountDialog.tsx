import { useState } from "react";
import type { ReactElement } from "react";
import type { ChartAccount, ChartAccountInput, UnmappedDetail } from "../../common/contracts";
import { parseDetailHierarchy } from "../../common/detailHierarchy";
import { ChartAccountEditor } from "./ChartAccountEditor";

interface VoucherAccountDialogProps {
  voucherIds: number[];
  initialDetails: UnmappedDetail[];
  initialAccounts: ChartAccount[];
  standard: "ASBE_2006" | "SBE_2011";
  onComplete: (message: string) => void;
  onCancel: () => void;
}

export function VoucherAccountDialog({ voucherIds, initialDetails, initialAccounts, standard, onComplete, onCancel }: VoucherAccountDialogProps): ReactElement {
  const [unmapped, setUnmapped] = useState(initialDetails);
  const [accounts, setAccounts] = useState(initialAccounts);
  const [editor, setEditor] = useState<ChartAccountInput | null>(null);
  const [saving, setSaving] = useState(false);
  const [hierarchyIndex, setHierarchyIndex] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [refreshPending, setRefreshPending] = useState(false);

  const startCreateAccount = (): void => {
    const item = unmapped[0];
    if (!item) return;
    const root = accounts.find((account) => account.level === 1 && account.code === item.rootCode);
    if (!root) { setMessage("凭证的总账科目不存在，请刷新后重试。"); return; }
    setEditor({ parentCode: root.code, code: root.code, name: item.detail, category: root.category, direction: "借" });
  };

  const finish = async (): Promise<void> => {
    try {
      const [remaining, list] = await Promise.all([
        window.openAccountancy.listUnmappedDetails(voucherIds),
        window.openAccountancy.listChartAccounts()
      ]);
      if (!remaining.length) {
        onComplete("科目编码已写入凭证。");
        return;
      }
      setAccounts(list);
      setUnmapped(remaining);
      setRefreshPending(false);
      setMessage("科目编码已写入凭证，请继续处理其他新科目。");
    } catch (error) {
      setRefreshPending(true);
      setMessage(`科目编码已写入凭证，但刷新失败：${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const advanceHierarchy = async (list: ChartAccount[]): Promise<void> => {
    const item = unmapped[0];
    const parts = item && parseDetailHierarchy(item.detail);
    if (!item || !parts) return;
    let parent = list.find((account) => account.level === 1 && account.code === item.rootCode);
    if (!parent) throw new Error("凭证的总账科目不存在，请刷新后重试。");
    for (let index = 0; index < parts.length; index++) {
      const matches = list.filter((account) => account.parentCode === parent!.code && account.name === parts[index]);
      if (matches.length > 1) throw new Error(`“${parts[index]}”存在多个同名科目，请返回凭证编辑并选择科目编码。`);
      const existing = matches[0];
      if (!existing) {
        setHierarchyIndex(index);
        setEditor({ parentCode: parent.code, code: parent.code, name: parts[index]!, category: parent.category, direction: parent.direction });
        return;
      }
      parent = existing;
    }
    const result = await window.openAccountancy.assignVoucherDetailAccount(item.rootCode, item.detail, parent.code, voucherIds);
    if (!result.ok) throw new Error(result.message);
    setEditor(null);
    setHierarchyIndex(null);
    await finish();
  };

  const startHierarchy = async (): Promise<void> => {
    setSaving(true);
    setMessage("");
    try {
      await advanceHierarchy(accounts);
    } catch (error) {
      setMessage(`处理多级科目失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const createFlat = async (): Promise<void> => {
    const item = unmapped[0];
    if (!item) return;
    setSaving(true);
    setMessage("");
    try {
      const result = await window.openAccountancy.createFlatAccountForVoucherDetail(item.rootCode, item.detail, voucherIds);
      if (!result.ok) { setMessage(result.message); return; }
      await finish();
    } catch (error) {
      setMessage(`添加完整明细失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const saveAccount = async (): Promise<void> => {
    const item = unmapped[0];
    if (!item || !editor || saving) return;
    setSaving(true);
    setMessage("");
    try {
      const parts = parseDetailHierarchy(item.detail);
      const hierarchical = hierarchyIndex !== null && parts !== null;
      if (hierarchical && editor.name.trim() !== parts[hierarchyIndex]) {
        setMessage("逐级新增时科目名称须与凭证明细中的对应名称一致。");
        return;
      }
      const isLast = hierarchical && hierarchyIndex === parts.length - 1;
      const result = hierarchical && !isLast
        ? await window.openAccountancy.saveChartAccount(editor)
        : await window.openAccountancy.createAccountForVoucherDetail(item.rootCode, item.detail, editor, voucherIds);
      setMessage(result.message);
      if (result.ok) {
        setEditor(null);
        if (hierarchical && !isLast) {
          const list = await window.openAccountancy.listChartAccounts();
          setAccounts(list);
          await advanceHierarchy(list);
          return;
        }
        setHierarchyIndex(null);
        await finish();
      }
    } catch (error) {
      setMessage(`新建科目失败：${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const item = unmapped[0]!;
  return <div className="modal-backdrop" role="presentation">
    <div className="modal-card">
      {message ? <p role="status">{message}</p> : null}
      {refreshPending ? <div role="dialog" aria-modal="true" aria-label="刷新科目处理状态">
        <button type="button" className="btn btn-primary" disabled={saving} onClick={() => {
          setSaving(true);
          void finish().finally(() => setSaving(false));
        }}>重试</button>
        <button type="button" className="btn" disabled={saving} onClick={onCancel}>关闭</button>
      </div> : !editor ? <div role="dialog" aria-modal="true" aria-label="新建凭证明细科目">
        {parseDetailHierarchy(item.detail) ? <>
          <p>是否将这些多级次科目添加到科目表？{item.rootName} - {item.detail}（剩余 {unmapped.length} 项）</p>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void startHierarchy()}>是，逐级添加</button>
          <button type="button" className="btn" disabled={saving} onClick={() => void createFlat()}>否，作为完整科目添加</button>
        </> : <>
          <p>是否将 {item.rootName} - {item.detail} 添加到科目表？（剩余 {unmapped.length} 项）</p>
          <button type="button" className="btn btn-primary" disabled={saving} onClick={startCreateAccount}>新建科目</button>
        </>}
        <button type="button" className="btn" disabled={saving} onClick={onCancel}>取消</button>
      </div> : <>
        {hierarchyIndex !== null ? <p>逐级添加：{item.detail}（第 {hierarchyIndex + 1} 级明细）</p> : null}
        <ChartAccountEditor modal accounts={accounts.filter((account) => hierarchyIndex !== null ? account.code === editor.parentCode : account.code.startsWith(item.rootCode))}
          standard={standard} value={editor} saving={saving} onChange={setEditor}
          onSave={() => void saveAccount()} onCancel={() => { setEditor(null); setHierarchyIndex(null); }} />
      </>}
    </div>
  </div>;
}
