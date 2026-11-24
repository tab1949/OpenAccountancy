const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const { ensureVoucherSchema, postVouchers } = require("../dist/electron/main/vouchers.js");
const { ensureBooksetSettingsSchema } = require("../dist/electron/main/booksetSettings.js");
const { loadStandardSubjects } = require("../dist/electron/main/accountingSubjects.js");
const { ensureChartSchema, migrateVoucherAccountCodes, listChartAccounts, saveChartAccount, deleteChartAccount, assignVoucherDetailAccount } = require("../dist/electron/main/chartAccounts.js");
const { queryLedger } = require("../dist/electron/main/ledgers.js");
const { getCarryForwardAccounts } = require("../dist/electron/main/carryForward.js");

function setup() {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec("CREATE TABLE bookset_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  db.prepare("INSERT INTO bookset_meta VALUES ('accounting_standard_code','ASBE_2006'), ('fiscal_year','2026'), ('fiscal_period_no','1'), ('enable_fiscal_year','2026'), ('enable_fiscal_period_no','1')").run();
  ensureBooksetSettingsSchema(db);
  db.prepare("INSERT INTO bookset_settings VALUES ('accountStructure', ?)").run(JSON.stringify({ levels: 4, codeLengths: [4,2,2,2] }));
  ensureVoucherSchema(db, loadStandardSubjects("ASBE_2006"));
  ensureChartSchema(db);
  db.prepare("INSERT INTO fiscal_periods (fiscal_year,period_no,start_date,end_date) VALUES (2026,1,'2026-01-01','2026-01-31')").run();
  return db;
}

test("legacy mappings and unmapped details migrate to persistent codes exactly once", () => {
  const db = setup();
  try {
    const account = { parentCode: "1012", code: "101201", name: "原有", category: "资产", direction: "借" };
    assert.equal(saveChartAccount(db, account).ok, true);
    db.prepare("INSERT INTO chart_detail_mappings VALUES ('1012', '旧名', '101201')").run();
    const line = (detail, debit) => ({ lineNo: 1, accountCode: "1012", accountName: "旧名称", detail, summary: "测试", debit, credit: 0 });
    const insert = db.prepare("INSERT INTO voucher_records (voucher_date,voucher_no,status,amount,payload_json,created_at,updated_at) VALUES ('2026-01-01',?,'posted',?,?,'','')");
    insert.run(1, 10, JSON.stringify({ lines: [line("旧名", 10)] }));
    insert.run(2, 20, JSON.stringify({ lines: [line("新增", 20)] }));
    insert.run(3, 5, JSON.stringify({ lines: [line("新增", 5)] }));
    migrateVoucherAccountCodes(db);
    const lines = db.prepare("SELECT payload_json FROM voucher_records ORDER BY voucher_no").all().map((row) => JSON.parse(row.payload_json).lines[0]);
    assert.deepEqual(lines.map((item) => item.detailAccountCode), ["101201", "101202", "101202"]);
    assert.equal(db.prepare("SELECT count(*) n FROM chart_detail_mappings").get().n, 0);
    assert.equal(db.prepare("SELECT count(*) n FROM chart_detail_mappings_archive").get().n, 1);
    const query = { kind: "subsidiary", from: { year: 2026, periodNo: 1 }, to: { year: 2026, periodNo: 1 }, accountCode: "101202" };
    assert.equal(queryLedger(db, query).rows.filter((row) => row.kind === "entry").reduce((n, row) => n + row.debit, 0), 25);
    assert.equal(getCarryForwardAccounts(db, 2026, 1).accounts.find((a) => a.code === "1012").rows.find((a) => a.accountCode === "101202").balance, 25);
    assert.equal(deleteChartAccount(db, "101202").ok, false);
    assert.equal(saveChartAccount(db, { ...account, name: "已更名" }, "101201").ok, true);
    migrateVoucherAccountCodes(db);
    assert.equal(listChartAccounts(db).filter((a) => a.code === "101202").length, 1);
  } finally { db.close(); }
});

test("migration rolls back all new accounts and voucher changes if codes run out", () => {
  const db = setup();
  try {
    db.prepare("UPDATE bookset_settings SET setting_value = ? WHERE setting_key = 'accountStructure'").run(JSON.stringify({ levels: 2, codeLengths: [4,1] }));
    for (let n = 0; n < 9; n++) db.prepare("INSERT INTO chart_detail_accounts VALUES (?, ?, '资产', '借', '1012', 2)").run(`1012${n}`, `占用${n}`);
    const insert = db.prepare("INSERT INTO voucher_records (voucher_date,voucher_no,status,amount,payload_json,created_at,updated_at) VALUES ('2026-01-01',?,'draft',1,?,'','')");
    for (let n = 1; n <= 2; n++) insert.run(n, JSON.stringify({ lines: [{ accountCode: "1012", detail: `新增${n}` }] }));
    assert.throws(() => migrateVoucherAccountCodes(db), /编码已用尽/);
    assert.equal(db.prepare("SELECT count(*) n FROM chart_detail_accounts").get().n, 9);
    assert.equal(JSON.parse(db.prepare("SELECT payload_json FROM voucher_records WHERE voucher_no=1").get().payload_json).lines[0].detailAccountCode, undefined);
  } finally { db.close(); }
});

test("the stored code, not the detail label, determines ledger identity", () => {
  const db = setup();
  try {
    for (const code of ["101201", "101202"]) {
      assert.equal(saveChartAccount(db, { parentCode: "1012", code, name: "同名", category: "资产", direction: "借" }).ok, true);
    }
    const insert = db.prepare("INSERT INTO voucher_records (voucher_date,voucher_no,status,amount,payload_json,created_at,updated_at) VALUES ('2026-01-01',?,'posted',?,?,'','')");
    for (const [no, code, name, amount] of [[1, "101201", "旧名", 3], [2, "101201", "新名", 4], [3, "101202", "旧名", 5]]) {
      insert.run(no, amount, JSON.stringify({ lines: [{ lineNo: 1, accountCode: "1012", detailAccountCode: code, detail: name, summary: "测试", debit: amount, credit: 0 }] }));
    }
    const query = { kind: "subsidiary", from: { year: 2026, periodNo: 1 }, to: { year: 2026, periodNo: 1 } };
    assert.equal(queryLedger(db, { ...query, accountCode: "101201" }).rows.at(-1).balance, 7);
    assert.equal(queryLedger(db, { ...query, accountCode: "101202" }).rows.at(-1).balance, 5);
  } finally { db.close(); }
});

test("assigning a code rolls back when any selected voucher belongs to a closed period", () => {
  const db = setup();
  try {
    assert.equal(saveChartAccount(db, { parentCode: "1012", code: "101201", name: "明细", category: "资产", direction: "借" }).ok, true);
    db.prepare("INSERT INTO fiscal_periods (fiscal_year,period_no,start_date,end_date,status) VALUES (2026,2,'2026-02-01','2026-02-28','closed')").run();
    const insert = db.prepare("INSERT INTO voucher_records (voucher_date,voucher_no,status,amount,payload_json,created_at,updated_at) VALUES (?,1,'draft',1,?,'','')");
    const payload = JSON.stringify({ lines: [{ accountCode: "1012", detail: "明细" }] });
    insert.run("2026-01-01", payload);
    insert.run("2026-02-01", payload);
    assert.throws(() => assignVoucherDetailAccount(db, "1012", "明细", "101201", [1, 2]), /已结账/);
    assert.equal(JSON.parse(db.prepare("SELECT payload_json FROM voucher_records WHERE voucher_id = 1").get().payload_json).lines[0].detailAccountCode, undefined);
  } finally { db.close(); }
});
