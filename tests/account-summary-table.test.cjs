const test = require("node:test");
const assert = require("node:assert/strict");
const { accountSummaryTable } = require("../dist/electron/common/ledgerTable.js");
const { categoriesForStandard } = require("../dist/electron/common/accountCategories.js");

function row(code, name, category, level, debit, credit) {
  return { code, name, category, level, openingDebit: 0, openingCredit: 0, debit, credit, closingDebit: 0, closingCredit: 0 };
}
function table(balances) {
  return accountSummaryTable({ kind: "trial-balance", rows: [], balances });
}

test("account summary groups by category, prefixes codes and totals only roots in each column", () => {
  const balances = [
    row("1001", "现金", "资产", 1, 0.1, 0),
    row("100101", "现金明细", "资产", 2, 0.1, 0),
    row("1002", "银行", "资产", 1, 0.2, 0.3),
    row("100201", "银行明细", "负债", 2, 0.2, 0.3),
    row("2001", "应付", "负债", 1, 0, 0.4)
  ];
  const result = table(balances);
  assert.deepEqual(result.headerRows[0].map((cell) => cell.label),
    ["科目名称", "借方发生额", "贷方发生额", "科目名称", "借方发生额", "贷方发生额"]);
  assert.deepEqual(result.rows.map((r) => r.cells), [
    ["1.资产类", "", "", "2.负债类", "", ""],
    ["1001 现金", 0.1, 0, "  100201   银行明细", 0.2, 0.3],
    ["  100101   现金明细", 0.1, 0, "2001 应付", 0, 0.4],
    ["1002 银行", 0.2, 0.3, "", "", ""],
    ["合计", 0.3, 0.3, "合计", 0, 0.4]
  ]);
  assert.deepEqual(table(balances.filter((item) => item.level === 1)).rows.map((r) => r.cells), [
    ["1.资产类", "", "", "2.负债类", "", ""],
    ["1001 现金", 0.1, 0, "2001 应付", 0, 0.4],
    ["1002 银行", 0.2, 0.3, "", "", ""],
    ["合计", 0.3, 0.3, "合计", 0, 0.4]
  ]);
});

test("account summary repeats a category heading when its accounts span both columns", () => {
  const balances = [row("1001", "现金", "资产", 1, 1, 0), row("1002", "银行", "资产", 1, 0, 2)];
  assert.deepEqual(table(balances).rows.map((r) => r.cells), [
    ["1.资产类", "", "", "1.资产类", "", ""],
    ["1001 现金", 1, 0, "1002 银行", 0, 2],
    ["合计", 1, 0, "合计", 0, 2]
  ]);
});

test("unposted accounts are marked independently in each summary column", () => {
  const balances = [
    { ...row("1001", "现金", "资产", 1, 1, 0), unpostedMovement: true },
    row("1002", "银行", "资产", 1, 1, 0),
    row("1003", "其他", "资产", 1, 1, 0),
    { ...row("1004", "存款", "资产", 1, 1, 0), unpostedMovement: true }
  ];
  const rows = table(balances).rows;
  assert.deepEqual(rows[1].unpostedCells, [0]);
  assert.equal(rows[1].cells[0], "1001 现金（含未记账凭证）");
  assert.equal(rows[1].cells[3], "1003 其他");
  assert.deepEqual(rows[2].unpostedCells, [3]);
  assert.equal(rows[2].cells[0], "1002 银行");
  assert.equal(rows[2].cells[3], "1004 存款（含未记账凭证）");
});

test("account summary follows chart category order even when account codes interleave", () => {
  const categories = categoriesForStandard("ASBE_2006");
  assert.deepEqual(categoriesForStandard("SBE_2011"), categories.filter((category) => category !== "共同"));
  const balances = [...categories].reverse().map((category, index) => row(String(index), category, category, 1, 1, 0));
  const rows = table(balances).rows;
  const column = (start) => rows.slice(0, -1).map((item) => item.cells[start]).filter(Boolean);
  const ordered = [...column(0), ...column(3)].filter((value) => /^\d+\..*类$/.test(value));
  assert.deepEqual(ordered, categories.map((category, index) => `${index + 1}.${category}类`));
});

test("account summary handles empty and single account counts and invalid input", () => {
  assert.deepEqual(table([]).rows.map((r) => r.cells), [["合计", 0, 0, "合计", 0, 0]]);
  assert.deepEqual(table([row("1001", "现金", "资产", 1, 0, 0)]).rows.map((r) => r.cells), [
    ["1.资产类", "", "", "", "", ""], ["1001 现金", 0, 0, "", "", ""], ["合计", 0, 0, "合计", 0, 0]
  ]);
  assert.throws(() => accountSummaryTable({ kind: "general", balances: [], rows: [] }), /数据类型无效/);
  assert.throws(() => table([row("1001", "现金", "资产", 1, Number.MAX_SAFE_INTEGER, 0)]), /超出计算范围/);
  assert.throws(() => table([row("1001", "现金", "错误", 1, 0, 0)]), /科目类型无效/);
});
