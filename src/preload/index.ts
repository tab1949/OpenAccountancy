import { contextBridge, ipcRenderer } from "electron";
import type {
  ChangeOwnPasswordPayload,
  CreateUserPayload,
  DeleteUserPayload,
  InitSystemPayload,
  LoginPayload,
  OpenAccountancyApi,
  OpenBooksetPayload,
  RecoverAccountPayload,
  UpdateUserPayload
} from "../common/contracts";

const api: OpenAccountancyApi = {
  ping: () => ipcRenderer.invoke("app:ping"),
  getSystemEntryState: () => ipcRenderer.invoke("app:entry-state"),
  initSystem: (payload: InitSystemPayload) => ipcRenderer.invoke("auth:init-system", payload),
  login: (payload: LoginPayload) => ipcRenderer.invoke("auth:login", payload),
  logout: () => ipcRenderer.invoke("auth:logout"),
  getAuthSession: () => ipcRenderer.invoke("auth:session"),
  getRecoverSecurityQuestions: () => ipcRenderer.invoke("auth:recover-questions"),
  recoverAccount: (payload: RecoverAccountPayload) => ipcRenderer.invoke("auth:recover", payload),
  changeOwnPassword: (payload: ChangeOwnPasswordPayload) => ipcRenderer.invoke("auth:change-own-password", payload),
  getPermissionDefinitions: () => ipcRenderer.invoke("user:permission-defs"),
  listUsers: () => ipcRenderer.invoke("user:list"),
  createUser: (payload: CreateUserPayload) => ipcRenderer.invoke("user:create", payload),
  updateUser: (payload: UpdateUserPayload) => ipcRenderer.invoke("user:update", payload),
  deleteUser: (payload: DeleteUserPayload) => ipcRenderer.invoke("user:delete", payload),
  getShellState: () => ipcRenderer.invoke("app:shell-state"),
  openMockBookset: (payload: OpenBooksetPayload) =>
    ipcRenderer.invoke("bookset:open", payload),
  closeBookset: () => ipcRenderer.invoke("bookset:close"),
  getRecentBooksets: () => ipcRenderer.invoke("bookset:recent")
};

contextBridge.exposeInMainWorld("openAccountancy", api);
