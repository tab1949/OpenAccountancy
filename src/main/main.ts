import fs from "node:fs";
import path from "node:path";
import { app, BrowserWindow, ipcMain } from "electron";
import { DatabaseService } from "./database";
import type {
  AppShellState,
  AuthSession,
  ChangeOwnPasswordPayload,
  CreateUserPayload,
  DeleteUserPayload,
  InitSystemPayload,
  LoginPayload,
  OpenBooksetPayload,
  RecoverAccountPayload,
  SystemEntryState,
  TodoItem,
  UpdateUserPayload
} from "../common/contracts";

let mainWindow: BrowserWindow | null = null;
let openedBookset: OpenBooksetPayload | null = null;
let dbService: DatabaseService;
let hasDatabaseBeforeBootstrap = false;
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

  ipcMain.handle("bookset:open", (_event, payload: OpenBooksetPayload) => {
    const auth = ensureAuthenticated();
    if (!auth.ok) {
      throw new Error(auth.message);
    }

    openedBookset = payload;
    dbService.addRecentBookset(payload.companyName, payload.fiscalPeriod);
    return createShellState();
  });

  ipcMain.handle("bookset:close", () => {
    const auth = ensureAuthenticated();
    if (!auth.ok) {
      throw new Error(auth.message);
    }

    openedBookset = null;
    return createShellState();
  });

  ipcMain.handle("bookset:recent", () => {
    const auth = ensureAuthenticated();
    if (!auth.ok) {
      return [];
    }
    return dbService.listRecentBooksets();
  });
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
