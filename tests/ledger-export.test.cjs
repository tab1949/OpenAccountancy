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
    const query = { kind: "general", from: { year: 2026, periodNo: 1 }, to: { year: 2026, periodNo: 1 }, includeUnposted: true };
    const result = { kind: "general", account: { code: "1001", name: "库存现金" }, balances: [],
      rows: [{ kind: "period", date: "2026-01", summary: "=1+1", debit: 12.34, credit: 0, direction: "借", balance: 12.34, unposted: true, unpostedVoucherNos: [1, 3] }] };
    destination = path.join(directory, "ledger.csv");
    assert.equal((await exportLedger(query, result, "csv")).ok, true);
    const csv = fs.readFileSync(destination, "utf8");
    assert.ok(csv.startsWith("\ufeff"));
    assert.match(csv, /"'=1\+1"/);
    assert.match(csv, /"12\.34"/);
    assert.match(csv, /"1 含未记账凭证: #1 #3"/);
    assert.match(csv, /包含未记账凭证/);
    destination = path.join(directory, "ledger.xlsx");
    assert.equal((await exportLedger(query, result, "xlsx")).ok, true);
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(destination);
    const sheet = workbook.getWorksheet("科目总账");
    assert.equal(sheet.getCell("D4").value, 12.34);
    assert.equal(sheet.getCell("C4").value, "=1+1");
    assert.equal(sheet.getCell("D4").numFmt, "0.00");
    assert.equal(sheet.getCell("A4").value, "1 含未记账凭证: #1 #3");
    result.rows[0].summary = "<script>alert(1)</script>";
    destination = path.join(directory, "ledger.pdf");
    assert.equal((await exportLedger(query, result, "pdf")).ok, true);
    assert.equal(fs.readFileSync(destination, "utf8"), "%PDF-test");
    assert.match(pdfHtml, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.match(pdfHtml, /<td>1 含未记账凭证: #1 #3<\/td>/);
    assert.equal(destroyed, true);

    for (const [cashierJournal, code, name, title] of [
      ["cash", "1001", "库存现金", "现金日记账"],
      ["bank", "1002", "银行存款", "银行存款日记账"]
    ]) {
      const cashierQuery = { ...query, kind: "journal", accountCode: code, cashierJournal };
      const cashierResult = { ...result, kind: "journal", account: { code, name },
        rows: result.rows.map((row) => ({ ...row, voucherNo: "" })) };
      destination = path.join(directory, `${cashierJournal}.csv`);
      await exportLedger(cashierQuery, cashierResult, "csv");
      const cashierCsv = fs.readFileSync(destination, "utf8");
      assert.match(cashierCsv, new RegExp(`"${title}"`));
      const cashierSubtitle = cashierCsv.split("\r\n")[1];
      assert.ok(!cashierSubtitle.includes(code));
      assert.ok(!cashierSubtitle.includes(name));
      destination = path.join(directory, `${cashierJournal}.xlsx`);
      await exportLedger(cashierQuery, cashierResult, "xlsx");
      const cashierWorkbook = new ExcelJS.Workbook();
      await cashierWorkbook.xlsx.readFile(destination);
      const cashierSheet = cashierWorkbook.getWorksheet(title);
      assert.equal(cashierSheet.getCell("A1").value, title);
      assert.ok(!cashierSheet.getCell("A2").value.includes(code));
      assert.ok(!cashierSheet.getCell("A2").value.includes(name));
      destination = path.join(directory, `${cashierJournal}.pdf`);
      await exportLedger(cashierQuery, cashierResult, "pdf");
      assert.ok(pdfHtml.includes(`<h1>${title}</h1>`));
      const pdfSubtitle = pdfHtml.match(/<p>(.*?)<\/p>/)[1];
      assert.ok(!pdfSubtitle.includes(code));
      assert.ok(!pdfSubtitle.includes(name));
    }

    const trialQuery = { ...query, kind: "trial-balance", includeUnposted: false };
    const trial = { kind: "trial-balance", rows: [], balances: [
      { code: "1001", name: "库存现金", category: "资产", level: 1, openingDebit: 1, openingCredit: 0, debit: 3, credit: 4, closingDebit: 5, closingCredit: 0 },
      { code: "100101", name: "备用金", category: "资产", level: 2, openingDebit: 1, openingCredit: 0, debit: 3, credit: 4, closingDebit: 5, closingCredit: 0 }
    ] };
    destination = path.join(directory, "trial.csv");
    assert.equal((await exportLedger(trialQuery, trial, "csv")).ok, true);
    const trialCsv = fs.readFileSync(destination, "utf8");
    assert.match(trialCsv, /"期初余额借方","期初余额贷方","本期发生额借方","本期发生额贷方","期末余额借方","期末余额贷方"/);
    assert.match(trialCsv, /"合计","","","1\.00","0\.00","3\.00","4\.00","5\.00","0\.00"/);
    assert.doesNotMatch(trialCsv, /大写/);

    destination = path.join(directory, "trial.xlsx");
    assert.equal((await exportLedger(trialQuery, trial, "xlsx")).ok, true);
    const trialWorkbook = new ExcelJS.Workbook();
    await trialWorkbook.xlsx.readFile(destination);
    const trialSheet = trialWorkbook.getWorksheet("科目余额表");
    assert.deepEqual(["A3", "B3", "C3", "D3", "F3", "H3"].map((cell) => trialSheet.getCell(cell).value),
      ["序号", "科目编码", "科目名称", "期初余额", "本期发生额", "期末余额"]);
    assert.deepEqual(["D4", "E4", "F4", "G4", "H4", "I4"].map((cell) => trialSheet.getCell(cell).value),
      ["借方", "贷方", "借方", "贷方", "借方", "贷方"]);
    for (const [anchor, merged] of [["A3", "A4"], ["B3", "B4"], ["C3", "C4"], ["D3", "E3"], ["F3", "G3"], ["H3", "I3"]]) {
      assert.equal(trialSheet.getCell(merged).master.address, anchor);
    }
    assert.equal(trialSheet.getCell("D5").value, 1);
    assert.equal(trialSheet.getCell("B6").value, "  100101");
    assert.equal(trialSheet.getCell("C6").value, "  备用金");
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
    for (const label of ["期初余额", "本期发生额", "期末余额"]) assert.ok(pdfHtml.includes(`<th colspan="2">${label}</th>`));
    assert.match(pdfHtml, /<tr><th>借方<\/th><th>贷方<\/th><th>借方<\/th><th>贷方<\/th><th>借方<\/th><th>贷方<\/th><\/tr>/);
    assert.match(pdfHtml, /<td>库存现金<\/td><td>1\.00<\/td><td><\/td><td>3\.00<\/td><td>4\.00<\/td><td>5\.00<\/td><td><\/td>/);
    assert.match(pdfHtml, /white-space:pre-wrap/);
    assert.match(pdfHtml, /<td>  100101<\/td><td>  备用金<\/td>/);
    assert.match(trialCsv, /"  100101","  备用金"/);
    assert.match(pdfHtml, /<td>合计<\/td><td><\/td><td><\/td><td>1\.00<\/td><td><\/td><td>3\.00<\/td><td>4\.00<\/td><td>5\.00<\/td><td><\/td>/);
    assert.doesNotMatch(pdfHtml, /大写/);

    const closingQuery = { ...trialQuery, closingReport: "trial-balance" };
    destination = path.join(directory, "closing.csv");
    assert.equal((await exportLedger(closingQuery, trial, "csv")).ok, true);
    const closingCsv = fs.readFileSync(destination, "utf8");
    assert.match(closingCsv, /"试算平衡表"/);
    assert.equal(closingCsv.split("\r\n")[1], '"2026年01期"');
    assert.match(closingCsv, /"期初余额借方","期初余额贷方","本期发生额借方","本期发生额贷方","期末余额借方","期末余额贷方"/);
    assert.match(closingCsv, /"合计","","","1\.00","0\.00","3\.00","4\.00","5\.00","0\.00"/);
    destination = path.join(directory, "closing.xlsx");
    assert.equal((await exportLedger(closingQuery, trial, "xlsx")).ok, true);
    const closingWorkbook = new ExcelJS.Workbook();
    await closingWorkbook.xlsx.readFile(destination);
    const closingSheet = closingWorkbook.getWorksheet("试算平衡表");
    assert.deepEqual(["D3", "F3", "H3"].map((cell) => closingSheet.getCell(cell).value), ["期初余额", "本期发生额", "期末余额"]);
    assert.equal(closingSheet.getCell("A2").value, "2026年01期");
    assert.equal(closingSheet.getCell("E5").numFmt, "0.00;-0.00;;@");
    destination = path.join(directory, "closing.pdf");
    assert.equal((await exportLedger(closingQuery, trial, "pdf")).ok, true);
    assert.match(pdfHtml, /<h1>试算平衡表<\/h1><p>2026年01期<\/p>/);
    for (const label of ["期初余额", "本期发生额", "期末余额"]) assert.ok(pdfHtml.includes(`<th colspan="2">${label}</th>`));

    destination = path.join(directory, "closing-balance.csv");
    assert.equal((await exportLedger({ ...trialQuery, closingReport: "account-balance" }, trial, "csv")).ok, true);
    const closingBalanceCsv = fs.readFileSync(destination, "utf8");
    assert.match(closingBalanceCsv, /"科目余额表"/);
    assert.equal(closingBalanceCsv.split("\r\n")[1], '"2026年01期"');
    assert.match(closingBalanceCsv, /"期初余额借方","期初余额贷方","本期发生额借方","本期发生额贷方","期末余额借方","期末余额贷方"/);
    destination = path.join(directory, "closing-balance.xlsx");
    const closingBalanceQuery = { ...trialQuery, closingReport: "account-balance" };
    assert.equal((await exportLedger(closingBalanceQuery, trial, "xlsx")).ok, true);
    const closingBalanceWorkbook = new ExcelJS.Workbook();
    await closingBalanceWorkbook.xlsx.readFile(destination);
    const closingBalanceSheet = closingBalanceWorkbook.getWorksheet("科目余额表");
    assert.deepEqual(["D3", "F3", "H3"].map((cell) => closingBalanceSheet.getCell(cell).value), ["期初余额", "本期发生额", "期末余额"]);
    destination = path.join(directory, "closing-balance.pdf");
    assert.equal((await exportLedger(closingBalanceQuery, trial, "pdf")).ok, true);
    for (const label of ["期初余额", "本期发生额", "期末余额"]) assert.ok(pdfHtml.includes(`<th colspan="2">${label}</th>`));

    const summaryQuery = { ...trialQuery, closingReport: "account-summary" };
    const summaryResult = { ...trial, balances: [...trial.balances,
      { code: "2202", name: "应付账款", category: "负债", level: 1, openingDebit: 0, openingCredit: 0, debit: 0, credit: 8, closingDebit: 0, closingCredit: 0 }
    ] };
    destination = path.join(directory, "summary.csv");
    assert.equal((await exportLedger(summaryQuery, summaryResult, "csv")).ok, true);
    const summaryCsv = fs.readFileSync(destination, "utf8");
    assert.match(summaryCsv, /"科目汇总表"/);
    assert.match(summaryCsv, /"科目名称","借方发生额","贷方发生额","科目名称","借方发生额","贷方发生额"/);
    assert.match(summaryCsv, /"1\.资产类","","","2\.负债类","",""/);
    assert.match(summaryCsv, /"1001 库存现金","3\.00","4\.00","2202 应付账款","0\.00","8\.00"/);
    assert.match(summaryCsv, /"  100101   备用金","3\.00","4\.00","","",""/);
    assert.match(summaryCsv, /"合计","3\.00","4\.00","合计","0\.00","8\.00"/);
    destination = path.join(directory, "summary.xlsx");
    assert.equal((await exportLedger(summaryQuery, summaryResult, "xlsx")).ok, true);
    const summaryWorkbook = new ExcelJS.Workbook();
    await summaryWorkbook.xlsx.readFile(destination);
    const summarySheet = summaryWorkbook.getWorksheet("科目汇总表");
    assert.deepEqual(["A3", "B3", "C3", "D3", "E3", "F3"].map((cell) => summarySheet.getCell(cell).value),
      ["科目名称", "借方发生额", "贷方发生额", "科目名称", "借方发生额", "贷方发生额"]);
    assert.deepEqual(["A4", "D4", "A5", "D5"].map((cell) => summarySheet.getCell(cell).value),
      ["1.资产类", "2.负债类", "1001 库存现金", "2202 应付账款"]);
    assert.equal(summarySheet.getCell("A6").value, "  100101   备用金");
    assert.deepEqual(["A7", "B7", "C7", "D7", "E7", "F7"].map((cell) => summarySheet.getCell(cell).value),
      ["合计", 3, 4, "合计", 0, 8]);
    assert.match(summarySheet.getCell("A2").value, /各栏合计仅统计本栏总账科目/);
    destination = path.join(directory, "summary.pdf");
    assert.equal((await exportLedger(summaryQuery, summaryResult, "pdf")).ok, true);
    assert.match(pdfHtml, /<h1>科目汇总表<\/h1>/);
    assert.match(pdfHtml, /<tr><th>科目名称<\/th><th>借方发生额<\/th><th>贷方发生额<\/th><th>科目名称<\/th><th>借方发生额<\/th><th>贷方发生额<\/th><\/tr>/);
    assert.match(pdfHtml, /<td>1\.资产类<\/td><td><\/td><td><\/td><td>2\.负债类<\/td>/);
    assert.match(pdfHtml, /<td>1001 库存现金<\/td><td>3\.00<\/td><td>4\.00<\/td><td>2202 应付账款<\/td>/);
    assert.match(pdfHtml, /<td>合计<\/td><td>3\.00<\/td><td>4\.00<\/td><td>合计<\/td><td><\/td><td>8\.00<\/td>/);
    for (const format of ["csv", "xlsx", "pdf"]) {
      destination = path.join(directory, `custom-indent.${format}`);
      assert.equal((await exportLedger(summaryQuery, summaryResult, format, undefined, "→")).ok, true);
      if (format === "csv") assert.match(fs.readFileSync(destination, "utf8"), /"→100101 →备用金"/);
      if (format === "xlsx") {
        const workbook = new ExcelJS.Workbook();
        await workbook.xlsx.readFile(destination);
        assert.equal(workbook.getWorksheet("科目汇总表").getCell("A6").value, "→100101 →备用金");
      }
      if (format === "pdf") assert.match(pdfHtml, /<td>→100101 →备用金<\/td>/);
    }
    for (const closingReport of ["trial-balance", "account-balance", "account-summary"]) {
      const markedQuery = { ...trialQuery, closingReport, includeUnposted: true };
      const markedResult = { ...summaryResult, balances: summaryResult.balances.map((row) =>
        row.code === "1001" ? { ...row, unposted: true, unpostedMovement: true } : row) };
      const title = closingReport === "trial-balance" ? "试算平衡表" : closingReport === "account-balance" ? "科目余额表" : "科目汇总表";
      for (const format of ["csv", "xlsx", "pdf"]) {
        destination = path.join(directory, `marked-${closingReport}.${format}`);
        assert.equal((await exportLedger(markedQuery, markedResult, format)).ok, true);
        if (format === "csv") assert.match(fs.readFileSync(destination, "utf8"), /库存现金（含未记账凭证）/);
        if (format === "pdf") assert.match(pdfHtml, /<td class="unposted">(?:1001 )?库存现金（含未记账凭证）<\/td>/);
        if (format === "xlsx") {
          const workbook = new ExcelJS.Workbook();
          await workbook.xlsx.readFile(destination);
          const markedSheet = workbook.getWorksheet(title);
          const cell = markedSheet.getCell(closingReport === "account-summary" ? "A5" : "C5");
          assert.match(cell.value, /库存现金（含未记账凭证）/);
          assert.equal(cell.font.color.argb, "FFC00000");
        }
      }
    }
  } finally {
    Module._load = original;
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
