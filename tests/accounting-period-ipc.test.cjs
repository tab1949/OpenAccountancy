const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Module = require("node:module");

test("preload IPC selects accounting date and displays book name and code", async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "openaccountancy-ipc-"));
  const handlers = new Map();
  let api;
  let service;
  const originalLoad = Module._load;
  const originalInterval = global.setInterval;
  const databaseModule = require("../dist/electron/main/database.js");
  const OriginalDatabaseService = databaseModule.DatabaseService;
  databaseModule.DatabaseService = class extends OriginalDatabaseService {
    constructor(...args) {
      super(...args);
      service = this;
    }
  };
  const electron = {
    app: {
      whenReady: () => Promise.resolve(),
      getPath: () => directory,
      getVersion: () => "test",
      on: () => {},
      quit: () => {}
    },
    BrowserWindow: class {
      static getAllWindows() { return []; }
      static getFocusedWindow() { return null; }
      constructor() { this.webContents = { openDevTools() {} }; }
      loadFile() {}
      loadURL() {}
    },
    ipcMain: { handle: (name, handler) => handlers.set(name, handler) },
    ipcRenderer: { invoke: async (name, ...args) => handlers.get(name)({}, ...args) },
    contextBridge: { exposeInMainWorld: (_name, value) => { api = value; } },
    dialog: {}
  };
  Module._load = function (request, parent, isMain) {
    return request === "electron" ? electron : originalLoad.call(this, request, parent, isMain);
  };
  global.setInterval = () => ({ unref() {} });
  try {
    require("../dist/electron/main/main.js");
    await new Promise((resolve) => setImmediate(resolve));
    require("../dist/electron/preload/index.js");
    const initialized = await api.initSystem({
      dbStoragePath: directory,
      adminUserName: "admin",
      adminPassword: "password",
      securityQuestions: [1, 2, 3].map((number) => ({ question: `question${number}`, answer: `answer${number}` }))
    });
    assert.equal(initialized.ok, true);
    assert.equal((await api.login({ userName: "admin", password: "password" })).ok, true);
    const created = await api.createBookset({
      name: "测试公司", bookCode: "TEST000001", accountingStandard: "ASBE_2006",
      fiscalYear: 2026, fiscalPeriodNo: 11, baseCurrency: "CNY"
    });
    assert.equal(created.ok, true, created.message);
    assert.equal((await api.getShellState()).activeBooksetLabel, "测试公司(TEST000001)");
    const selected = await api.selectAccountingDate("2026-12-05");
    assert.equal(selected.ok, true, selected.message);
    const shell = await api.getShellState();
    assert.equal(shell.activeBooksetLabel, "测试公司(TEST000001)");
    assert.equal(shell.currentAccountingPeriod.date, "2026-12-05");
    assert.equal(shell.currentAccountingPeriod.periodNo, 12);
    assert.equal(shell.currentAccountingPeriod.status, "open");
    const accounts = await api.listChartAccounts();
    assert.ok(accounts.some((account) => account.code === "1001" && account.category === "资产"));
    const lines = [
      { lineNo: 1, summary: "备用金", accountCode: "1001", accountName: "库存现金", detail: "备用金", debit: 10, credit: 0 },
      { lineNo: 2, summary: "付款", accountCode: "1002", accountName: "银行存款", detail: "", debit: 0, credit: 10 },
      ...Array.from({ length: 9 }, (_, index) => ({ lineNo: index + 3, summary: "", accountCode: "", accountName: "", detail: "", debit: 0, credit: 0 }))
    ];
    const saved = await api.saveVoucher({ voucherDate: "2026-11-05", lines, attachments: [] });
    assert.equal(saved.ok, true, saved.message);
    assert.equal((await api.postVouchers({ voucherIds: [saved.voucherId] })).ok, false);
    assert.equal((await api.listUnmappedDetails([saved.voucherId])).length, 1);
    const newAccount = await api.createAccountForVoucherDetail("1001", "备用金", { parentCode: "1001", code: "100101", name: "备用金", category: "资产", direction: "借或贷" });
    assert.equal(newAccount.ok, true, newAccount.message);
    assert.equal((await api.listChartAccounts()).find((account) => account.code === "100101").direction, "借或贷");
    assert.ok((await api.listVoucherAccounts()).find((account) => account.accountCode === "1001").detailSuggestions.includes("备用金"));
    assert.equal((await api.listUnmappedDetails([saved.voucherId])).length, 0);
    assert.equal((await api.postVouchers({ voucherIds: [saved.voucherId] })).affectedCount, 1);
    const ledger = await api.queryLedger({ kind: "subsidiary", from: { year: 2026, periodNo: 11 }, to: { year: 2026, periodNo: 11 }, accountCode: "100101" });
    assert.equal(ledger.rows.find((row) => row.kind === "entry").debit, 10);
    const trial = await api.queryLedger({ kind: "trial-balance", from: { year: 2026, periodNo: 11 }, to: { year: 2026, periodNo: 11 }, rootsOnly: true });
    assert.equal(trial.balances.find((row) => row.code === "1002").closingCredit, 10);
    assert.equal((await api.unpostVouchers({ voucherIds: [saved.voucherId] })).affectedCount, 1);
    assert.equal((await api.getVoucher(saved.voucherId)).status, "draft");
    const afterUnpost = await api.queryLedger({ kind: "trial-balance", from: { year: 2026, periodNo: 11 }, to: { year: 2026, periodNo: 11 }, rootsOnly: true });
    assert.equal(afterUnpost.balances.find((row) => row.code === "1002").closingCredit, 0);
    assert.equal((await api.postVouchers({ voucherIds: [saved.voucherId] })).affectedCount, 1);
    const later = await api.saveVoucher({ voucherDate: "2026-11-06", lines, attachments: [] });
    assert.equal(later.ok, true, later.message);
    assert.deepEqual(await api.listUnmappedDetails([later.voucherId]), []);
    assert.equal((await api.postVouchers({ voucherIds: [later.voucherId] })).affectedCount, 1);
    const closed = await api.closeFiscalPeriod(2026, 11);
    assert.equal(closed.ok, true, closed.message);
    assert.equal((await api.unpostVouchers({ voucherIds: [saved.voucherId] })).ok, false);
    assert.equal((await api.getVoucher(saved.voucherId)).status, "posted");
    assert.equal((await api.getShellState()).currentAccountingPeriod.status, "open");
    assert.equal((await api.selectAccountingDate("2026-11-05")).ok, true);
    const closedPeriod = (await api.getShellState()).currentAccountingPeriod;
    assert.equal(closedPeriod.periodNo, 11);
    assert.equal(closedPeriod.status, "closed");
    assert.equal((await api.selectAccountingDate("2026-12-05")).ok, true);
    assert.equal((await api.getShellState()).currentAccountingPeriod.status, "open");
    assert.equal((await api.selectAccountingDate("2027-01-01")).ok, false);
    assert.equal((await api.getShellState()).currentAccountingPeriod.date, "2026-12-05");
    const closedCurrent = await api.closeFiscalPeriod(2026, 12);
    assert.equal(closedCurrent.ok, true, closedCurrent.message);
    const nextPeriod = (await api.getShellState()).currentAccountingPeriod;
    assert.equal(nextPeriod.year, 2027);
    assert.equal(nextPeriod.periodNo, 1);
    assert.equal(nextPeriod.status, "open");
    assert.equal((await api.selectAccountingDate("2026-12-05")).ok, true);
    assert.equal((await api.getShellState()).currentAccountingPeriod.status, "closed");
  } finally {
    Module._load = originalLoad;
    global.setInterval = originalInterval;
    databaseModule.DatabaseService = OriginalDatabaseService;
    service?.db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});