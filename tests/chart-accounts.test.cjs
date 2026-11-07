const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const { loadStandardSubjects } = require("../dist/electron/main/accountingSubjects.js");
const { ensureVoucherSchema } = require("../dist/electron/main/vouchers.js");
const { listChartAccounts, saveChartAccount, deleteChartAccount, listUnmappedDetails, mapVoucherDetail } = require("../dist/electron/main/chartAccounts.js");

function createBook(standard) {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec("CREATE TABLE bookset_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL); CREATE TABLE bookset_settings (setting_key TEXT PRIMARY KEY, setting_value TEXT NOT NULL)");
  db.prepare("INSERT INTO bookset_meta VALUES ('accounting_standard_code', ?)").run(standard);
  db.prepare("INSERT INTO bookset_settings VALUES ('accountStructure', ?)").run(JSON.stringify({ levels: 4, codeLengths: [4, 2, 2, 2] }));
  ensureVoucherSchema(db, loadStandardSubjects(standard));
  return db;
}

for (const standard of ["ASBE_2006", "SBE_2011"]) {
  test(`standard accounts have authoritative attributes: ${standard}`, () => {
    const db = createBook(standard);
    try {
      const accounts = listChartAccounts(db);
      assert.equal(accounts.length, loadStandardSubjects(standard).length);
      assert.deepEqual([accounts.find((a) => a.code === "1001").category, accounts.find((a) => a.code === "1001").direction], ["资产", "借"]);
      assert.equal(accounts.find((a) => a.code === "1123").direction, "借或贷");
      assert.equal(accounts.find((a) => a.code === "1404").direction, "借或贷");
      assert.equal(accounts.find((a) => a.code === "2221").direction, "借或贷");
      assert.ok(accounts.every((account) => ["借", "贷", "借或贷"].includes(account.direction)));
    } finally { db.close(); }
  });
}

test("detail subjects validate structure and protect mapped accounts", () => {
  const db = createBook("ASBE_2006");
  try {
    const input = { parentCode: "1012", code: "101201", name: "支付宝", category: "资产", direction: "借" };
    assert.equal(saveChartAccount(db, { ...input, code: "10121" }).ok, false);
    assert.equal(saveChartAccount(db, input).ok, true);
    for (const direction of ["贷", "借或贷", "借"]) {
      assert.equal(saveChartAccount(db, { ...input, direction }, input.code).ok, true);
      assert.equal(listChartAccounts(db).find((account) => account.code === input.code).direction, direction);
    }
    assert.equal(saveChartAccount(db, { ...input, direction: "借方" }, input.code).ok, false);
    assert.equal(saveChartAccount(db, input).ok, false);
    db.prepare("INSERT INTO voucher_records (voucher_date,voucher_no,status,amount,payload_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?)")
      .run("2026-01-01", 1, "posted", 1, JSON.stringify({ lines: [{ accountCode: "1012", detail: "支付宝" }] }), "", "");
    assert.equal(listUnmappedDetails(db).length, 1);
    assert.equal(mapVoucherDetail(db, "1001", "支付宝", "101201").ok, false);
    assert.equal(mapVoucherDetail(db, "1012", "支付宝", "101201").ok, true);
    assert.equal(saveChartAccount(db, { ...input, parentCode: "101201", code: "10120101", name: "下级" }).ok, false);
    assert.equal(listUnmappedDetails(db).length, 0);
    assert.equal(deleteChartAccount(db, "101201").ok, false);
    assert.equal(saveChartAccount(db, { ...input, code: "101202" }, "101201").ok, false);
    assert.equal(saveChartAccount(db, { ...input, name: "支付宝账户" }, "101201").ok, true);
    assert.equal(deleteChartAccount(db, "1012").ok, false);
  } finally { db.close(); }
});

test("legacy directions migrate without losing detail mappings", () => {
  const db = createBook("ASBE_2006");
  try {
    db.exec(`
      CREATE TABLE chart_detail_accounts (
        code TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
        direction TEXT NOT NULL CHECK (direction IN ('借方', '贷方')),
        parent_code TEXT NOT NULL, level INTEGER NOT NULL
      );
      CREATE TABLE chart_detail_mappings (
        root_code TEXT NOT NULL, detail TEXT NOT NULL,
        account_code TEXT NOT NULL REFERENCES chart_detail_accounts(code),
        PRIMARY KEY (root_code, detail)
      );
      INSERT INTO chart_detail_accounts VALUES ('101201', '支付宝', '资产', '借方', '1012', 2);
      INSERT INTO chart_detail_accounts VALUES ('101202', '微信', '资产', '贷方', '1012', 2);
      INSERT INTO chart_detail_mappings VALUES ('1012', '支付宝', '101201');
    `);
    const accounts = listChartAccounts(db);
    assert.equal(accounts.find((account) => account.code === "101201").direction, "借");
    assert.equal(accounts.find((account) => account.code === "101202").direction, "贷");
    assert.equal(accounts.find((account) => account.code === "101201").used, true);
    assert.equal(db.prepare("SELECT account_code FROM chart_detail_mappings WHERE detail = ?").get("支付宝").account_code, "101201");
    assert.deepEqual(db.pragma("foreign_key_check"), []);
    assert.equal(saveChartAccount(db, { parentCode: "1012", code: "101202", name: "微信", category: "资产", direction: "借或贷" }, "101202").ok, true);
    assert.equal(listChartAccounts(db).find((account) => account.code === "101202").direction, "借或贷");
    assert.throws(() => db.prepare("UPDATE chart_detail_accounts SET direction = '借方'").run(), /CHECK constraint failed/);
  } finally { db.close(); }
});

test("invalid legacy direction rolls back migration without losing data", () => {
  const db = createBook("ASBE_2006");
  try {
    db.exec(`
      CREATE TABLE chart_detail_accounts (
        code TEXT PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL,
        direction TEXT NOT NULL, parent_code TEXT NOT NULL, level INTEGER NOT NULL
      );
      CREATE TABLE chart_detail_mappings (
        root_code TEXT NOT NULL, detail TEXT NOT NULL,
        account_code TEXT NOT NULL REFERENCES chart_detail_accounts(code),
        PRIMARY KEY (root_code, detail)
      );
      INSERT INTO chart_detail_accounts VALUES ('101201', '支付宝', '资产', '异常', '1012', 2);
      INSERT INTO chart_detail_mappings VALUES ('1012', '支付宝', '101201');
    `);
    assert.throws(() => listChartAccounts(db), /CHECK constraint failed/);
    assert.equal(db.prepare("SELECT direction FROM chart_detail_accounts WHERE code = ?").get("101201").direction, "异常");
    assert.equal(db.prepare("SELECT account_code FROM chart_detail_mappings WHERE detail = ?").get("支付宝").account_code, "101201");
    assert.equal(db.prepare("SELECT name FROM sqlite_master WHERE name = 'chart_detail_accounts_new'").get(), undefined);
    assert.deepEqual(db.pragma("foreign_key_check"), []);
  } finally { db.close(); }
});
