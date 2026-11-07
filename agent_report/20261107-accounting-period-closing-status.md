# 行动报告：日期按钮显示结账状态

## 修改
- 从账套数据库的 `fiscal_periods.status` 读取当前期间状态，通过现有应用状态和会计期间上下文传递到日期按钮。
- 日期按钮显示为 `yyyy/MM/dd-xxxx年xx期(已结账/未结账)`；未取得当前期间时仍显示“选择会计日期”。
- 账套设置页面恢复备份成功后刷新应用状态，避免恢复后的期间状态在工具栏中过期。结账后继续沿用原有逻辑切换到下一期间并刷新。
- 保留工作区原有未提交修改。

## 验证
- `npm run build`：通过；Vite 输出现有配置加载方式的未来兼容性警告。
- `node --test tests\accounting-period.test.cjs tests\accounting-period-ipc.test.cjs tests\accounting-period-picker.test.cjs`：3 项通过。覆盖已结账和未结账按钮文本、跨状态切换、重新打开数据库、结账后切换到下一期间，以及选回已结账期间。
- IPC 测试使用模拟 Electron，按钮测试使用 React 服务端渲染；未进行真实窗口点击验证。
- `npm run typecheck`：仍未通过，报告包含既有的 JSX 命名空间和路径别名解析等错误。
