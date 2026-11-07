# 行动报告：科目余额表零值显示

## 修改
- 科目余额表的数值零在页面和 PDF 中显示为空白，非零金额仍保留两位小数；合计行同样适用。
- XLSX 用数字格式隐藏零值，保留单元格的数值零；CSV 不具备独立的显示格式，继续导出 `0.00` 以保留数据。
- 其他账簿显示不变，余额及合计计算不变。已更新账簿说明并保留工作区已有修改。

## 验证
- `npm run build`：通过；Vite 输出既有配置加载方式的未来兼容性警告。
- `node --test tests\ledger-table-header.test.cjs tests\ledger-export.test.cjs tests\ledgers.test.cjs`：4 项通过，覆盖页面表格渲染、合计、非零金额、其他账簿、CSV、XLSX 原始零值和格式、模拟 PDF 输出及账簿计算。
- 未在真实 Electron 窗口或 Excel 中进行人工验证；PDF 测试使用模拟窗口。
