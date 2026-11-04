import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";
import { DatabaseService } from "./database";
import type { AppShellState, OpenBooksetPayload, TodoItem } from "../common/contracts";

let mainWindow: BrowserWindow | null = null;
let openedBookset: OpenBooksetPayload | null = null;
let dbService: DatabaseService;
let hasDatabaseBeforeBootstrap = false;

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1200,
    minHeight: 760,
    backgroundColor: "#f1f3f5",
    title: "OpenAccountancy",
    webPreferences: {
      preload: path.join(__dirname, "..", "preload", "index.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    window.loadURL(devServerUrl);
    window.webContents.openDevTools({ mode: "detach" });
  } else {
    window.loadFile(path.join(__dirname, "..", "..", "renderer", "index.html"));
  }

  return window;
}

function composeTodoItems(): TodoItem[] {
  if (!openedBookset) {
    return [];
  }

  return [
    { id: "pending-voucher-review", title: "待审核凭证", priority: "high" },
    { id: "pending-posting", title: "待过账凭证", priority: "medium" },
    { id: "pending-period-close", title: "待期末结账", priority: "high" }
  ];
}

function createShellState(): AppShellState {
  const activeBooksetLabel = openedBookset
    ? `${openedBookset.companyName} - ${openedBookset.fiscalPeriod}`
    : "未打开账套";

  return {
    appName: "OpenAccountancy",
    version: app.getVersion(),
    hasOpenedBookset: openedBookset !== null,
    activeBooksetLabel,
    todoItems: composeTodoItems()
  };
}

function registerIpcHandlers(): void {
  ipcMain.handle("app:ping", () => "pong");
  ipcMain.handle("app:entry-state", () => ({
    hasDatabase: hasDatabaseBeforeBootstrap,
    mode: hasDatabaseBeforeBootstrap ? "login" : "init"
  }));
  ipcMain.handle("app:shell-state", () => createShellState());

  ipcMain.handle("bookset:open", (_event, payload: OpenBooksetPayload) => {
    openedBookset = payload;
    dbService.addRecentBookset(payload.companyName, payload.fiscalPeriod);
    return createShellState();
  });

  ipcMain.handle("bookset:close", () => {
    openedBookset = null;
    return createShellState();
  });

  ipcMain.handle("bookset:recent", () => dbService.listRecentBooksets());
}

app.whenReady().then(() => {
  const dbPath = path.join(app.getPath("userData"), "data", "openaccountancy.db");
  hasDatabaseBeforeBootstrap = fs.existsSync(dbPath);
  dbService = new DatabaseService(dbPath);

  registerIpcHandlers();
  mainWindow = createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
