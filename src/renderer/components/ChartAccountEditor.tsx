import type { ReactElement } from "react";
import type { AccountCategory, ChartAccount, ChartAccountInput } from "../../common/contracts";

interface ChartAccountEditorProps {
  accounts: ChartAccount[];
  standard: "ASBE_2006" | "SBE_2011";
  value: ChartAccountInput;
  onChange: (value: ChartAccountInput) => void;
  onSave: () => void;
  onCancel: () => void;
  saving?: boolean;
}

export function ChartAccountEditor({ accounts, standard, value, onChange, onSave, onCancel, saving = false }: ChartAccountEditorProps): ReactElement {
  const categories: AccountCategory[] = standard === "ASBE_2006"
    ? ["资产", "负债", "共同", "所有者权益", "成本", "损益"]
    : ["资产", "负债", "所有者权益", "成本", "损益"];
  return (
    <div className="chart-dialog" role="dialog" aria-label="新增科目">
      <h3>新增科目</h3>
      <label>上级科目
        <select value={value.parentCode} disabled={saving} onChange={(event) => {
          const parent = accounts.find((item) => item.code === event.target.value);
          if (parent) onChange({ ...value, parentCode: parent.code, code: parent.code, category: parent.category });
        }}>
          {accounts.map((account) => <option key={account.code} value={account.code}>{account.code} {account.name}</option>)}
        </select>
      </label>
      <label>科目编码<input value={value.code} disabled={saving} onChange={(event) => onChange({ ...value, code: event.target.value })} /></label>
      <label>科目名称<input value={value.name} disabled={saving} onChange={(event) => onChange({ ...value, name: event.target.value })} /></label>
      <label>科目类型<select value={value.category} disabled={saving} onChange={(event) => onChange({ ...value, category: event.target.value as AccountCategory })}>
        {categories.map((category) => <option key={category}>{category}</option>)}
      </select></label>
      <fieldset disabled={saving}><legend>余额方向</legend>
        {(["借", "贷", "借或贷"] as const).map((direction) => <label key={direction}>
          <input type="radio" name="chart-direction" checked={value.direction === direction}
            onChange={() => onChange({ ...value, direction })} />{direction}
        </label>)}
      </fieldset>
      <button type="button" className="btn btn-primary" disabled={saving} onClick={onSave}>{saving ? "保存中..." : "保存"}</button>
      <button type="button" className="btn" disabled={saving} onClick={onCancel}>取消</button>
    </div>
  );
}
