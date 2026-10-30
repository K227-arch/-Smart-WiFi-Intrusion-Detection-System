"use strict";

// electron/preload.ts
var import_electron = require("electron");
import_electron.contextBridge.exposeInMainWorld("electronAPI", {
  getAppInfo: () => import_electron.ipcRenderer.invoke("app-info"),
  platform: process.platform,
  isElectron: true
});
