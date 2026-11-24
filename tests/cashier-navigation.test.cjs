const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { MemoryRouter, Outlet, Route, Routes } = require("react-router-dom");

test("cashier journals reuse the ledger page with period filters and no account selector", async () => {
  const { createServer } = await import("vite");
  const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { navSections } = await server.ssrLoadModule("/config/navigation.ts");
    const { cashierJournals } = await server.ssrLoadModule("../common/cashierJournal.ts");
    await server.ssrLoadModule("/i18n/index.ts");
    const { RoutedModulePage } = await server.ssrLoadModule("/pages/workspace/RoutedModulePage.tsx");
    const { CurrentAccountingPeriodContext } = await server.ssrLoadModule("/CurrentAccountingPeriodContext.ts");
    const items = navSections.find((section) => section.key === "cashier").groups.flatMap((group) => group.items);
    assert.ok(items.every((item) => item.requiresBookset));
    const render = (path) => renderToStaticMarkup(
      React.createElement(CurrentAccountingPeriodContext.Provider, { value: { currentAccountingPeriod: null } },
        React.createElement(MemoryRouter, { initialEntries: [path] },
          React.createElement(Routes, null,
            React.createElement(Route, { element: React.createElement(Outlet, { context: { shellState: {} } }) },
              React.createElement(Route, { path, element: React.createElement(RoutedModulePage, { authSession: { role: "admin", permissions: [] } }) })
            )
          )
        )
      )
    );
    for (const [path, config, code] of [
      ["/app/cashier/cash-journal", cashierJournals.cash, "1001"],
      ["/app/cashier/bank-journal", cashierJournals.bank, "1002"]
    ]) {
      const markup = render(path);
      assert.equal(config.accountCode, code);
      assert.match(markup, new RegExp(`<h2>${config.title}</h2>`));
      assert.match(markup, /起始期间/);
      assert.match(markup, /结束期间/);
      assert.match(markup, /包含未记账凭证/);
      assert.match(markup, />查询<\/button>/);
      assert.doesNotMatch(markup, /科目<select|placeholder-block/);
    }
    assert.match(render("/app/ledger/journal"), /科目<select/);
    for (const path of ["/app/cashier/bank-reconcile", "/app/cashier/balance-sheet"]) {
      assert.match(render(path), /placeholder-block/);
    }
  } finally {
    await server.close();
  }
});
