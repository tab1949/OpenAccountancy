# 行动报告：科目余额表表头调整

## 修改
- 科目余额表改为两级表头：期初、本期、期末分别跨两列，下方显示借方和贷方；序号、科目编码、科目名称跨两行。
- 移除“大写”行，保留原合计行及其计算方式。
- PDF 与 XLSX 导出同步使用分组表头，CSV 保留单行完整列名以便识别列含义；三种导出均不再包含“大写”行。
- 更新账簿说明，保留工作区已有未提交修改。

## 验证
- `npm run build`：通过；Vite 输出既有配置加载方式的未来兼容性警告。
- `node --test tests\ledger-table-header.test.cjs tests\ledger-export.test.cjs tests\ledgers.test.cjs`：4 项通过，覆盖表头渲染、合计、CSV、XLSX 合并单元格、模拟 PDF 表头及账簿计算。
- 未在真实 Electron 窗口验证显示或 PDF 生成；PDF 测试使用模拟窗口。
