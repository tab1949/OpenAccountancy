import { contextBridge, ipcRenderer } from "electron";
import type { OpenAccountancyApi, OpenBooksetPayload } from "../common/contracts";

const api: OpenAccountancyApi = {
  ping: () => ipcRenderer.invoke("app:ping"),
  getSystemEntryState: () => ipcRenderer.invoke("app:entry-state"),
  getShellState: () => ipcRenderer.invoke("app:shell-state"),
  openMockBookset: (payload: OpenBooksetPayload) =>
    ipcRenderer.invoke("bookset:open", payload),
  closeBookset: () => ipcRenderer.invoke("bookset:close"),
  getRecentBooksets: () => ipcRenderer.invoke("bookset:recent")
};

contextBridge.exposeInMainWorld("openAccountancy", api);
