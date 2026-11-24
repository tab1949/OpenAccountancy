const test = require("node:test");
const assert = require("node:assert/strict");
const Database = require("better-sqlite3");
const { parseDetailHierarchy, detailHierarchySuggestions } = require("../dist/electron/common/detailHierarchy.js");
const { ensureVoucherSchema, postVouchers } = require("../dist/electron/main/vouchers.js");
const { ensureBooksetSettingsSchema } = require("../dist/electron/main/booksetSettings.js");
const { loadStandardSubjects } = require("../dist/electron/main/accountingSubjects.js");
const { saveChartAccount, listChartAccounts, createAccountForVoucherDetail, createFlatAccountForVoucherDetail, listUnmappedDetails } = require("../dist/electron/main/chartAccounts.js");
const { queryLedger } = require("../dist/electron/main/ledgers.js");

function book(detail) {
  const db = new Database(":memory:");
  db.pragma("foreign_keys = ON");
  db.exec("CREATE TABLE bookset_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  db.prepare("INSERT INTO bookset_meta VALUES ('accounting_standard_code', 'ASBE_2006'), ('enable_fiscal_year', '2026'), ('enable_fiscal_period_no', '1')").run();
  ensureBooksetSettingsSchema(db);
  db.prepare("INSERT INTO bookset_settings VALUES (?, ?)").run("accountStructure", JSON.stringify({ levels: 4, codeLengths: [4, 2, 2, 2] }));
  ensureVoucherSchema(db, loadStandardSubjects("ASBE_2006"));
  db.prepare("INSERT INTO fiscal_periods (fiscal_year,period_no,start_date,end_date) VALUES (2026,1,'2026-01-01','2026-01-31')").run();
  const lines = [
    { lineNo: 1, summary: "测试", accountCode: "1012", detail, debit: 10, credit: 0 },
    { lineNo: 2, summary: "测试", accountCode: "1001", detail: "", debit: 0, credit: 10 }
  ];
  db.prepare("INSERT INTO voucher_records (voucher_date,voucher_no,status,amount,payload_json,created_at,updated_at) VALUES ('2026-01-01',1,'draft',10,?,'','')").run(JSON.stringify({ lines, attachments: [] }));
  return db;
}

test("hierarchy parsing and suggestions follow actual parent-child relationships", () => {
  assert.deepEqual(parseDetailHierarchy("未交增值税-进项税额"), ["未交增值税", "进项税额"]);
  assert.deepEqual(parseDetailHierarchy("未交增值税（进项税额(转出)）"), ["未交增值税", "进项税额", "转出"]);
  for (const invalid of ["一级-", "一级（", "一级(二级）", "一级--二级", "单级"]) assert.equal(parseDetailHierarchy(invalid), null);
  const accounts = [
    { code: "101201", name: "未交增值税", parentCode: "1012" },
    { code: "10120101", name: "进项税额", parentCode: "101201" },
    { code: "1012010101", name: "转出", parentCode: "10120101" },
    { code: "101202", name: "其他", parentCode: "1012" },
    { code: "10120201", name: "进项税额", parentCode: "101202" }
  ];
  assert.deepEqual(detailHierarchySuggestions(accounts, "1012", "未交增值税（进"), ["未交增值税-进项税额"]);
  assert.deepEqual(detailHierarchySuggestions(accounts, "1012", "未交增值税-进项税额-"), ["未交增值税-进项税额-转出"]);
  assert.deepEqual(detailHierarchySuggestions(accounts, "1012", "不存在-"), []);
});

test("hierarchical creation maps only the full detail and rolls up in ledgers", () => {
  const detail = "未交增值税（进项税额）";
  const db = book(detail);
  try {
    assert.equal(postVouchers(db, [1]).ok, false);
    assert.equal(saveChartAccount(db, { parentCode: "1012", code: "101201", name: "未交增值税", category: "资产", direction: "借" }).ok, true);
    const leaf = { parentCode: "101201", code: "10120101", name: "进项税额", category: "资产", direction: "借" };
    assert.equal(createAccountForVoucherDetail(db, "1012", detail, leaf, [1]).ok, true);
    assert.deepEqual(listUnmappedDetails(db, [1]), []);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM chart_detail_mappings WHERE detail = '进项税额'").get().n, 0);
    assert.equal(postVouchers(db, [1]).affectedCount, 1);
    const query = { kind: "subsidiary", from: { year: 2026, periodNo: 1 }, to: { year: 2026, periodNo: 1 } };
    for (const accountCode of ["101201", "10120101"]) {
      assert.equal(queryLedger(db, { ...query, accountCode }).rows.find((row) => row.kind === "entry").debit, 10);
    }
  } finally { db.close(); }
});

test("flat creation chooses an available code and maps atomically", () => {
  const detail = "未交增值税-进项税额";
  const db = book(detail);
  try {
    assert.equal(saveChartAccount(db, { parentCode: "1012", code: "101201", name: "已有", category: "资产", direction: "借" }).ok, true);
    db.exec("CREATE TRIGGER reject_mapping BEFORE UPDATE ON voucher_records BEGIN SELECT RAISE(ABORT, 'mapping rejected'); END");
    assert.throws(() => createFlatAccountForVoucherDetail(db, "1012", detail, [1]), /mapping rejected/);
    assert.equal(listChartAccounts(db).some((account) => account.code === "101202"), false);
    db.exec("DROP TRIGGER reject_mapping");
    assert.equal(createFlatAccountForVoucherDetail(db, "1012", detail, [1]).ok, true);
    assert.equal(listChartAccounts(db).find((account) => account.code === "101202").name, detail);
    assert.equal(JSON.parse(db.prepare("SELECT payload_json FROM voucher_records WHERE voucher_id = 1").get().payload_json).lines[0].detailAccountCode, "101202");
    assert.equal(postVouchers(db, [1]).affectedCount, 1);
  } finally { db.close(); }
});

test("flat creation keeps same-named accounts distinct by code", () => {
  for (const mode of ["leaf", "ambiguous", "parent"]) {
    const db = book("甲-乙");
    try {
      const input = { parentCode: "1012", code: "101201", name: "甲-乙", category: "资产", direction: "借" };
      assert.equal(saveChartAccount(db, input).ok, true);
      if (mode === "ambiguous") assert.equal(saveChartAccount(db, { ...input, code: "101202" }).ok, true);
      if (mode === "parent") assert.equal(saveChartAccount(db, { ...input, parentCode: "101201", code: "10120101", name: "下级" }).ok, true);
      const result = createFlatAccountForVoucherDetail(db, "1012", "甲-乙", [1]);
      assert.equal(result.ok, true, result.message);
      const assigned = JSON.parse(db.prepare("SELECT payload_json FROM voucher_records WHERE voucher_id = 1").get().payload_json).lines[0].detailAccountCode;
      assert.notEqual(assigned, "101201");
    } finally { db.close(); }
  }
});

test("flat creation uses the zero segment as a last resort and reports exhaustion", () => {
  const db = book("甲-乙");
  try {
    db.prepare("UPDATE bookset_settings SET setting_value = ? WHERE setting_key = 'accountStructure'")
      .run(JSON.stringify({ levels: 2, codeLengths: [4, 1] }));
    for (let index = 1; index <= 9; index++) {
      assert.equal(saveChartAccount(db, { parentCode: "1012", code: `1012${index}`, name: `已有${index}`, category: "资产", direction: "借" }).ok, true);
    }
    assert.equal(createFlatAccountForVoucherDetail(db, "1012", "甲-乙", [1]).ok, true);
    assert.equal(JSON.parse(db.prepare("SELECT payload_json FROM voucher_records WHERE voucher_id = 1").get().payload_json).lines[0].detailAccountCode, "10120");
    db.prepare("UPDATE voucher_records SET payload_json = ? WHERE voucher_id = 1")
      .run(JSON.stringify({ lines: [{ accountCode: "1012", detail: "丙-丁" }] }));
    assert.match(createFlatAccountForVoucherDetail(db, "1012", "丙-丁", [1]).message, /没有可用的科目编码/);
  } finally { db.close(); }
});
