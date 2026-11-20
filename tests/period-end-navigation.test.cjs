const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { MemoryRouter, Outlet, Route, Routes } = require("react-router-dom");

test("period-end closing menu reuses the ledger balance page and reserves the other reports", async () => {
  const { createServer } = await import("vite");
  const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { navSections } = await server.ssrLoadModule("/config/navigation.ts");
    const { default: zhCN } = await server.ssrLoadModule("/i18n/locales/zh-CN.ts");
    await server.ssrLoadModule("/i18n/index.ts");
    const { RoutedModulePage } = await server.ssrLoadModule("/pages/workspace/RoutedModulePage.tsx");
    const { CurrentAccountingPeriodContext } = await server.ssrLoadModule("/CurrentAccountingPeriodContext.ts");
    const groups = navSections.find((section) => section.key === "period-end").groups;
    const labels = (group) => group.items.map((item) => item.labelKey.split(".").reduce((value, key) => value[key], zhCN));

    assert.deepEqual(groups.map((group) => group.labelKey.split(".").reduce((value, key) => value[key], zhCN)), ["结转", "结账"]);
    assert.deepEqual(labels(groups[0]), ["自定义结转", "销售成本结转", "期间损益结转"]);
    assert.deepEqual(labels(groups[1]), ["试算平衡表", "科目汇总表", "科目余额表"]);
    assert.ok(groups[1].items.every((item) => item.requiresBookset));

    const authSession = { role: "admin", permissions: [] };
    const render = (path) => renderToStaticMarkup(
      React.createElement(CurrentAccountingPeriodContext.Provider, { value: { currentAccountingPeriod: null } },
        React.createElement(MemoryRouter, { initialEntries: [path] },
          React.createElement(Routes, null,
            React.createElement(Route, { element: React.createElement(Outlet, { context: { shellState: {} } }) },
              React.createElement(Route, { path, element: React.createElement(RoutedModulePage, { authSession }) })
            )
          )
        )
      )
    );

    const ledger = render("/app/ledger/trial-balance");
    assert.equal(render("/app/period-end/account-balance"), ledger);
    assert.match(ledger, /仅显示总账科目/);
    for (const [path, title] of [
      ["/app/period-end/trial-balance", "试算平衡表"],
      ["/app/period-end/account-summary", "科目汇总表"]
    ]) {
      const markup = render(path);
      assert.ok(markup.includes(title));
      assert.match(markup, /placeholder-block/);
    }
  } finally {
    await server.close();
  }
});
