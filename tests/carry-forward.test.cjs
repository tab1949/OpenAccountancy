const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const { loadStandardSubjects } = require("../dist/electron/main/accountingSubjects.js");
const { ensureVoucherSchema } = require("../dist/electron/main/vouchers.js");
const { ensureBooksetSettingsSchema } = require("../dist/electron/main/booksetSettings.js");
const { getCarryForwardAccounts, generateCarryForwardVouchers } = require("../dist/electron/main/carryForward.js");

function createBook() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec("CREATE TABLE bookset_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  db.prepare("INSERT INTO bookset_meta VALUES (?, ?), (?, ?), (?, ?), (?, ?), (?, ?)")
    .run("accounting_standard_code", "ASBE_2006", "fiscal_year", "2026", "fiscal_period_no", "2",
      "enable_fiscal_year", "2026", "enable_fiscal_period_no", "1");
  ensureBooksetSettingsSchema(db);
  ensureVoucherSchema(db, loadStandardSubjects("ASBE_2006"));
  db.prepare("INSERT INTO fiscal_periods (fiscal_year,period_no,start_date,end_date,status) VALUES (2026,1,'2026-01-01','2026-01-31','open'),(2026,2,'2026-02-01','2026-02-28','open')").run();
  return db;
}

function addPostedEntry(db, no, date, debitAccount, creditAccount, amount) {
  const accountName = (code) => db.prepare("SELECT account_name FROM voucher_account_catalog WHERE account_code = ?").get(code).account_name;
  const lines = [
    { lineNo: 1, summary: "测试", accountCode: debitAccount, accountName: accountName(debitAccount), detail: "", debit: amount, credit: 0 },
    { lineNo: 2, summary: "测试", accountCode: creditAccount, accountName: accountName(creditAccount), detail: "", debit: 0, credit: amount }
  ];
  db.prepare("INSERT INTO voucher_records (voucher_date,voucher_no,status,amount,payload_json,created_at,updated_at) VALUES (?,?,'posted',?,?,'','')")
    .run(date, no, amount, JSON.stringify({ lines }));
}

test("carry detail rows retain their mapped account level", () => {
  const db = createBook();
  try {
    const { listChartAccounts } = require("../dist/electron/main/chartAccounts.js");
    listChartAccounts(db);
    db.prepare("INSERT INTO chart_detail_accounts (code,name,category,direction,parent_code,level) VALUES (?,?,?,?,?,?)")
      .run("100101", "二级", "资产", "借", "1001", 2);
    db.prepare("INSERT INTO chart_detail_accounts (code,name,category,direction,parent_code,level) VALUES (?,?,?,?,?,?)")
      .run("10010101", "三级", "资产", "借", "100101", 3);
    db.prepare("INSERT INTO chart_detail_mappings (root_code,detail,account_code) VALUES (?,?,?)").run("1001", "三级", "10010101");
    const cash = getCarryForwardAccounts(db, 2026, 2).accounts.find((account) => account.code === "1001");
    assert.equal(cash.rows.find((row) => row.isTotal).level, 1);
    assert.equal(cash.rows.find((row) => row.detail === "三级").level, 3);
  } finally { db.close(); }
});

test("custom carry splits source lines into balanced vouchers of at most 11 rows", () => {
  const db = createBook();
  try {
    const rootAccounts = require("../dist/electron/main/chartAccounts.js").listChartAccounts(db);
    const assetCodes = rootAccounts.filter((account) => account.level === 1 && account.category === "资产").slice(0, 11).map((account) => account.code);
    const targetCode = rootAccounts.find((account) => account.level === 1 && account.category === "负债").code;
    assetCodes.forEach((code, index) => addPostedEntry(db, index + 1, "2026-02-10", code, targetCode, index + 1));

    const { accounts } = getCarryForwardAccounts(db, 2026, 2);
    const sourceRowIds = assetCodes.map((code) => accounts.find((account) => account.code === code).rows[0].id);
    const targetRowId = accounts.find((account) => account.code === targetCode).rows[0].id;
    const generated = generateCarryForwardVouchers(db, {
      kind: "custom", year: 2026, periodNo: 2, sourceRowIds, targetRowId, summary: "自定义测试"
    });

    assert.equal(generated.ok, true, generated.message);
    assert.equal(generated.voucherIds.length, 2);
    const records = generated.voucherIds.map((id) =>
      db.prepare("SELECT status, payload_json FROM voucher_records WHERE voucher_id = ?").get(id)
    );
    for (const record of records) {
      assert.equal(record.status, "draft");
      const entries = JSON.parse(record.payload_json).lines.filter((line) => line.accountCode);
      assert.ok(entries.length <= 11);
      assert.equal(entries.reduce((sum, line) => sum + line.debit, 0), entries.reduce((sum, line) => sum + line.credit, 0));
      assert.ok(entries.every((line) => line.summary === "自定义测试"));
    }
    assert.equal(JSON.parse(records[0].payload_json).lines.filter((line) => line.accountCode).length, 11);
    assert.equal(JSON.parse(records[1].payload_json).lines.filter((line) => line.accountCode).length, 2);
  } finally { db.close(); }
});

test("carry rules enforce asset-to-profit and profit-to-equity categories", () => {
  const db = createBook();
  try {
    const { listChartAccounts } = require("../dist/electron/main/chartAccounts.js");
    const accounts = listChartAccounts(db).filter((account) => account.level === 1);
    const asset = accounts.find((account) => account.category === "资产");
    const profit = accounts.find((account) => account.category === "损益");
    const equity = accounts.find((account) => account.category === "所有者权益");
    const liability = accounts.find((account) => account.category === "负债");
    addPostedEntry(db, 1, "2026-02-10", asset.code, liability.code, 20);
    addPostedEntry(db, 2, "2026-02-11", liability.code, profit.code, 20);
    const balances = getCarryForwardAccounts(db, 2026, 2).accounts;
    const rowId = (code) => balances.find((account) => account.code === code).rows[0].id;

    const invalidCogs = generateCarryForwardVouchers(db, {
      kind: "cogs", year: 2026, periodNo: 2, sourceRowIds: [rowId(asset.code)], targetRowId: rowId(liability.code), summary: "销售成本结转"
    });
    assert.equal(invalidCogs.ok, false);
    assert.match(invalidCogs.message, /资产类科目结转至损益类科目/);

    const invalidProfitLoss = generateCarryForwardVouchers(db, {
      kind: "profit-loss", year: 2026, periodNo: 2, sourceRowIds: [rowId(profit.code)], targetRowId: rowId(liability.code), summary: "期间损益结转"
    });
    assert.equal(invalidProfitLoss.ok, false);
    assert.match(invalidProfitLoss.message, /所有者权益类科目/);

    const validProfitLoss = generateCarryForwardVouchers(db, {
      kind: "profit-loss", year: 2026, periodNo: 2, sourceRowIds: [rowId(profit.code)], targetRowId: rowId(equity.code), summary: "期间损益结转"
    });
    assert.equal(validProfitLoss.ok, true, validProfitLoss.message);
  } finally { db.close(); }
});

test("closed and future periods cannot be used for carry", () => {
  const db = createBook();
  try {
    db.prepare("UPDATE fiscal_periods SET status = 'closed' WHERE fiscal_year = 2026 AND period_no = 1").run();
    assert.throws(() => getCarryForwardAccounts(db, 2026, 1), /已结账/);
    db.prepare("INSERT INTO fiscal_periods (fiscal_year,period_no,start_date,end_date,status) VALUES (2026,3,'2026-03-01','2026-03-31','open')").run();
    assert.throws(() => getCarryForwardAccounts(db, 2026, 3), /晚于当前期间/);
  } finally { db.close(); }
});
