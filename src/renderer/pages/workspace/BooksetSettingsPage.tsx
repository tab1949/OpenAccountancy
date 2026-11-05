import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { AuthSession, BooksetSettings, FiscalPeriodSetting, SaveBooksetSettingsPayload } from "@common/contracts";
import type { BooksetOperationType } from "@renderer/components/BooksetOperationModal";

const SETTINGS_SECTIONS = [
  { id: "identity", label: "账套标识" },
  { id: "periods", label: "会计期间与科目结构" },
  { id: "voucher", label: "凭证与业务规则" },
  { id: "closing", label: "结账与账簿展示" },
  { id: "security", label: "备份、恢复与安全" }
] as const;

type SettingsSection = (typeof SETTINGS_SECTIONS)[number]["id"];

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export function BooksetSettingsPage({
  authSession,
  onOpenBooksetOperation,
  refreshShellData
}: {
  authSession: AuthSession;
  onOpenBooksetOperation: (operation: BooksetOperationType) => void;
  refreshShellData: () => Promise<void>;
}): JSX.Element {
  const navigate = useNavigate();
  const [settings, setSettings] = useState<BooksetSettings | null>(null);
  const [section, setSection] = useState<SettingsSection>("identity");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newYear, setNewYear] = useState(new Date().getFullYear() + 1);
  const [editingPeriod, setEditingPeriod] = useState<FiscalPeriodSetting | null>(null);
  const [restorePath, setRestorePath] = useState("");
  const isAdministrator = authSession.role === "admin";

  const refresh = async (): Promise<void> => {
    setLoading(true);
    try {
      setSettings(await window.openAccountancy.getBooksetSettings());
    } catch (error) {
      setMessage(`读取账套设置失败：${(error as Error).message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const save = async (): Promise<void> => {
    if (!settings) return;
    setSaving(true);
    setMessage("");
    try {
      const payload: SaveBooksetSettingsPayload = {
        identity: settings.identity,
        periods: {
          fiscalYearStartDate: settings.periods.fiscalYearStartDate,
          periodDays: settings.periods.periodDays,
          periodsPerYear: settings.periods.periodsPerYear,
          automaticNewYear: settings.periods.automaticNewYear
        },
        accountStructure: settings.accountStructure,
        businessRules: settings.businessRules,
        closingAndLedger: settings.closingAndLedger,
        backup: settings.backup
      };
      const result = await window.openAccountancy.saveBooksetSettings(payload);
      setMessage(result.message);
      if (result.ok) await refresh();
    } finally {
      setSaving(false);
    }
  };

  const patchIdentity = (patch: Partial<BooksetSettings["identity"]>): void => {
    setSettings((current) => current ? { ...current, identity: { ...current.identity, ...patch } } : current);
  };

  const patchPeriods = (patch: Partial<BooksetSettings["periods"]>): void => {
    setSettings((current) => current ? { ...current, periods: { ...current.periods, ...patch } } : current);
  };

  const patchStructure = (patch: Partial<BooksetSettings["accountStructure"]>): void => {
    setSettings((current) => current ? { ...current, accountStructure: { ...current.accountStructure, ...patch } } : current);
  };

  const addYear = async (): Promise<void> => {
    const result = await window.openAccountancy.addFiscalYear(newYear);
    setMessage(result.message);
    if (result.ok) await refresh();
  };

  const updatePeriod = async (): Promise<void> => {
    if (!editingPeriod) return;
    const result = await window.openAccountancy.updateFiscalPeriod({
      year: editingPeriod.year,
      periodNo: editingPeriod.periodNo,
      startDate: editingPeriod.startDate,
      endDate: editingPeriod.endDate
    });
    setMessage(result.message);
    if (result.ok) {
      setEditingPeriod(null);
      await refresh();
    }
  };

  const closePeriod = async (period: FiscalPeriodSetting): Promise<void> => {
    if (!window.confirm(`确认结账 ${String(period.year).padStart(4, "0")} 年 ${String(period.periodNo).padStart(2, "0")} 期？结账后该期间不能修改。`)) return;
    const result = await window.openAccountancy.closeFiscalPeriod(period.year, period.periodNo);
    setMessage(result.message);
    if (result.ok) await refresh();
  };

  const backupNow = async (): Promise<void> => {
    if (!isAdministrator) return;
    if (!window.confirm("手动备份前请确认已通知相关人员。系统会先创建当前账套的安全快照，再执行备份。是否继续？")) return;
    const destinationPath = await window.openAccountancy.pickPackageSavePath(`manual-backup-${Date.now()}.oabk`);
    if (!destinationPath) return;
    const result = await window.openAccountancy.backupBookset({ destinationPath });
    setMessage(result.message);
    if (result.ok) await refresh();
  };

  const restoreNow = async (): Promise<void> => {
    if (!isAdministrator || !restorePath) return;
    const booksets = await window.openAccountancy.listBooksets();
    const active = booksets.find((bookset) => bookset.status === "open");
    if (!active) {
      setMessage("当前没有打开的账套。");
      return;
    }
    if (!window.confirm("恢复前系统将自动备份当前账套。确认继续恢复所选备份？")) return;
    const result = await window.openAccountancy.restoreBooksetBackup({ booksetId: active.id, packagePath: restorePath });
    setMessage(result.message);
    if (result.ok) await refresh();
  };

  const reinitialize = async (): Promise<void> => {
    if (!isAdministrator) return;
    if (!window.confirm("高危操作：系统将先自动备份，然后删除当前账套及其中全部业务数据。此操作不可撤销。是否继续？")) return;
    if (!window.confirm("二次确认：确定清空当前账套并进入新建账套流程？")) return;
    const result = await window.openAccountancy.reinitializeBookset();
    setMessage(result.message);
    if (result.ok) {
      await refreshShellData();
      navigate("/app/home");
      onOpenBooksetOperation("create");
    }
  };

  if (loading) return <section className="panel"><p>正在读取账套设置...</p></section>;
  if (!settings) return <section className="panel"><p>{message || "未能读取账套设置。"}</p></section>;

  const structureLocked = settings.accountStructure.firstMonthClosed;
  const editablePeriods = settings.periods.items.filter((period) => period.status === "open" && !period.used && period.startDate > today());

  return (
    <section className="bookset-settings-layout">
      <nav className="bookset-settings-nav" aria-label="账套设置分类">
        {SETTINGS_SECTIONS.map((item) => (
          <button key={item.id} type="button" className={section === item.id ? "bookset-settings-nav-active" : ""} onClick={() => setSection(item.id)}>
            {item.label}
          </button>
        ))}
      </nav>

      <div className="bookset-settings-content">
        <header className="bookset-settings-heading">
          <div><h2>{SETTINGS_SECTIONS.find((item) => item.id === section)?.label}</h2><p>{settings.identity.companyName} · {settings.identity.bookCode}</p></div>
          {section !== "security" ? <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void save()}>{saving ? "保存中..." : "保存设置"}</button> : null}
        </header>

        {section === "identity" ? (
          <div className="bookset-setting-grid">
            <label>公司名称<input value={settings.identity.companyName} onChange={(event) => patchIdentity({ companyName: event.target.value })} /></label>
            <label>联系人<input value={settings.identity.contact} onChange={(event) => patchIdentity({ contact: event.target.value })} /></label>
            <label className="settings-wide-field">地址<input value={settings.identity.address} onChange={(event) => patchIdentity({ address: event.target.value })} /></label>
            <label>统一社会信用代码<input value={settings.identity.taxId} onChange={(event) => patchIdentity({ taxId: event.target.value })} /></label>
            <label className="settings-wide-field">银行账户（每行一个）<textarea rows={4} value={settings.identity.bankAccounts.join("\n")} onChange={(event) => patchIdentity({ bankAccounts: event.target.value.split("\n") })} /></label>
            <div className="bookset-readonly-identifiers">
              <div><small>账套号</small><strong>{settings.identity.bookCode}</strong></div>
              <div><small>启用期间</small><strong>{String(settings.identity.fiscalYear).padStart(4, "0")}年{String(settings.identity.fiscalPeriodNo).padStart(2, "0")}期</strong></div>
              <div><small>记账本位币</small><strong>{settings.identity.baseCurrency}</strong></div>
              <div><small>会计制度</small><strong>{settings.identity.accountingStandard === "ASBE_2006" ? "企业会计准则" : "小企业会计准则"}</strong></div>
            </div>
          </div>
        ) : null}

        {section === "periods" ? (
          <div className="bookset-setting-stack">
            <section className="settings-subsection">
              <h3>会计期间</h3>
              <div className="bookset-setting-grid">
                <label>会计年度起始日期<input type="date" value={settings.periods.fiscalYearStartDate} onChange={(event) => patchPeriods({ fiscalYearStartDate: event.target.value })} /></label>
                <label>期间天数（20–45）<input type="number" min="20" max="45" value={settings.periods.periodDays} onChange={(event) => patchPeriods({ periodDays: Number(event.target.value) })} /></label>
                <label>年度期间个数<input type="number" min="1" max="12" value={settings.periods.periodsPerYear} onChange={(event) => patchPeriods({ periodsPerYear: Number(event.target.value) })} /></label>
                <label className="settings-toggle"><input type="checkbox" checked={settings.periods.automaticNewYear} onChange={(event) => patchPeriods({ automaticNewYear: event.target.checked })} />12 月结账后自动新增下一年度</label>
              </div>
              <div className="settings-inline-form"><label>新增会计年度<input type="number" min="0" max="9999" value={newYear} onChange={(event) => setNewYear(Number(event.target.value))} /></label><button className="btn" type="button" onClick={() => void addYear()}>手动新增年度</button></div>
              <div className="voucher-result-scroll"><table className="voucher-result-table">
                <thead><tr><th>年度</th><th>期间</th><th>开始日期</th><th>结束日期</th><th>状态</th><th>凭证</th><th>操作</th></tr></thead>
                <tbody>{settings.periods.items.map((period) => {
                  const editable = period.status === "open" && !period.used && period.startDate > today();
                  return <tr key={`${period.year}-${period.periodNo}`}>
                    <td>{String(period.year).padStart(4, "0")}</td><td>{String(period.periodNo).padStart(2, "0")}</td>
                    <td>{editingPeriod?.year === period.year && editingPeriod.periodNo === period.periodNo ? <input type="date" value={editingPeriod.startDate} onChange={(event) => setEditingPeriod({ ...editingPeriod, startDate: event.target.value })} /> : period.startDate}</td>
                    <td>{editingPeriod?.year === period.year && editingPeriod.periodNo === period.periodNo ? <input type="date" value={editingPeriod.endDate} onChange={(event) => setEditingPeriod({ ...editingPeriod, endDate: event.target.value })} /> : period.endDate}</td>
                    <td>{period.status === "closed" ? "已结账" : "开放"}</td><td>{period.used ? "已使用" : "未使用"}</td>
                    <td>{editingPeriod?.year === period.year && editingPeriod.periodNo === period.periodNo ? <button type="button" className="link-button" onClick={() => void updatePeriod()}>保存期间</button> : <>
                      <button type="button" className="link-button" disabled={!editable} onClick={() => setEditingPeriod(period)}>调整</button>
                      <button type="button" className="link-button" disabled={period.status === "closed"} onClick={() => void closePeriod(period)}>结账</button>
                    </>}</td>
                  </tr>;
                })}</tbody>
              </table></div>
            </section>

            <section className="settings-subsection">
              <h3>科目结构</h3>
              <p>首次月结账后结构锁定；级次和编码长度只允许增加。</p>
              <div className="account-structure-editor">
                <label>科目级次<input type="number" min={settings.accountStructure.levels} max="10" disabled={structureLocked} value={settings.accountStructure.levels} onChange={(event) => {
                  const levels = Math.max(settings.accountStructure.levels, Number(event.target.value));
                  const codeLengths = [...settings.accountStructure.codeLengths];
                  while (codeLengths.length < levels) codeLengths.push(2);
                  patchStructure({ levels, codeLengths: codeLengths.slice(0, levels) });
                }} /></label>
                {settings.accountStructure.codeLengths.map((length, index) => <label key={index}>{index + 1} 级编码长度<input type="number" min={length} max="10" disabled={structureLocked} value={length} onChange={(event) => {
                  const codeLengths = [...settings.accountStructure.codeLengths];
                  codeLengths[index] = Math.max(length, Number(event.target.value));
                  patchStructure({ codeLengths });
                }} /></label>)}
              </div>
              {structureLocked ? <p className="voucher-warning">已经完成首次月结账，科目结构完全锁定。</p> : null}
            </section>
          </div>
        ) : null}

        {section === "voucher" ? (
          <section className="settings-subsection">
            <h3>资金与赤字控制</h3>
            <label className="settings-toggle"><input type="checkbox" checked={settings.businessRules.checkCashDeficit} onChange={(event) => setSettings({ ...settings, businessRules: { checkCashDeficit: event.target.checked } })} />现金、银行存款、其他货币资金余额为负时提醒</label>
          </section>
        ) : null}

        {section === "closing" ? (
          <section className="settings-subsection">
            <h3>结账前置条件</h3>
            <label className="settings-toggle"><input type="checkbox" checked={settings.closingAndLedger.requireReviewedBeforeClose} onChange={(event) => setSettings({ ...settings, closingAndLedger: { ...settings.closingAndLedger, requireReviewedBeforeClose: event.target.checked } })} />凭证审核后才能结账（默认不勾选）</label>
            <h3>账簿余额方向</h3>
            <label className="settings-toggle"><input type="checkbox" checked={settings.closingAndLedger.sameBalanceDirection} onChange={(event) => setSettings({ ...settings, closingAndLedger: { ...settings.closingAndLedger, sameBalanceDirection: event.target.checked } })} />账簿余额方向与科目方向相同</label>
            <p>勾选后，借方科目出现贷方余额时显示为借方负数；不勾选时按实际借贷方向显示。</p>
          </section>
        ) : null}

        {section === "security" ? (
          <div className="bookset-setting-stack">
            <section className="settings-subsection">
              <h3>自动备份策略</h3>
              <div className="bookset-setting-grid">
                <label className="settings-wide-field">备份路径<div className="settings-path-control"><input value={settings.backup.path} onChange={(event) => setSettings({ ...settings, backup: { ...settings.backup, path: event.target.value } })} /><button type="button" className="btn btn-small" onClick={() => void window.openAccountancy.pickDirectory().then((path) => { if (path) setSettings({ ...settings, backup: { ...settings.backup, path } }); })}>浏览</button></div></label>
                <label>频率（天）<input type="number" min="1" max="365" value={settings.backup.frequencyDays} onChange={(event) => setSettings({ ...settings, backup: { ...settings.backup, frequencyDays: Number(event.target.value) } })} /></label>
                <label>备份时间点<input type="time" value={settings.backup.time} onChange={(event) => setSettings({ ...settings, backup: { ...settings.backup, time: event.target.value } })} /></label>
                <p>上次备份：{settings.backup.lastBackupAt || "尚未执行"}</p>
              </div>
              <button type="button" className="btn btn-primary" onClick={() => void save()}>保存备份策略</button>
            </section>
            <section className="settings-subsection">
              <h3>手动备份 / 恢复</h3>
              {isAdministrator ? <div className="auth-actions"><button type="button" className="btn" onClick={() => void backupNow()}>手动备份</button><button type="button" className="btn btn-small" onClick={() => void window.openAccountancy.pickPackageFile().then((file) => { if (file) setRestorePath(file); })}>选择恢复包</button><button type="button" className="btn" disabled={!restorePath} onClick={() => void restoreNow()}>恢复</button></div> : <p className="auth-hint">手动备份与恢复仅管理员可执行。</p>}
              {restorePath ? <p className="auth-hint">已选择：{restorePath}</p> : null}
            </section>
            <section className="settings-subsection settings-danger-zone">
              <h3>重新初始化</h3>
              <p>自动生成账套备份后，删除当前账套全部数据并进入新建账套流程。此操作不可撤销。</p>
              {isAdministrator ? <button type="button" className="btn btn-danger" onClick={() => void reinitialize()}>重新初始化账套</button> : <p className="auth-hint">重新初始化仅管理员可执行。</p>}
            </section>
          </div>
        ) : null}

        {message ? <p className="auth-hint">{message}</p> : null}
      </div>
    </section>
  );
}
