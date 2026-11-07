const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

test("date button renders the current period closing status", async () => {
  const { createServer } = await import("vite");
  const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { AccountingPeriodPicker } = await server.ssrLoadModule("/components/AccountingPeriodPicker.tsx");
    const { CurrentAccountingPeriodContext } = await server.ssrLoadModule("/CurrentAccountingPeriodContext.ts");
    const render = (currentAccountingPeriod) => renderToStaticMarkup(
      React.createElement(CurrentAccountingPeriodContext.Provider, {
        value: { currentAccountingPeriod, selectAccountingDate: async () => ({ ok: true, message: "" }) }
      }, React.createElement(AccountingPeriodPicker))
    );
    const period = { date: "2026-02-01", year: 2026, periodNo: 1, startDate: "2026-01-20", endDate: "2026-02-19" };
    assert.match(render({ ...period, status: "open" }), />2026\/02\/01-2026年01期\(未结账\)<\/button>/);
    assert.match(render({ ...period, status: "closed" }), />2026\/02\/01-2026年01期\(已结账\)<\/button>/);
    assert.match(render(null), />选择会计日期<\/button>/);
  } finally {
    await server.close();
  }
});
