const test = require("node:test");
const assert = require("node:assert/strict");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");
const { MemoryRouter, Outlet, Route, Routes } = require("react-router-dom");

test("period-end closing reports reuse the balance table with a single period", async () => {
  const { createServer } = await import("vite");
  const server = await createServer({ server: { middlewareMode: true }, appType: "custom" });
  try {
    const { navSections } = await server.ssrLoadModule("/config/navigation.ts");
    const { default: zhCN } = await server.ssrLoadModule("/i18n/locales/zh-CN.ts");
    await server.ssrLoadModule("/i18n/index.ts");
    const { RoutedModulePage } = await server.ssrLoadModule("/pages/workspace/RoutedModulePage.tsx");
    const { initialLedgerPeriod, ledgerPeriodRange } = await server.ssrLoadModule("/pages/workspace/LedgerPage.tsx");
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
    assert.match(ledger, /仅显示总账科目/);
    assert.match(ledger, /起始期间/);
    assert.match(ledger, /结束期间/);
    assert.match(ledger, /type="checkbox"[^>]*\/>包含未记账凭证/);
    assert.doesNotMatch(ledger, /type="checkbox"[^>]*checked[^>]*\/>包含未记账凭证/);
    for (const kind of ["general", "subsidiary", "journal"]) {
      assert.match(render(`/app/ledger/${kind}`), /包含未记账凭证/);
    }
    for (const [path, title] of [
      ["/app/period-end/trial-balance", "试算平衡表"],
      ["/app/period-end/account-balance", "科目余额表"]
    ]) {
      const markup = render(path);
      assert.match(markup, new RegExp(`<h2>${title}</h2>`));
      assert.match(markup, /会计期间<select/);
      assert.match(markup, /仅显示总账科目/);
      assert.match(markup, /包含未记账凭证/);
      assert.doesNotMatch(markup, /起始期间|结束期间|placeholder-block/);
    }
    const summary = render("/app/period-end/account-summary");
    assert.match(summary, /<h2>科目汇总表<\/h2>/);
    assert.match(summary, /会计期间<select/);
    assert.match(summary, /显示明细科目/);
    assert.match(summary, /包含未记账凭证/);
    assert.doesNotMatch(summary, /起始期间|结束期间|仅显示总账科目|placeholder-block/);

    const periods = [{ year: 2026, periodNo: 1 }, { year: 2026, periodNo: 2 }, { year: 2027, periodNo: 1 }];
    assert.equal(initialLedgerPeriod(periods, { year: 2026, periodNo: 2 }, true), "2026:2");
    assert.equal(initialLedgerPeriod(periods, { year: 2027, periodNo: 1 }, true), "2027:1");
    assert.equal(initialLedgerPeriod(periods, null, true), "");
    assert.equal(initialLedgerPeriod(periods, { year: 2028, periodNo: 1 }, true), "");
    assert.equal(initialLedgerPeriod(periods, null, false), "2026:1");
    assert.deepEqual(ledgerPeriodRange("2026:2", "2027:1", true), {
      from: { year: 2026, periodNo: 2 }, to: { year: 2026, periodNo: 2 }
    });
    assert.deepEqual(ledgerPeriodRange("2026:2", "2027:1", false), {
      from: { year: 2026, periodNo: 2 }, to: { year: 2027, periodNo: 1 }
    });
  } finally {
    await server.close();
  }
});
