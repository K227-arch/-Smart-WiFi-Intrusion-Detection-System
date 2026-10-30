"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));

// electron/main.ts
var import_electron = require("electron");
var import_child_process = require("child_process");
var import_path = __toESM(require("path"), 1);
var import_fs = __toESM(require("fs"), 1);
var isDev = !import_electron.app.isPackaged;
var SERVER_PORT = 3e3;
var SERVER_URL = `http://localhost:${SERVER_PORT}`;
var mainWindow = null;
var tray = null;
var serverProcess = null;
function checkNpcap() {
  if (process.platform !== "win32") return true;
  return import_fs.default.existsSync("C:\\Program Files\\Npcap\\NPFInstall.exe");
}
async function promptNpcapInstall() {
  if (process.platform !== "win32" || checkNpcap()) return;
  const installerPaths = [
    import_path.default.join(process.resourcesPath ?? "", "installers", "npcap-1.80.exe"),
    import_path.default.join(__dirname, "..", "installers", "npcap-1.80.exe"),
    import_path.default.join(process.cwd(), "installers", "npcap-1.80.exe")
  ];
  const installer = installerPaths.find((p) => import_fs.default.existsSync(p));
  const { response } = await import_electron.dialog.showMessageBox({
    type: "info",
    title: "SALAMANDA WIDS \u2014 Npcap Required",
    message: "Npcap is required for live packet capture.",
    detail: installer ? "SALAMANDA includes Npcap. Would you like to install it now? (Requires admin privileges)" : "Please install Npcap from https://npcap.com to enable live packet capture.",
    buttons: installer ? ["Install Now", "Skip (limited mode)"] : ["OK"],
    defaultId: 0
  });
  if (response === 0 && installer) {
    try {
      (0, import_child_process.execSync)(`powershell -Command "Start-Process '${installer}' -Verb RunAs -Wait"`, { stdio: "ignore" });
    } catch {
    }
  }
}
function startBackend() {
  return new Promise((resolve) => {
    const serverScript = isDev ? import_path.default.join(__dirname, "..", "server.ts") : import_path.default.join(process.resourcesPath, "app", "dist", "server.cjs");
    const cmd = isDev ? "npx" : "node";
    const args = isDev ? ["tsx", serverScript] : [serverScript];
    console.log(`[electron] Starting backend: ${cmd} ${args.join(" ")}`);
    serverProcess = (0, import_child_process.spawn)(cmd, args, {
      cwd: isDev ? import_path.default.join(__dirname, "..") : process.resourcesPath,
      env: { ...process.env, PORT: String(SERVER_PORT) },
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32"
    });
    serverProcess.stdout?.on("data", (d) => {
      const line = d.toString().trim();
      console.log(`[server] ${line}`);
      if (line.includes("SALAMANDA WIDS running")) resolve();
    });
    serverProcess.stderr?.on("data", (d) => {
      const msg = d.toString().trim();
      if (msg) console.error(`[server:err] ${msg}`);
    });
    serverProcess.on("error", (e) => console.error("[electron] Backend spawn error:", e));
    setTimeout(resolve, 8e3);
  });
}
function createWindow() {
  mainWindow = new import_electron.BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "SALAMANDA WIDS",
    backgroundColor: "#020617",
    webPreferences: {
      preload: import_path.default.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: !isDev
      // relax CSP in dev for Vite HMR
    },
    // macOS: use native traffic lights
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    icon: getAppIcon()
  });
  mainWindow.loadURL(SERVER_URL);
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(SERVER_URL)) import_electron.shell.openExternal(url);
    return { action: "deny" };
  });
  if (isDev) mainWindow.webContents.openDevTools({ mode: "detach" });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}
function createTray() {
  const icon = getAppIcon() ?? import_electron.nativeImage.createEmpty();
  tray = new import_electron.Tray(icon.resize({ width: 16, height: 16 }));
  const menu = import_electron.Menu.buildFromTemplate([
    { label: "Open SALAMANDA", click: () => {
      mainWindow?.show() ?? createWindow();
    } },
    { type: "separator" },
    { label: "Quit", click: () => import_electron.app.quit() }
  ]);
  tray.setContextMenu(menu);
  tray.setToolTip("SALAMANDA WIDS \u2014 Network Intrusion Detection");
  tray.on("click", () => {
    mainWindow?.isVisible() ? mainWindow.focus() : mainWindow?.show();
  });
}
function getAppIcon() {
  const candidates = [
    import_path.default.join(__dirname, "..", "public", "icon.png"),
    import_path.default.join(__dirname, "..", "src", "assets", "icon.png"),
    import_path.default.join(process.resourcesPath ?? "", "icon.png")
  ];
  for (const p of candidates) if (import_fs.default.existsSync(p)) return import_electron.nativeImage.createFromPath(p);
  return void 0;
}
import_electron.app.whenReady().then(async () => {
  if (process.platform === "darwin") import_electron.app.dock?.hide();
  await promptNpcapInstall();
  await startBackend();
  createWindow();
  createTray();
  if (process.platform === "darwin") import_electron.app.dock?.show();
  import_electron.app.on("activate", () => {
    if (import_electron.BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
import_electron.app.on("window-all-closed", () => {
  if (process.platform !== "darwin") import_electron.app.quit();
});
import_electron.app.on("before-quit", () => {
  if (serverProcess) {
    console.log("[electron] Stopping backend...");
    serverProcess.kill("SIGTERM");
    serverProcess = null;
  }
});
import_electron.ipcMain.handle("app-info", () => ({
  version: import_electron.app.getVersion(),
  platform: process.platform,
  electron: process.versions.electron,
  node: process.versions.node
}));
