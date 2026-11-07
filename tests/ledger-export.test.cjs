const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");
const ExcelJS = require("exceljs");

test("exports ledger tables with safe text, numeric amounts and grouped trial balance headers", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "openaccountancy-export-"));
  const original = Module._load;
  let destination = "";
  let pdfHtml = "";
  let destroyed = false;
  Module._load = function (request, parent, isMain) {
    if (request === "electron") return {
      dialog: { showSaveDialog: async () => ({ canceled: false, filePath: destination }) },
      BrowserWindow: class {
        constructor() { this.webContents = { printToPDF: async () => Buffer.from("%PDF-test") }; }
        async loadURL(url) { pdfHtml = decodeURIComponent(url); }
        destroy() { destroyed = true; }
      }
    };
    return original.call(this, request, parent, isMain);
  };
  try {
    const { exportLedger } = require("../dist/electron/main/ledgerExport.js");
    const query = { kind: "general", from: { year: 2026, periodNo: 1 }, to: { year: 2026, periodNo: 1 } };
    const result = { kind: "general", account: { code: "1001", name: "库存现金" }, balances: [],
      rows: [{ kind: "period", date: "2026-01", summary: "=1+1", debit: 12.34, credit: 0, direction: "借", balance: 12.34 }] };
    destination = path.join(directory, "ledger.csv");
    assert.equal((await exportLedger(query, result, "csv")).ok, true);
    const csv = fs.readFileSync(destination, "utf8");
    assert.ok(csv.startsWith("\ufeff"));
    assert.match(csv, /"'=1\+1"/);
    assert.match(csv, /"12\.34"/);
    destination = path.join(directory, "ledger.xlsx");
    assert.equal((await exportLedger(query, result, "xlsx")).ok, true);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(destination);
    const sheet = workbook.getWorksheet("科目总账");
    assert.equal(sheet.getCell("D4").value, 12.34);
    assert.equal(sheet.getCell("C4").value, "=1+1");
    assert.equal(sheet.getCell("D4").numFmt, "0.00");
    result.rows[0].summary = "<script>alert(1)</script>";
    destination = path.join(directory, "ledger.pdf");
    assert.equal((await exportLedger(query, result, "pdf")).ok, true);
    assert.equal(fs.readFileSync(destination, "utf8"), "%PDF-test");
    assert.match(pdfHtml, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.equal(destroyed, true);

    const trialQuery = { ...query, kind: "trial-balance" };
    const trial = { kind: "trial-balance", rows: [], balances: [
      { code: "1001", name: "库存现金", level: 1, openingDebit: 1, openingCredit: 0, debit: 3, credit: 4, closingDebit: 5, closingCredit: 0 },
      { code: "100101", name: "备用金", level: 2, openingDebit: 1, openingCredit: 0, debit: 3, credit: 4, closingDebit: 5, closingCredit: 0 }
    ] };
    destination = path.join(directory, "trial.csv");
    assert.equal((await exportLedger(trialQuery, trial, "csv")).ok, true);
    const trialCsv = fs.readFileSync(destination, "utf8");
    assert.match(trialCsv, /"期初借方","期初贷方","本期借方","本期贷方","期末借方","期末贷方"/);
    assert.match(trialCsv, /"合计","","","1\.00","0\.00","3\.00","4\.00","5\.00","0\.00"/);
    assert.doesNotMatch(trialCsv, /大写/);

    destination = path.join(directory, "trial.xlsx");
    assert.equal((await exportLedger(trialQuery, trial, "xlsx")).ok, true);
    const trialWorkbook = new ExcelJS.Workbook();
    await trialWorkbook.xlsx.readFile(destination);
    const trialSheet = trialWorkbook.getWorksheet("科目余额表");
    assert.deepEqual(["A3", "B3", "C3", "D3", "F3", "H3"].map((cell) => trialSheet.getCell(cell).value),
      ["序号", "科目编码", "科目名称", "期初", "本期", "期末"]);
    assert.deepEqual(["D4", "E4", "F4", "G4", "H4", "I4"].map((cell) => trialSheet.getCell(cell).value),
      ["借方", "贷方", "借方", "贷方", "借方", "贷方"]);
    for (const [anchor, merged] of [["A3", "A4"], ["B3", "B4"], ["C3", "C4"], ["D3", "E3"], ["F3", "G3"], ["H3", "I3"]]) {
      assert.equal(trialSheet.getCell(merged).master.address, anchor);
    }
    assert.equal(trialSheet.getCell("D5").value, 1);
    assert.equal(trialSheet.getCell("I7").value, 0);
    assert.equal(trialSheet.getCell("E5").value, 0);
    assert.equal(trialSheet.getCell("E5").numFmt, "0.00;-0.00;;@");
    assert.equal(trialSheet.getCell("D5").numFmt, "0.00;-0.00;;@");
    assert.equal(trialSheet.getCell("I7").numFmt, "0.00;-0.00;;@");
    assert.equal(trialSheet.getCell("A7").value, "合计");
    assert.equal(trialSheet.getCell("A8").value, null);

    destination = path.join(directory, "trial.pdf");
    assert.equal((await exportLedger(trialQuery, trial, "pdf")).ok, true);
    assert.match(pdfHtml, /<th rowspan="2">序号<\/th>/);
    for (const label of ["期初", "本期", "期末"]) assert.ok(pdfHtml.includes(`<th colspan="2">${label}</th>`));
    assert.match(pdfHtml, /<tr><th>借方<\/th><th>贷方<\/th><th>借方<\/th><th>贷方<\/th><th>借方<\/th><th>贷方<\/th><\/tr>/);
    assert.match(pdfHtml, /<td>库存现金<\/td><td>1\.00<\/td><td><\/td><td>3\.00<\/td><td>4\.00<\/td><td>5\.00<\/td><td><\/td>/);
    assert.match(pdfHtml, /<td>合计<\/td><td><\/td><td><\/td><td>1\.00<\/td><td><\/td><td>3\.00<\/td><td>4\.00<\/td><td>5\.00<\/td><td><\/td>/);
    assert.doesNotMatch(pdfHtml, /大写/);
  } finally {
    Module._load = original;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
