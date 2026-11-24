const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { MemoryRouter, Outlet, Route, Routes } = require("react-router-dom");

test("ledger and closing reports expose an unchecked unposted option", async () => {
  const { createServer } = await import("vite");
  const server = await createServer({ server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true }, appType: "custom" });
  try {
    const { LedgerPage } = await server.ssrLoadModule("/pages/workspace/LedgerPage.tsx");
    const { CurrentAccountingPeriodContext } = await server.ssrLoadModule("/CurrentAccountingPeriodContext.ts");
    const render = (props) => renderToStaticMarkup(
      React.createElement(CurrentAccountingPeriodContext.Provider, { value: { currentAccountingPeriod: null } },
        React.createElement(MemoryRouter, { initialEntries: ["/"] },
          React.createElement(Routes, null,
            React.createElement(Route, { element: React.createElement(Outlet, { context: { shellState: {} } }) },
              React.createElement(Route, { path: "/", element: React.createElement(LedgerPage, props) })
            )
          )
        )
      )
    );
    for (const kind of ["general", "subsidiary", "journal", "trial-balance"]) {
      const markup = render({ kind });
      assert.match(markup, /type="checkbox"[^>]*\/>包含未记账凭证/);
      assert.doesNotMatch(markup, /type="checkbox"[^>]*checked[^>]*\/>包含未记账凭证/);
    }
    assert.match(render({ kind: "journal", cashierJournal: "cash" }), /包含未记账凭证/);
    for (const closingReport of ["trial-balance", "account-balance", "account-summary"]) {
      const markup = render({ kind: "trial-balance", closingReport });
      assert.match(markup, /type="checkbox"[^>]*\/>包含未记账凭证/);
      assert.doesNotMatch(markup, /type="checkbox"[^>]*checked[^>]*\/>包含未记账凭证/);
    }
    const { LedgerTableBody } = await server.ssrLoadModule("/components/LedgerTableBody.tsx");
    const body = renderToStaticMarkup(React.createElement("table", null, React.createElement(LedgerTableBody, {
      kind: "trial-balance", table: { rows: [{ kind: "account", cells: ["1001 现金（含未记账凭证）", 1, "1002 银行"], unpostedCells: [0] }] }
    })));
    assert.match(body, /<td class="ledger-unposted">1001 现金（含未记账凭证）<\/td><td>1\.00<\/td><td>1002 银行<\/td>/);
  } finally { await server.close(); }
});
