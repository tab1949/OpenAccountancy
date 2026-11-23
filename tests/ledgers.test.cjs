const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const { ensureVoucherSchema, postVouchers, listVoucherAccounts, getVoucherDetailSuggestions } = require("../dist/electron/main/vouchers.js");
const { loadStandardSubjects } = require("../dist/electron/main/accountingSubjects.js");
const { ensureBooksetSettingsSchema } = require("../dist/electron/main/booksetSettings.js");
const { saveChartAccount, mapVoucherDetail, createAccountForVoucherDetail, listUnmappedDetails } = require("../dist/electron/main/chartAccounts.js");
const { queryLedger } = require("../dist/electron/main/ledgers.js");

test("cashier journals use the same period and account calculations as subject journals", () => {
  const db = new Database(":memory:");
  try {
    db.exec("CREATE TABLE bookset_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    db.prepare("INSERT INTO bookset_meta VALUES ('accounting_standard_code', 'ASBE_2006'), ('enable_fiscal_year', '2026'), ('enable_fiscal_period_no', '1')").run();
    ensureBooksetSettingsSchema(db);
    ensureVoucherSchema(db, loadStandardSubjects("ASBE_2006"));
    db.prepare("INSERT INTO fiscal_periods (fiscal_year,period_no,start_date,end_date) VALUES (2026,1,'2026-01-01','2026-01-31'),(2026,2,'2026-02-01','2026-02-28'),(2026,3,'2026-03-01','2026-03-31')").run();
    const insert = db.prepare("INSERT INTO voucher_records (voucher_date,voucher_no,status,amount,payload_json,created_at,updated_at) VALUES (?,?,'posted',?,?,'','')");
    for (const [date, no, accountCode, debit] of [
      ["2026-01-01", 1, "1001", 10], ["2026-02-01", 2, "1001", 20],
      ["2026-02-02", 3, "1002", 30], ["2026-03-01", 4, "1002", 40]
    ]) {
      insert.run(date, no, debit, JSON.stringify({ lines: [{ lineNo: 1, summary: "测试", accountCode, detail: "", debit, credit: 0 }] }));
    }
    const from = { year: 2026, periodNo: 2 }, to = { year: 2026, periodNo: 3 };
    for (const [cashierJournal, accountCode, opening, entries] of [
      ["cash", "1001", 10, [20]], ["bank", "1002", 0, [30, 40]]
    ]) {
      const query = { kind: "journal", from, to, accountCode, cashierJournal };
      const result = queryLedger(db, query);
      assert.deepEqual(result, queryLedger(db, { kind: "journal", from, to, accountCode }));
      assert.equal(result.rows[0].balance, opening);
      assert.deepEqual(result.rows.filter((row) => row.kind === "entry").map((row) => row.debit), entries);
      assert.throws(() => queryLedger(db, { ...query, to: { year: 2026, periodNo: 1 } }), /有效的起止会计期间/);
      assert.throws(() => queryLedger(db, { ...query, accountCode: accountCode === "1001" ? "1002" : "1001" }), /出纳日记账查询无效/);
    }
    assert.throws(() => queryLedger(db, { kind: "journal", from, to, accountCode: "1001", cashierJournal: "invalid" }), /出纳日记账查询无效/);
    db.prepare("UPDATE voucher_account_catalog SET is_active = 0 WHERE account_code = '1001'").run();
    assert.throws(() => queryLedger(db, { kind: "journal", from, to, accountCode: "1001", cashierJournal: "cash" }), /对应的科目不存在/);
  } finally { db.close(); }
});

test("ledgers derive opening, period, year and trial balances from posted entries", () => {
  const db = new Database(":memory:");
  try {
    db.pragma("foreign_keys = ON");
    db.exec("CREATE TABLE bookset_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    const meta = db.prepare("INSERT INTO bookset_meta VALUES (?, ?)");
    meta.run("accounting_standard_code", "ASBE_2006");
    meta.run("enable_fiscal_year", "2026");
    meta.run("enable_fiscal_period_no", "1");
    ensureBooksetSettingsSchema(db);
    db.prepare("INSERT INTO bookset_settings VALUES (?, ?)").run("accountStructure", JSON.stringify({ levels: 4, codeLengths: [4, 2, 2, 2] }));
    ensureVoucherSchema(db, loadStandardSubjects("ASBE_2006"));
    const insertPeriod = db.prepare("INSERT INTO fiscal_periods (fiscal_year,period_no,start_date,end_date) VALUES (?,?,?,?)");
    insertPeriod.run(2026, 1, "2026-01-20", "2026-02-19");
    insertPeriod.run(2026, 2, "2026-02-20", "2026-03-19");
    insertPeriod.run(2027, 1, "2027-01-01", "2027-01-31");
    const input = { parentCode: "1012", code: "101201", name: "支付宝", category: "资产", direction: "借" };
    assert.equal(saveChartAccount(db, input).ok, true);
    const insertVoucher = db.prepare("INSERT INTO voucher_records (voucher_date,voucher_no,status,amount,payload_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)");
    const insert = (date, no, status, debit, credit) => insertVoucher.run(date, no, status, debit || credit,
      JSON.stringify({ lines: [{ lineNo: 1, summary: "测试", accountCode: "1012", detail: "支付宝", debit, credit }] }), "", "");
    insert("2026-02-01", 1, "posted", 3, 0);
    insert("2026-02-20", 2, "posted", 0, 1);
    insert("2026-02-21", 3, "draft", 100, 0);
    insert("2027-01-02", 1, "posted", 2, 0);
    const from = { year: 2026, periodNo: 2 }, to = { year: 2026, periodNo: 2 };
    assert.throws(() => queryLedger(db, { kind: "subsidiary", from, to, accountCode: "101201" }), /尚未映射/);
    assert.equal(mapVoucherDetail(db, "1012", "支付宝", "101201").ok, true);
    const result = queryLedger(db, { kind: "subsidiary", from, to, accountCode: "101201" });
    assert.deepEqual(result.rows.map((r) => [r.kind, r.debit, r.credit, r.direction, r.balance]), [
      ["opening", 0, 0, "借", 3], ["entry", 0, 1, "借", 2],
      ["period", 0, 1, "借", 2], ["year", 3, 1, "借", 2]
    ]);
    const general = queryLedger(db, { kind: "general", from, to, accountCode: "1012" });
    assert.deepEqual(general.rows.map((r) => r.kind), ["opening", "period", "year"]);
    const balances = queryLedger(db, { kind: "trial-balance", from, to }).balances;
    for (const code of ["1012", "101201"]) {
      const row = balances.find((r) => r.code === code);
      assert.deepEqual([row.openingDebit, row.openingCredit, row.debit, row.credit, row.closingDebit, row.closingCredit], [3, 0, 0, 1, 2, 0]);
    }
    const next = queryLedger(db, { kind: "journal", from: { year: 2027, periodNo: 1 }, to: { year: 2027, periodNo: 1 }, accountCode: "1012" });
    assert.equal(next.rows[0].balance, 2);
    assert.deepEqual([next.rows.at(-1).debit, next.rows.at(-1).credit, next.rows.at(-1).balance], [2, 0, 4]);
  } finally { db.close(); }
});

test("posting requires mapping and skips closed vouchers without discarding eligible ones", () => {
  const db = new Database(":memory:");
  try {
    db.pragma("foreign_keys = ON");
    db.exec("CREATE TABLE bookset_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    db.prepare("INSERT INTO bookset_meta VALUES ('accounting_standard_code', 'ASBE_2006')").run();
    db.prepare("INSERT INTO bookset_meta VALUES ('enable_fiscal_year', '2026'), ('enable_fiscal_period_no', '1')").run();
    ensureBooksetSettingsSchema(db);
    db.prepare("INSERT INTO bookset_settings VALUES (?, ?)").run("accountStructure", JSON.stringify({ levels: 4, codeLengths: [4, 2, 2, 2] }));
    ensureVoucherSchema(db, loadStandardSubjects("ASBE_2006"));
    db.prepare("INSERT INTO fiscal_periods (fiscal_year,period_no,start_date,end_date,status) VALUES (2026,1,'2026-01-01','2026-01-31','closed'),(2026,2,'2026-02-01','2026-02-28','open')").run();
    const insert = db.prepare("INSERT INTO voucher_records (voucher_date,voucher_no,status,amount,payload_json,created_at,updated_at) VALUES (?,1,'draft',1,?,'','')");
    const payload = JSON.stringify({ lines: [{ lineNo: 1, accountCode: "1012", detail: "支付宝", summary: "测试", debit: 1, credit: 0 }] });
    const closed = Number(insert.run("2026-01-01", payload).lastInsertRowid);
    const open = Number(insert.run("2026-02-01", payload).lastInsertRowid);
    assert.equal(postVouchers(db, [closed, open]).ok, false);
    assert.equal(db.prepare("SELECT status FROM voucher_records WHERE voucher_id = ?").get(open).status, "draft");
    assert.equal(saveChartAccount(db, { parentCode: "1012", code: "101201", name: "支付宝", category: "资产", direction: "借" }).ok, true);
    assert.equal(mapVoucherDetail(db, "1012", "支付宝", "101201").ok, true);
    const result = postVouchers(db, [closed, open]);
    assert.equal(result.affectedCount, 1);
    assert.match(result.message, /已结账期间/);
    assert.match(result.message, /1 期，1 个总账科目，1 个明细科目/);
    assert.equal(db.prepare("SELECT status FROM voucher_records WHERE voucher_id = ?").get(closed).status, "draft");
    assert.equal(db.prepare("SELECT status FROM voucher_records WHERE voucher_id = ?").get(open).status, "posted");
  } finally { db.close(); }
});

test("create and associate atomically; later vouchers reuse mapping within the same root", () => {
  const db = new Database(":memory:");
  try {
    db.pragma("foreign_keys = ON");
    db.exec("CREATE TABLE bookset_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    db.prepare("INSERT INTO bookset_meta VALUES ('accounting_standard_code', 'ASBE_2006'), ('enable_fiscal_year', '2026'), ('enable_fiscal_period_no', '1')").run();
    ensureBooksetSettingsSchema(db);
    db.prepare("INSERT INTO bookset_settings VALUES (?, ?)").run("accountStructure", JSON.stringify({ levels: 4, codeLengths: [4, 2, 2, 2] }));
    ensureVoucherSchema(db, loadStandardSubjects("ASBE_2006"));
    db.prepare("INSERT INTO fiscal_periods (fiscal_year,period_no,start_date,end_date) VALUES (2026,1,'2026-01-01','2026-01-31')").run();
    const insert = db.prepare("INSERT INTO voucher_records (voucher_date,voucher_no,status,amount,payload_json,created_at,updated_at) VALUES ('2026-01-05',?,'draft',1,?,'','')");
    const payload = (root, detail) => JSON.stringify({ lines: [{ lineNo: 1, accountCode: root, detail, summary: "测试", debit: 1, credit: 0 }] });
    const first = Number(insert.run(1, payload("1012", "支付宝")).lastInsertRowid);
    const input = { parentCode: "1012", code: "101201", name: "支付宝账户", category: "资产", direction: "借" };
    assert.equal(createAccountForVoucherDetail(db, "1012", "支付宝", { ...input, code: "10121" }).ok, false);
    assert.equal(createAccountForVoucherDetail(db, "1012", "支付宝", { ...input, parentCode: "1001", code: "100101" }).ok, false);
    listUnmappedDetails(db);
    db.exec("CREATE TRIGGER reject_mapping BEFORE INSERT ON chart_detail_mappings BEGIN SELECT RAISE(ABORT, '模拟关联失败'); END");
    assert.match(createAccountForVoucherDetail(db, "1012", "支付宝", input).message, /模拟关联失败/);
    assert.equal(db.prepare("SELECT count(*) AS n FROM chart_detail_accounts").get().n, 0);
    db.exec("DROP TRIGGER reject_mapping");
    db.exec("CREATE TRIGGER reject_alias BEFORE INSERT ON chart_detail_mappings WHEN NEW.detail = '支付宝账户' BEGIN SELECT RAISE(ABORT, '模拟名称关联失败'); END");
    assert.match(createAccountForVoucherDetail(db, "1012", "支付宝", input).message, /模拟名称关联失败/);
    assert.equal(db.prepare("SELECT count(*) AS n FROM chart_detail_accounts").get().n, 0);
    assert.equal(db.prepare("SELECT count(*) AS n FROM chart_detail_mappings").get().n, 0);
    db.exec("DROP TRIGGER reject_alias");
    assert.equal(createAccountForVoucherDetail(db, "1012", "支付宝", input).ok, true);
    assert.equal(createAccountForVoucherDetail(db, "1012", "支付宝", { ...input, code: "101202" }).ok, false);
    assert.ok(getVoucherDetailSuggestions(db, "1012").includes("支付宝"));
    assert.ok(getVoucherDetailSuggestions(db, "1012").includes("支付宝账户"));
    assert.ok(listVoucherAccounts(db).find((account) => account.accountCode === "1012").detailSuggestions.includes("支付宝"));
    const later = Number(insert.run(2, payload("1012", " 支付宝 ")).lastInsertRowid);
    const other = Number(insert.run(3, payload("1001", "支付宝")).lastInsertRowid);
    const renamed = Number(insert.run(4, payload("1012", "支付宝账户")).lastInsertRowid);
    insert.run(5, payload("1012", "微信"));
    assert.match(createAccountForVoucherDetail(db, "1012", "微信", { ...input, code: "101202" }).message, /已关联其他明细科目/);
    assert.equal(db.prepare("SELECT count(*) AS n FROM chart_detail_accounts").get().n, 1);
    assert.deepEqual(listUnmappedDetails(db, [first, later, renamed]), []);
    assert.equal(listUnmappedDetails(db, [other])[0].rootCode, "1001");
    assert.equal(postVouchers(db, [first, later, renamed]).affectedCount, 3);
    const ledger = queryLedger(db, { kind: "subsidiary", from: { year: 2026, periodNo: 1 }, to: { year: 2026, periodNo: 1 }, accountCode: "101201" });
    assert.equal(ledger.rows.filter((row) => row.kind === "entry").length, 3);
    assert.equal(ledger.rows.at(-1).balance, 3);
  } finally { db.close(); }
});
