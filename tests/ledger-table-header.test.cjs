const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { ledgerTable } = require("../dist/electron/common/ledgerTable.js");

test("trial balance renders two grouped header rows and no uppercase total", async () => {
  const { createServer } = await import("vite");
  const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { LedgerTableHeader } = await server.ssrLoadModule("/components/LedgerTableHeader.tsx");
    const { LedgerTableBody } = await server.ssrLoadModule("/components/LedgerTableBody.tsx");
    const table = ledgerTable({ kind: "trial-balance", rows: [], balances: [
      { code: "1001", name: "库存现金", level: 1, openingDebit: 1, openingCredit: 0, debit: 3, credit: 4, closingDebit: 5, closingCredit: 0 }
    ] });
    const markup = renderToStaticMarkup(React.createElement(LedgerTableHeader, { rows: table.headerRows }));
    assert.match(markup, /<th rowSpan="2" scope="col">序号<\/th>/);
    for (const label of ["期初", "本期", "期末"]) assert.ok(markup.includes(`<th colSpan="2" scope="colgroup">${label}</th>`));
    assert.equal((markup.match(/<tr>/g) || []).length, 2);
    assert.deepEqual(table.headerRows[1].map((cell) => cell.label), ["借方", "贷方", "借方", "贷方", "借方", "贷方"]);
    assert.deepEqual(table.rows.at(-1).cells, ["合计", "", "", 1, 0, 3, 4, 5, 0]);
    assert.equal(table.rows.length, 2);
    const body = renderToStaticMarkup(React.createElement(LedgerTableBody, { table, kind: "trial-balance" }));
    assert.match(body, /<td>库存现金<\/td><td>1\.00<\/td><td><\/td><td>3\.00<\/td><td>4\.00<\/td><td>5\.00<\/td><td><\/td>/);
    assert.match(body, /<td>合计<\/td><td><\/td><td><\/td><td>1\.00<\/td><td><\/td><td>3\.00<\/td><td>4\.00<\/td><td>5\.00<\/td><td><\/td>/);
    const other = ledgerTable({ kind: "general", rows: [{ kind: "opening", date: "", summary: "期初余额", debit: 0, credit: 0, direction: "平", balance: 0 }], balances: [] });
    const otherBody = renderToStaticMarkup(React.createElement(LedgerTableBody, { table: other, kind: "general" }));
    assert.match(otherBody, /<td>期初余额<\/td><td>0\.00<\/td><td>0\.00<\/td><td>平<\/td><td>0\.00<\/td>/);
  } finally {
    await server.close();
  }
});
