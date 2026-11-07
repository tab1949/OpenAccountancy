import fs from "node:fs/promises";
import { BrowserWindow, dialog } from "electron";
import ExcelJS from "exceljs";
import { formatLedgerCell, ledgerTable } from "../common/ledgerTable";
import type { LedgerExportFormat, LedgerQuery, LedgerResult, OperationResult } from "../common/contracts";

const titles = { general: "科目总账", subsidiary: "科目明细账", journal: "科目日记账", "trial-balance": "科目余额表" };

function description(query: LedgerQuery, result: LedgerResult): string {
  const period = (year: number, number: number): string => `${String(year).padStart(4, "0")}年${String(number).padStart(2, "0")}期`;
  return `${period(query.from.year, query.from.periodNo)} - ${period(query.to.year, query.to.periodNo)}${result.account ? `　${result.account.code} ${result.account.name}` : ""}`;
}

function csvCell(value: string | number): string {
  const text = typeof value === "number" ? value.toFixed(2) : value;
  const safe = typeof value === "string" && /^[\s]*[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

function html(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export async function exportLedger(query: LedgerQuery, result: LedgerResult, format: LedgerExportFormat, owner?: BrowserWindow): Promise<OperationResult> {
  const title = titles[result.kind];
  const options = { defaultPath: `${title}.${format}`, filters: [{ name: format.toUpperCase(), extensions: [format] }] };
  const choice = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options);
  if (choice.canceled || !choice.filePath) return { ok: false, message: "已取消导出。" };
  const destination = choice.filePath.toLowerCase().endsWith(`.${format}`) ? choice.filePath : `${choice.filePath}.${format}`;
  const table = ledgerTable(result);
  const subtitle = description(query, result);
  if (format === "csv") {
    const lines = [[title], [subtitle], table.headers, ...table.rows.map((row) => row.cells)];
    await fs.writeFile(destination, `\ufeff${lines.map((row) => row.map(csvCell).join(",")).join("\r\n")}\r\n`, "utf8");
  } else if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet(title);
    sheet.addRow([title]);
    sheet.addRow([subtitle]);
    const occupied: boolean[][] = [];
    table.headerRows.forEach((row, rowIndex) => {
      const sheetRow = rowIndex + 3;
      occupied[rowIndex] ??= [];
      let column = 0;
      for (const cell of row) {
        while (occupied[rowIndex]![column]) column += 1;
        const colSpan = cell.colSpan ?? 1;
        const rowSpan = cell.rowSpan ?? 1;
        sheet.getCell(sheetRow, column + 1).value = cell.label;
        if (rowSpan > 1 || colSpan > 1) sheet.mergeCells(sheetRow, column + 1, sheetRow + rowSpan - 1, column + colSpan);
        for (let r = rowIndex; r < rowIndex + rowSpan; r += 1) {
          occupied[r] ??= [];
          for (let c = column; c < column + colSpan; c += 1) occupied[r]![c] = true;
        }
        column += colSpan;
      }
    });
    for (const row of table.rows) {
      const excelRow = sheet.addRow(row.cells);
      if (row.kind === "period" || row.kind === "year") {
        excelRow.eachCell((cell) => {
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: row.kind === "period" ? "FFFCE8E8" : "FFE7F1FF" } };
        });
      }
      excelRow.eachCell((cell) => {
        if (typeof cell.value === "number") cell.numFmt = result.kind === "trial-balance" ? '0.00;-0.00;;@' : "0.00";
      });
    }
    sheet.columns.forEach((column) => { column.width = 18; });
    await workbook.xlsx.writeFile(destination);
  } else {
    const renderCell = (value: string | number): string => html(formatLedgerCell(value, result.kind));
    const markup = `<!doctype html><html><head><meta charset="utf-8"><style>
      body{font-family:"Microsoft YaHei",sans-serif;font-size:10px} h1{font-size:18px} table{width:100%;border-collapse:collapse}
      th,td{border:1px solid #777;padding:4px;text-align:left;overflow-wrap:anywhere} .period{background:#fce8e8}.year{background:#e7f1ff}
      thead{display:table-header-group} tr{break-inside:avoid}
      </style></head><body><h1>${html(title)}</h1><p>${html(subtitle)}</p><table><thead>${table.headerRows.map((row) => `<tr>${row.map((cell) => `<th${cell.colSpan ? ` colspan="${cell.colSpan}"` : ""}${cell.rowSpan ? ` rowspan="${cell.rowSpan}"` : ""}>${html(cell.label)}</th>`).join("")}</tr>`).join("")}</thead>
      <tbody>${table.rows.map((row) => `<tr class="${html(row.kind)}">${row.cells.map((cell) => `<td>${renderCell(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></body></html>`;
    const window = new BrowserWindow({ show: false, webPreferences: { javascript: false, contextIsolation: true, sandbox: true } });
    try {
      await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(markup)}`);
      const pdf = await window.webContents.printToPDF({ printBackground: true, landscape: result.kind === "trial-balance" });
      await fs.writeFile(destination, pdf);
    } finally {
      window.destroy();
    }
  }
  return { ok: true, message: `已导出至 ${destination}` };
}
