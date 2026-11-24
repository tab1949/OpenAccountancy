const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const { indentAccount, DEFAULT_ACCOUNT_INDENT } = require("../dist/electron/common/accountIndent.js");
const { ledgerTable, accountSummaryTable } = require("../dist/electron/common/ledgerTable.js");
const { ensureBooksetSettingsSchema, getBooksetSettings, saveBooksetSettings, initializeBooksetSettings } = require("../dist/electron/main/booksetSettings.js");
const { ensureVoucherSchema } = require("../dist/electron/main/vouchers.js");

test("account indentation applies once per level to code and name without modifying values", () => {
  const rows = [1, 2, 3].map((level) => ({
    code: `${level}001`, name: `科目${level}`, category: "资产", level,
    openingDebit: 0, openingCredit: 0, debit: 1, credit: 0, closingDebit: 1, closingCredit: 0
  }));
  const result = { kind: "trial-balance", rows: [], balances: rows };
  assert.deepEqual(ledgerTable(result).rows.slice(0, 3).map((row) => row.cells.slice(1, 3)), [
    ["1001", "科目1"], ["  2001", "  科目2"], ["    3001", "    科目3"]
  ]);
  assert.deepEqual(ledgerTable(result, "→").rows.slice(0, 3).map((row) => row.cells.slice(1, 3)), [
    ["1001", "科目1"], ["→2001", "→科目2"], ["→→3001", "→→科目3"]
  ]);
  const summaryCells = accountSummaryTable(result, "-").rows.flatMap((row) => [row.cells[0], row.cells[3]]);
  assert.ok(summaryCells.includes("-2001 -科目2"));
  assert.ok(summaryCells.includes("--3001 --科目3"));
  assert.equal(indentAccount("科目", 3, ""), "科目");
  assert.equal(indentAccount("科目", 3, DEFAULT_ACCOUNT_INDENT), "    科目");
  assert.throws(() => indentAccount("科目", 0, " "), /级次无效/);
  assert.throws(() => indentAccount("科目", 2, "\n"), /缩进样式无效/);
});

test("indent setting defaults for new and existing books, persists and remains editable after closing", () => {
  const db = new Database(":memory:");
  try {
    db.exec("CREATE TABLE bookset_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    ensureBooksetSettingsSchema(db);
    ensureVoucherSchema(db);
    initializeBooksetSettings(db, { fiscalYear: 2026, fiscalPeriodNo: 1, name: "测试", bookCode: "001", accountingStandard: "ASBE_2006", baseCurrency: "CNY" });
    let settings = getBooksetSettings(db);
    assert.equal(settings.accountStructure.indentStyle, "  ");
    const stored = JSON.parse(db.prepare("SELECT setting_value FROM bookset_settings WHERE setting_key='accountStructure'").get().setting_value);
    delete stored.indentStyle;
    stored.firstMonthClosed = true;
    db.prepare("UPDATE bookset_settings SET setting_value=? WHERE setting_key='accountStructure'").run(JSON.stringify(stored));
    settings = getBooksetSettings(db);
    assert.equal(settings.accountStructure.indentStyle, "  ");
    settings.accountStructure.indentStyle = "· ";
    assert.equal(saveBooksetSettings(db, settings).ok, true);
    assert.equal(getBooksetSettings(db).accountStructure.indentStyle, "· ");
    settings.accountStructure.indentStyle = "";
    assert.equal(saveBooksetSettings(db, settings).ok, true);
    assert.equal(getBooksetSettings(db).accountStructure.indentStyle, "");
    for (const invalid of ["x".repeat(17), "\t", "\n"]) {
      settings.accountStructure.indentStyle = invalid;
      assert.match(saveBooksetSettings(db, settings).message, /科目缩进样式/);
      assert.equal(getBooksetSettings(db).accountStructure.indentStyle, "");
    }
    stored.indentStyle = "\n";
    db.prepare("UPDATE bookset_settings SET setting_value=? WHERE setting_key='accountStructure'").run(JSON.stringify(stored));
    assert.throws(() => getBooksetSettings(db), /科目缩进样式无效/);
  } finally { db.close(); }
});
