/**
 * Electron preload — exposes a safe bridge to the renderer via contextBridge.
 * Only whitelisted APIs are exposed — no raw Node.js access in the renderer.
 */
import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  getAppInfo: () => ipcRenderer.invoke("app-info"),
  platform: process.platform,
  isElectron: true,
});
