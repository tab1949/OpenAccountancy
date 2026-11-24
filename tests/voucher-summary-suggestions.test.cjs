const test = require("node:test");
const assert = require("node:assert/strict");
const { voucherSummarySuggestions } = require("../dist/electron/common/voucherSummaries.js");

test("summary suggestions use only other lines, remove blanks and duplicates, and filter by input", () => {
  const lines = [
    { lineNo: 1, summary: "采购材料" },
    { lineNo: 2, summary: " 采购材料 " },
    { lineNo: 3, summary: "支付运费" },
    { lineNo: 4, summary: "  " },
    { lineNo: 5, summary: "" }
  ];
  assert.deepEqual(voucherSummarySuggestions(lines, 5), ["采购材料", "支付运费"]);
  assert.deepEqual(voucherSummarySuggestions([...lines.slice(0, 4), { lineNo: 5, summary: "运" }], 5), ["支付运费"]);
  assert.deepEqual(voucherSummarySuggestions([{ lineNo: 1, summary: "仅本行" }], 1), []);
  assert.deepEqual(voucherSummarySuggestions([{ lineNo: 1, summary: "Invoice" }, { lineNo: 2, summary: "inv" }], 2), ["Invoice"]);
});
