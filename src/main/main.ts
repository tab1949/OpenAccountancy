import fs from "node:fs";
import path from "node:path";
import { gzipSync, gunzipSync } from "node:zlib";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import type { OpenDialogOptions, SaveDialogOptions } from "electron";
import Database from "better-sqlite3";
import { DatabaseService } from "./database";
import { loadStandardSubjects } from "./accountingSubjects";
import {
  addFiscalYear,
  closeFiscalPeriod,
  ensureBooksetSettingsSchema,
  getBooksetSettings,
  initializeBooksetSettings,
  saveBooksetSettings,
  updateFiscalPeriod
} from "./booksetSettings";
import {
  deleteVoucher,
  ensureVoucherSchema,
  getVoucher,
  getVoucherDetailSuggestions,
  listVoucherAccounts,
  postVouchers,
  saveVoucher,
  searchVouchers
} from "./vouchers";
import type {
  AppShellState,
  AuthSession,
  BackupBooksetPayload,
  BookkeepingPayload,
  BooksetSettings,
  BooksetOperationResult,
  BooksetSummary,
  ChangeOwnPasswordPayload,
  CreateBooksetPayload,
  CreateUserPayload,
  DeleteUserPayload,
  ExportBooksetPackagePayload,
  InitSystemPayload,
  ImportBooksetPackagePayload,
  LoginPayload,
  OpenBooksetByIdPayload,
  RecoverAccountPayload,
  RestoreBooksetBackupPayload,
  SaveBooksetSettingsPayload,
  SystemEntryState,
  TodoItem,
  UpdateUserPayload,
  UpdateFiscalPeriodPayload,
  VoucherInput,
  VoucherSearchPayload
} from "../common/contracts";

let mainWindow: BrowserWindow | null = null;
let openedBookset: BooksetSummary | null = null;
let dbService: DatabaseService;
let hasDatabaseBeforeBootstrap = false;
let systemDbFilePath = "";
let backupTimer: NodeJS.Timeout | null = null;
let currentAuthSession: AuthSession = {
  isAuthenticated: false,
  userId: null,
  userName: "",
  displayName: "",
  role: null,
  permissions: []
};

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

function sanitizeSegment(input: string): string {
  const normalized = input.trim().toLowerCase().replace(/\s+/g, "_");
  const sanitized = normalized.replace(/[^a-z0-9_-]/g, "_");
  return sanitized.replace(/_+/g, "_").replace(/^_+|_+$/g, "") || "bookset";
}

function buildBooksetDbFileName(name: string, fiscalPeriod: string): string {
  return `${sanitizeSegment(name)}_${sanitizeSegment(fiscalPeriod)}.sqlite`;
}

function ensureUniqueFilePath(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    return filePath;
  }

  const parsed = path.parse(filePath);
  return path.join(parsed.dir, `${parsed.name}_${Date.now()}${parsed.ext}`);
}

function ensureBooksetSchema(dbFilePath: string, booksetName: string, fiscalPeriod: string): void {
  const db = new Database(dbFilePath);
  const now = new Date().toISOString();
  db.exec(`
    CREATE TABLE IF NOT EXISTS bookset_meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ledgers (
      ledger_id INTEGER PRIMARY KEY AUTOINCREMENT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reports (
      report_id INTEGER PRIMARY KEY AUTOINCREMENT,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  db.prepare("INSERT OR REPLACE INTO bookset_meta (key, value) VALUES (?, ?)").run("bookset_name", booksetName);
  db.prepare("INSERT OR REPLACE INTO bookset_meta (key, value) VALUES (?, ?)").run("fiscal_period", fiscalPeriod);
  db.prepare("INSERT OR REPLACE INTO bookset_meta (key, value) VALUES (?, ?)").run("schema_version", "1");
  db.prepare("INSERT OR IGNORE INTO bookset_meta (key, value) VALUES (?, ?)").run("created_at", now);
  db.prepare("INSERT OR REPLACE INTO bookset_meta (key, value) VALUES (?, ?)").run("updated_at", now);
  ensureVoucherSchema(db);
  ensureBooksetSettingsSchema(db);
  db.close();
}

function readBooksetMeta(dbFilePath: string): { name: string; fiscalPeriod: string; bookCode?: string } {
  const fallback = { name: path.parse(dbFilePath).name, fiscalPeriod: "未设置期间" };

  try {
    const db = new Database(dbFilePath, { readonly: true, fileMustExist: true });
    const rows = db
      .prepare("SELECT key, value FROM bookset_meta WHERE key IN ('bookset_name', 'fiscal_period', 'book_code')")
      .all() as Array<{ key: string; value: string }>;
    db.close();

    const name = rows.find((item) => item.key === "bookset_name")?.value ?? fallback.name;
    const fiscalPeriod = rows.find((item) => item.key === "fiscal_period")?.value ?? fallback.fiscalPeriod;
    const bookCode = rows.find((item) => item.key === "book_code")?.value;
    return { name, fiscalPeriod, bookCode };
  } catch {
    return fallback;
  }
}

interface BooksetPackageV1 {
  version: 1;
  name: string;
  fiscalPeriod: string;
  sqliteFileName: string;
  exportedAt: string;
  sqliteBase64: string;
}

function writeBooksetPackage(bookset: BooksetSummary, destinationPath: string): void {
  if (!fs.existsSync(bookset.filePath)) {
    throw new Error("账套数据库文件不存在，无法打包。");
  }

  const raw = fs.readFileSync(bookset.filePath);
  const payload: BooksetPackageV1 = {
    version: 1,
    name: bookset.name,
    fiscalPeriod: bookset.fiscalPeriod,
    sqliteFileName: path.basename(bookset.filePath),
    exportedAt: new Date().toISOString(),
    sqliteBase64: raw.toString("base64")
  };

  const packed = gzipSync(Buffer.from(JSON.stringify(payload), "utf-8"));
  fs.mkdirSync(path.dirname(destinationPath), { recursive: true });
  fs.writeFileSync(destinationPath, packed);
}

function markBackupCompleted(bookset: BooksetSummary): void {
  if (fs.existsSync(bookset.filePath)) {
    const db = new Database(bookset.filePath);
    try {
      const row = db.prepare("SELECT setting_value FROM bookset_settings WHERE setting_key = 'backup'").get() as { setting_value: string } | undefined;
      if (row) {
        const backup = JSON.parse(row.setting_value) as Record<string, unknown>;
        backup.lastBackupAt = new Date().toISOString();
        db.prepare("UPDATE bookset_settings SET setting_value = ? WHERE setting_key = 'backup'").run(JSON.stringify(backup));
      }
    } finally {
      db.close();
    }
  }
}

function createSafetySnapshot(bookset: BooksetSummary, reason: string): string {
  const backupDirectory = path.join(app.getPath("userData"), "backups");
  fs.mkdirSync(backupDirectory, { recursive: true });
  const safeName = sanitizeSegment(bookset.name);
  const destination = path.join(backupDirectory, `${safeName}-${reason}-${Date.now()}.oabk`);
  writeBooksetPackage(bookset, destination);
  markBackupCompleted(bookset);
  return destination;
}

function runScheduledBackups(): void {
  const now = new Date();
  const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  for (const bookset of dbService.listBooksets()) {
    if (!fs.existsSync(bookset.filePath)) continue;
    const db = new Database(bookset.filePath);
    try {
      const row = db.prepare("SELECT setting_value FROM bookset_settings WHERE setting_key = 'backup'").get() as { setting_value: string } | undefined;
      if (!row) continue;
      const backup = JSON.parse(row.setting_value) as { path?: string; frequencyDays?: number; time?: string; lastBackupAt?: string };
      if (!backup.path?.trim() || backup.time !== time || !Number.isInteger(backup.frequencyDays) || (backup.frequencyDays ?? 0) < 1) continue;
      const lastAt = backup.lastBackupAt ? Date.parse(backup.lastBackupAt) : 0;
      if (lastAt && now.getTime() - lastAt < (backup.frequencyDays! * 86_400_000)) continue;

      fs.mkdirSync(backup.path, { recursive: true });
      const fileName = `${sanitizeSegment(bookset.name)}-${now.toISOString().replace(/[:.]/g, "-")}.oabk`;
      writeBooksetPackage(bookset, path.join(backup.path, fileName));
      backup.lastBackupAt = now.toISOString();
      db.prepare("UPDATE bookset_settings SET setting_value = ? WHERE setting_key = 'backup'").run(JSON.stringify(backup));
    } catch (error) {
      console.error(`自动备份账套失败（${bookset.name}）：`, error);
    } finally {
      db.close();
    }
  }
}

function readBooksetPackage(packagePath: string): BooksetPackageV1 {
  if (!fs.existsSync(packagePath)) {
    throw new Error("压缩包文件不存在。");
  }

  const packed = fs.readFileSync(packagePath);
  const json = gunzipSync(packed).toString("utf-8");
  const payload = JSON.parse(json) as BooksetPackageV1;

  if (payload.version !== 1 || !payload.sqliteBase64) {
    throw new Error("不支持的账套压缩包格式。");
  }

  return payload;
}

function ensurePackageExtension(filePath: string): string {
  return filePath.endsWith(".oabk") ? filePath : `${filePath}.oabk`;
}

function resolveBooksetDirectory(): string {
  if (!systemDbFilePath.trim()) {
    throw new Error("系统数据库路径未就绪，请重启后重试。");
  }

  return path.dirname(systemDbFilePath);
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

function toEntryState(): SystemEntryState {
  const initialized = dbService.isInitialized();
  return {
    hasDatabase: hasDatabaseBeforeBootstrap,
    mode: initialized ? "login" : "init",
    initialized
  };
}

function ensureAuthenticated(): { ok: true } | { ok: false; message: string } {
  if (!currentAuthSession.isAuthenticated || currentAuthSession.userId === null) {
    return { ok: false, message: "请先登录。" };
  }
  return { ok: true };
}

function ensureAdministrator(): { ok: true } | { ok: false; message: string } {
  if (!currentAuthSession.isAuthenticated || currentAuthSession.role !== "admin") {
    return { ok: false, message: "此操作仅限管理员执行。" };
  }
  return { ok: true };
}

function withActiveBookset<T>(operation: (db: Database.Database) => T): T | null {
  if (!openedBookset || !fs.existsSync(openedBookset.filePath)) {
    return null;
  }

  const db = new Database(openedBookset.filePath);
  db.pragma("foreign_keys = ON");
  try {
    const standard = db.prepare("SELECT value FROM bookset_meta WHERE key = 'accounting_standard_code'").get() as { value: string } | undefined;
    ensureVoucherSchema(db, loadStandardSubjects(standard?.value ?? "ASBE_2006"));
    return operation(db);
  } finally {
    db.close();
  }
}

function createShellState(): AppShellState {
  const activeBooksetLabel = openedBookset
    ? `${openedBookset.name} - ${openedBookset.fiscalPeriod}`
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
  ipcMain.handle("app:entry-state", () => toEntryState());
  ipcMain.handle("app:shell-state", () => createShellState());

  ipcMain.handle("auth:init-system", (_event, payload: InitSystemPayload) => {
    return dbService.initSystem(payload);
  });

  ipcMain.handle("auth:login", (_event, payload: LoginPayload) => {
    const result = dbService.login(payload.userName, payload.password);
    if (result.ok && result.user) {
      currentAuthSession = {
        isAuthenticated: true,
        userId: result.user.userId,
        userName: result.user.userName,
        displayName: result.user.displayName,
        role: result.user.role,
        permissions: result.user.permissions
      };
    }

    return {
      ok: result.ok,
      message: result.message,
      remainingAttempts: result.remainingAttempts
    };
  });

  ipcMain.handle("auth:logout", () => {
    if (openedBookset) {
      dbService.closeBooksetById(openedBookset.id);
    }
    openedBookset = null;
    currentAuthSession = {
      isAuthenticated: false,
      userId: null,
      userName: "",
      displayName: "",
      role: null,
      permissions: []
    };
  });

  ipcMain.handle("auth:session", () => currentAuthSession);
  ipcMain.handle("auth:recover-questions", () => dbService.getRecoverSecurityQuestions());
  ipcMain.handle("auth:recover", (_event, payload: RecoverAccountPayload) => dbService.recoverAccount(payload));
  ipcMain.handle("auth:change-own-password", (_event, payload: ChangeOwnPasswordPayload) => {
    const auth = ensureAuthenticated();
    if (!auth.ok) {
      return { ok: false, message: auth.message };
    }

    return dbService.changeOwnPassword(currentAuthSession.userId!, payload.oldPassword, payload.newPassword);
  });

  ipcMain.handle("user:permission-defs", () => dbService.listPermissionDefinitions());

  ipcMain.handle("user:list", () => {
    const auth = ensureAuthenticated();
    if (!auth.ok) {
      return [];
    }
    return dbService.listUsers();
  });

  ipcMain.handle("user:create", (_event, payload: CreateUserPayload) => {
    const auth = ensureAuthenticated();
    if (!auth.ok) {
      return { ok: false, message: auth.message };
    }
    return dbService.createUser(
      {
        userId: currentAuthSession.userId!,
        userName: currentAuthSession.userName,
        displayName: currentAuthSession.displayName,
        role: currentAuthSession.role!,
        permissions: currentAuthSession.permissions
      },
      payload
    );
  });

  ipcMain.handle("user:update", (_event, payload: UpdateUserPayload) => {
    const auth = ensureAuthenticated();
    if (!auth.ok) {
      return { ok: false, message: auth.message };
    }
    return dbService.updateUser(
      {
        userId: currentAuthSession.userId!,
        userName: currentAuthSession.userName,
        displayName: currentAuthSession.displayName,
        role: currentAuthSession.role!,
        permissions: currentAuthSession.permissions
      },
      payload
    );
  });

  ipcMain.handle("user:delete", (_event, payload: DeleteUserPayload) => {
    const auth = ensureAuthenticated();
    if (!auth.ok) {
      return { ok: false, message: auth.message };
    }
    return dbService.deleteUser(
      {
        userId: currentAuthSession.userId!,
        userName: currentAuthSession.userName,
        displayName: currentAuthSession.displayName,
        role: currentAuthSession.role!,
        permissions: currentAuthSession.permissions
      },
      payload.userId
    );
  });

  ipcMain.handle("bookset:list", () => {
    const auth = ensureAuthenticated();
    if (!auth.ok) {
      return [];
    }

    return dbService.listBooksets();
  });

  ipcMain.handle("bookset:create", (_event, payload: CreateBooksetPayload): BooksetOperationResult => {
    const auth = ensureAuthenticated();
    if (!auth.ok) {
      return { ok: false, message: auth.message };
    }

    if (!payload.name.trim()) {
      return { ok: false, message: "账套名称不能为空。" };
    }
    if (!/^[A-Za-z0-9]{10}$/.test(payload.bookCode)) {
      return { ok: false, message: "账套号必须为 10 位字母或数字。" };
    }
    if (dbService.isBookCodeInUse(payload.bookCode)) {
      return { ok: false, message: "该账套号已存在。" };
    }
    if (!Number.isInteger(payload.fiscalYear) || payload.fiscalYear < 0 || payload.fiscalYear > 9999 ||
      !Number.isInteger(payload.fiscalPeriodNo) || payload.fiscalPeriodNo < 1 || payload.fiscalPeriodNo > 12) {
      return { ok: false, message: "启用期间必须为 0000 至 9999 年、01 至 12 月。" };
    }
    if (!["CNY", "HKD", "USD", "AUD", "EUR", "JPY", "SGD", "GBP", "CAD", "CHF"].includes(payload.baseCurrency)) {
      return { ok: false, message: "请选择有效的记账本位币。" };
    }
    if (!["ASBE_2006", "SBE_2011"].includes(payload.accountingStandard)) {
      return { ok: false, message: "请选择有效的会计准则。" };
    }

    try {
      const booksetDirectory = resolveBooksetDirectory();
      fs.mkdirSync(booksetDirectory, { recursive: true });

      const fiscalPeriod = `${String(payload.fiscalYear).padStart(4, "0")}年${String(payload.fiscalPeriodNo).padStart(2, "0")}期`;
      const baseName = `${payload.bookCode}.sqlite`;
      const dbFilePath = ensureUniqueFilePath(path.join(booksetDirectory, baseName));
      ensureBooksetSchema(dbFilePath, payload.name.trim(), fiscalPeriod);
      const booksetDb = new Database(dbFilePath);
      try {
        initializeBooksetSettings(booksetDb, payload);
        ensureVoucherSchema(booksetDb, loadStandardSubjects(payload.accountingStandard));
      } finally {
        booksetDb.close();
      }

      const registered = dbService.registerBookset(payload.name.trim(), fiscalPeriod, dbFilePath, payload.bookCode);
      const opened = dbService.openBooksetById(registered.id);
      if (!opened) {
        return { ok: false, message: "账套创建成功，但打开失败。" };
      }

      openedBookset = opened;
      return { ok: true, message: "账套创建并打开成功。", bookset: opened };
    } catch (error) {
      return { ok: false, message: (error as Error).message || "创建账套失败。" };
    }
  });

  ipcMain.handle("bookset:open", (_event, payload: OpenBooksetByIdPayload): BooksetOperationResult => {
    const auth = ensureAuthenticated();
    if (!auth.ok) {
      return { ok: false, message: auth.message };
    }

    try {
      const target = dbService.getBooksetById(payload.booksetId);
      if (!target) {
        return { ok: false, message: "未找到指定账套。" };
      }

      if (!fs.existsSync(target.filePath)) {
        return { ok: false, message: "账套数据库文件不存在，请先导入或修复路径。" };
      }

      const meta = readBooksetMeta(target.filePath);
      ensureBooksetSchema(target.filePath, meta.name, meta.fiscalPeriod);
      dbService.registerBookset(meta.name, meta.fiscalPeriod, target.filePath, meta.bookCode);

      const opened = dbService.openBooksetById(payload.booksetId);
      if (!opened) {
        return { ok: false, message: "打开账套失败。" };
      }

      openedBookset = opened;
      return { ok: true, message: "账套已打开。", bookset: opened };
    } catch (error) {
      return { ok: false, message: (error as Error).message || "打开账套失败。" };
    }
  });

  ipcMain.handle("bookset:close", (): BooksetOperationResult => {
    const auth = ensureAuthenticated();
    if (!auth.ok) {
      return { ok: false, message: auth.message };
    }

    if (!openedBookset) {
      return { ok: false, message: "当前没有已打开的账套。" };
    }

    dbService.closeBooksetById(openedBookset.id);
    openedBookset = null;
    return { ok: true, message: "账套已关闭。" };
  });

  ipcMain.handle("bookset:import-package", (_event, payload: ImportBooksetPackagePayload): BooksetOperationResult => {
    const auth = ensureAuthenticated();
    if (!auth.ok) {
      return { ok: false, message: auth.message };
    }

    if (!payload.packagePath.trim() || !payload.targetDirectory.trim()) {
      return { ok: false, message: "请选择压缩包和导入目录。" };
    }

    try {
      const pkg = readBooksetPackage(payload.packagePath.trim());
      fs.mkdirSync(payload.targetDirectory.trim(), { recursive: true });

      const fileName = pkg.sqliteFileName.endsWith(".sqlite") ? pkg.sqliteFileName : `${pkg.sqliteFileName}.sqlite`;
      const sqlitePath = ensureUniqueFilePath(path.join(payload.targetDirectory.trim(), fileName));
      fs.writeFileSync(sqlitePath, Buffer.from(pkg.sqliteBase64, "base64"));

      ensureBooksetSchema(sqlitePath, pkg.name, pkg.fiscalPeriod);
      const meta = readBooksetMeta(sqlitePath);
      const registered = dbService.registerBookset(pkg.name, pkg.fiscalPeriod, sqlitePath, meta.bookCode);
      return { ok: true, message: "账套导入成功。", bookset: registered };
    } catch (error) {
      return { ok: false, message: (error as Error).message || "导入失败。" };
    }
  });

  ipcMain.handle("bookset:export-package", (_event, payload: ExportBooksetPackagePayload): BooksetOperationResult => {
    const auth = ensureAuthenticated();
    if (!auth.ok) {
      return { ok: false, message: auth.message };
    }

    if (!payload.destinationPath.trim()) {
      return { ok: false, message: "请选择导出文件路径。" };
    }

    const target = dbService.getBooksetById(payload.booksetId);
    if (!target) {
      return { ok: false, message: "未找到目标账套。" };
    }

    try {
      writeBooksetPackage(target, ensurePackageExtension(payload.destinationPath.trim()));
      return { ok: true, message: "账套导出成功。", bookset: target };
    } catch (error) {
      return { ok: false, message: (error as Error).message || "导出失败。" };
    }
  });

  ipcMain.handle("bookset:backup", (_event, payload: BackupBooksetPayload): BooksetOperationResult => {
    const auth = ensureAdministrator();
    if (!auth.ok) {
      return { ok: false, message: auth.message };
    }

    if (!openedBookset) {
      return { ok: false, message: "请先打开账套。" };
    }

    if (!payload.destinationPath.trim()) {
      return { ok: false, message: "请选择备份文件路径。" };
    }

    try {
      writeBooksetPackage(openedBookset, ensurePackageExtension(payload.destinationPath.trim()));
      markBackupCompleted(openedBookset);
      return { ok: true, message: "账套备份成功。", bookset: openedBookset };
    } catch (error) {
      return { ok: false, message: (error as Error).message || "备份失败。" };
    }
  });

  ipcMain.handle("bookset:restore-backup", (_event, payload: RestoreBooksetBackupPayload): BooksetOperationResult => {
    const auth = ensureAdministrator();
    if (!auth.ok) {
      return { ok: false, message: auth.message };
    }

    if (!payload.packagePath.trim()) {
      return { ok: false, message: "请选择备份压缩包。" };
    }

    const target = dbService.getBooksetById(payload.booksetId);
    if (!target) {
      return { ok: false, message: "未找到目标账套。" };
    }

    try {
      const pkg = readBooksetPackage(payload.packagePath.trim());
      createSafetySnapshot(target, "before-restore");
      fs.writeFileSync(target.filePath, Buffer.from(pkg.sqliteBase64, "base64"));
      ensureBooksetSchema(target.filePath, pkg.name, pkg.fiscalPeriod);
      const registered = dbService.registerBookset(pkg.name, pkg.fiscalPeriod, target.filePath);

      if (openedBookset && openedBookset.id === registered.id) {
        openedBookset = registered;
      }

      return { ok: true, message: "账套备份恢复成功。", bookset: registered };
    } catch (error) {
      return { ok: false, message: (error as Error).message || "恢复失败。" };
    }
  });

  ipcMain.handle("bookset:reinitialize", (): { ok: boolean; message: string } => {
    const auth = ensureAdministrator();
    if (!auth.ok) return auth;
    if (!openedBookset) return { ok: false, message: "当前没有打开的账套。" };

    const target = openedBookset;
    try {
      const backupPath = createSafetySnapshot(target, "before-reinitialize");
      dbService.closeBooksetById(target.id);
      for (const suffix of ["", "-wal", "-shm"]) {
        const filePath = `${target.filePath}${suffix}`;
        if (fs.existsSync(filePath)) fs.rmSync(filePath);
      }
      dbService.deleteBooksetRecord(target.id);
      openedBookset = null;
      return { ok: true, message: `账套已清空。安全备份：${backupPath}` };
    } catch (error) {
      return { ok: false, message: (error as Error).message || "重新初始化失败。" };
    }
  });

  ipcMain.handle("dialog:pick-directory", async (): Promise<string | null> => {
    const owner = BrowserWindow.getFocusedWindow() ?? mainWindow ?? undefined;

    const options: OpenDialogOptions = {
      properties: ["openDirectory", "createDirectory"]
    };
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0] ?? null;
  });

  ipcMain.handle("dialog:pick-package-file", async (): Promise<string | null> => {
    const owner = BrowserWindow.getFocusedWindow() ?? mainWindow ?? undefined;

    const options: OpenDialogOptions = {
      properties: ["openFile"],
      filters: [{ name: "账套压缩包", extensions: ["oabk"] }]
    };
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0] ?? null;
  });

  ipcMain.handle("dialog:pick-package-save-path", async (_event, defaultFileName: string): Promise<string | null> => {
    const owner = BrowserWindow.getFocusedWindow() ?? mainWindow ?? undefined;

    const options: SaveDialogOptions = {
      defaultPath: ensurePackageExtension(defaultFileName || "bookset-backup.oabk"),
      filters: [{ name: "账套压缩包", extensions: ["oabk"] }]
    };
    const result = owner
      ? await dialog.showSaveDialog(owner, options)
      : await dialog.showSaveDialog(options);

    if (result.canceled || !result.filePath) {
      return null;
    }
    return result.filePath;
  });

  ipcMain.handle("bookset:recent", () => {
    const auth = ensureAuthenticated();
    if (!auth.ok) {
      return [];
    }
    return dbService.listRecentBooksets();
  });

  ipcMain.handle("bookset-settings:get", () => {
    return withActiveBookset((db) => getBooksetSettings(db)) ?? null;
  });

  ipcMain.handle("bookset-settings:save", (_event, payload: SaveBooksetSettingsPayload) => {
    const result = withActiveBookset((db) => saveBooksetSettings(db, payload));
    if (result?.ok && openedBookset) {
      dbService.updateBooksetDisplay(openedBookset.id, payload.identity.companyName, openedBookset.fiscalPeriod);
      openedBookset = { ...openedBookset, name: payload.identity.companyName };
    }
    return result ?? { ok: false, message: "请先打开账套。" };
  });

  ipcMain.handle("bookset-settings:update-period", (_event, payload: UpdateFiscalPeriodPayload) => {
    const result = withActiveBookset((db) => updateFiscalPeriod(db, payload));
    return result ?? { ok: false, message: "请先打开账套。" };
  });

  ipcMain.handle("bookset-settings:add-year", (_event, year: number) => {
    const result = withActiveBookset((db) => addFiscalYear(db, year));
    return result ?? { ok: false, message: "请先打开账套。" };
  });

  ipcMain.handle("bookset-settings:close-period", (_event, year: number, periodNo: number) => {
    const result = withActiveBookset((db) => closeFiscalPeriod(db, year, periodNo));
    if (result?.ok && openedBookset) {
      const db = new Database(openedBookset.filePath, { readonly: true });
      try {
        const period = db.prepare("SELECT value FROM bookset_meta WHERE key = 'fiscal_period'").get() as { value: string } | undefined;
        if (period) {
          dbService.updateBooksetDisplay(openedBookset.id, openedBookset.name, period.value);
          openedBookset = { ...openedBookset, fiscalPeriod: period.value };
        }
      } finally {
        db.close();
      }
    }
    return result ?? { ok: false, message: "请先打开账套。" };
  });

  ipcMain.handle("voucher:accounts", (_event, keyword = "") => {
    return withActiveBookset((db) => listVoucherAccounts(db, keyword)) ?? [];
  });

  ipcMain.handle("voucher:detail-suggestions", (_event, accountCode: string) => {
    return withActiveBookset((db) => getVoucherDetailSuggestions(db, accountCode)) ?? [];
  });

  ipcMain.handle("voucher:search", (_event, payload: VoucherSearchPayload) => {
    return withActiveBookset((db) => searchVouchers(db, payload)) ?? [];
  });

  ipcMain.handle("voucher:get", (_event, voucherId: number) => {
    return withActiveBookset((db) => getVoucher(db, voucherId)) ?? null;
  });

  ipcMain.handle("voucher:save", (_event, payload: VoucherInput, confirmUnpost = false) => {
    const result = withActiveBookset((db) => saveVoucher(db, payload, confirmUnpost));
    return result ?? { ok: false, message: "请先打开账套。" };
  });

  ipcMain.handle("voucher:delete", (_event, voucherId: number, confirmUnpost = false) => {
    const result = withActiveBookset((db) => deleteVoucher(db, voucherId, confirmUnpost));
    return result ?? { ok: false, message: "请先打开账套。" };
  });

  ipcMain.handle("voucher:post", (_event, payload: BookkeepingPayload) => {
    const result = withActiveBookset((db) => postVouchers(db, payload.voucherIds));
    return result ?? { ok: false, message: "请先打开账套。", affectedCount: 0 };
  });

  ipcMain.handle("dialog:pick-voucher-attachments", async () => {
    const owner = BrowserWindow.getFocusedWindow() ?? mainWindow ?? undefined;
    const options: OpenDialogOptions = {
      properties: ["openFile", "multiSelections"],
      filters: [{ name: "原始凭证附件", extensions: ["pdf", "jpg", "jpeg", "png", "gif", "webp"] }]
    };
    const result = owner
      ? await dialog.showOpenDialog(owner, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled) {
      return [];
    }
    return result.filePaths.map((filePath) => ({
      fileName: path.basename(filePath),
      filePath
    }));
  });
}

app.whenReady().then(() => {
  const dbPath = path.join(app.getPath("userData"), "data", "openaccountancy.db");
  systemDbFilePath = dbPath;
  hasDatabaseBeforeBootstrap = fs.existsSync(dbPath);
  dbService = new DatabaseService(dbPath);
  openedBookset = dbService.getOpenedBookset();

  registerIpcHandlers();
  mainWindow = createMainWindow();
  backupTimer = setInterval(runScheduledBackups, 30_000);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on("before-quit", () => {
  if (backupTimer) clearInterval(backupTimer);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
