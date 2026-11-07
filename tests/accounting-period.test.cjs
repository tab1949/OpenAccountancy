const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const Database = require("better-sqlite3");
const { ensureBooksetSettingsSchema, getCurrentAccountingPeriod, selectAccountingDate } = require("../dist/electron/main/booksetSettings.js");

test("accounting date follows configured periods and survives reopening", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "openaccountancy-period-"));
  const file = path.join(directory, "bookset.sqlite");
  let db = new Database(file);
  try {
    db.exec("CREATE TABLE bookset_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    ensureBooksetSettingsSchema(db);
    const insert = db.prepare("INSERT INTO fiscal_periods (fiscal_year, period_no, start_date, end_date) VALUES (?, ?, ?, ?)");
    insert.run(2026, 1, "2026-01-20", "2026-02-19");
    insert.run(2026, 2, "2026-02-20", "2026-03-19");

    assert.equal(selectAccountingDate(db, "2026-02-01").ok, true);
    assert.deepEqual(getCurrentAccountingPeriod(db), {
      date: "2026-02-01", year: 2026, periodNo: 1, startDate: "2026-01-20", endDate: "2026-02-19", status: "open"
    });
    db.prepare("UPDATE fiscal_periods SET status = 'closed' WHERE fiscal_year = ? AND period_no = ?").run(2026, 1);
    assert.equal(getCurrentAccountingPeriod(db).status, "closed");
    assert.equal(selectAccountingDate(db, "2026-02-20").ok, true);
    db.close();
    db = new Database(file);
    assert.equal(getCurrentAccountingPeriod(db).date, "2026-02-20");
    assert.equal(getCurrentAccountingPeriod(db).periodNo, 2);
    assert.equal(getCurrentAccountingPeriod(db).status, "open");
    assert.equal(selectAccountingDate(db, "2026-02-01").ok, true);
    assert.equal(getCurrentAccountingPeriod(db).status, "closed");
    assert.equal(selectAccountingDate(db, "2026-02-20").ok, true);

    for (const date of ["2026-02-30", "2026-04-01", "not-a-date"]) {
      assert.equal(selectAccountingDate(db, date).ok, false);
      assert.equal(getCurrentAccountingPeriod(db).date, "2026-02-20");
    }
    insertOverlap(db);
    assert.equal(selectAccountingDate(db, "2026-02-25").ok, false);
    assert.equal(getCurrentAccountingPeriod(db).date, "2026-02-20");
  } finally {
    db.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

function insertOverlap(db) {
  db.prepare("INSERT INTO fiscal_periods (fiscal_year, period_no, start_date, end_date) VALUES (?, ?, ?, ?)")
    .run(2027, 1, "2026-02-24", "2026-03-24");
}