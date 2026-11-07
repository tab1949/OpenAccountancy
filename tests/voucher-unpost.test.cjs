const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const { ensureVoucherSchema, unpostVouchers, postVouchers } = require("../dist/electron/main/vouchers.js");
const { ensureBooksetSettingsSchema } = require("../dist/electron/main/booksetSettings.js");
const { loadStandardSubjects } = require("../dist/electron/main/accountingSubjects.js");
const { queryLedger } = require("../dist/electron/main/ledgers.js");

test("unposting is atomic, logs changes, respects closing and updates ledgers", () => {
  const db = new Database(":memory:");
  try {
    db.pragma("foreign_keys = ON");
    db.exec("CREATE TABLE bookset_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    db.prepare("INSERT INTO bookset_meta VALUES ('accounting_standard_code','ASBE_2006'), ('enable_fiscal_year','2026'), ('enable_fiscal_period_no','1')").run();
    ensureBooksetSettingsSchema(db);
    ensureVoucherSchema(db, loadStandardSubjects("ASBE_2006"));
    db.prepare("INSERT INTO fiscal_periods (fiscal_year,period_no,start_date,end_date,status) VALUES (2026,1,'2026-01-01','2026-01-31','open'), (2026,2,'2026-02-01','2026-02-28','closed')").run();
    const insert = db.prepare("INSERT INTO voucher_records (voucher_date,voucher_no,status,amount,payload_json,created_at,updated_at) VALUES (?,?,'posted',?,?,'','')");
    const payload = JSON.stringify({ lines: [
      { lineNo: 1, accountCode: "1001", detail: "", summary: "现金", debit: 10, credit: 0 },
      { lineNo: 2, accountCode: "1002", detail: "", summary: "银行", debit: 0, credit: 10 }
    ], attachments: [] });
    const a = Number(insert.run("2026-01-10", 1, 10, payload).lastInsertRowid);
    const b = Number(insert.run("2026-01-11", 2, 10, payload).lastInsertRowid);
    const closed = Number(insert.run("2026-02-01", 1, 10, payload).lastInsertRowid);
    const status = (id) => db.prepare("SELECT status FROM voucher_records WHERE voucher_id = ?").get(id).status;
    const logs = () => db.prepare("SELECT voucher_id, action_type FROM voucher_posting_log ORDER BY posting_log_id").all();
    const query = { kind: "trial-balance", from: { year: 2026, periodNo: 1 }, to: { year: 2026, periodNo: 1 }, rootsOnly: true };
    const balance = () => queryLedger(db, query).balances.find((item) => item.code === "1001").closingDebit;
    assert.equal(balance(), 20);
    assert.equal(unpostVouchers(db, []).ok, false);
    assert.equal(unpostVouchers(db, [a, closed]).ok, false);
    assert.equal(unpostVouchers(db, [a, 99999]).ok, false);
    assert.equal(status(a), "posted");
    assert.deepEqual(logs(), []);
    assert.equal(unpostVouchers(db, [a, a]).affectedCount, 1);
    assert.equal(status(a), "draft");
    assert.equal(balance(), 10);
    assert.deepEqual(logs(), [{ voucher_id: a, action_type: "unpost" }]);
    assert.equal(unpostVouchers(db, [b, a]).ok, false);
    assert.equal(status(b), "posted");
    assert.equal(postVouchers(db, [a]).ok, true);
    assert.equal(balance(), 20);
    assert.equal(unpostVouchers(db, [a, b]).affectedCount, 2);
    assert.equal(balance(), 0);
    assert.deepEqual(logs().map((entry) => entry.action_type), ["unpost", "post", "unpost", "unpost"]);
  } finally { db.close(); }
});
