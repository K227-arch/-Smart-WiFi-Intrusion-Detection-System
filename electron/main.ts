/**
 * SALAMANDA WIDS — Electron Main Process
 * Launches the Express backend and opens a BrowserWindow pointing to it.
 * Works on macOS, Windows, and Linux.
 */

import { app, BrowserWindow, Menu, Tray, nativeImage, shell, ipcMain } from "electron";
import { spawn, type ChildProcess } from "child_process";
import path from "path";
import fs from "fs";

// ── Dev vs production mode ───────────────────────────────────────────────────
const isDev = !app.isPackaged;
const SERVER_PORT = 3000;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverProcess: ChildProcess | null = null;

// ── Start the Express/WIDS backend server ────────────────────────────────────
function startBackend(): Promise<void> {
  return new Promise((resolve) => {
    const serverScript = isDev
      ? path.join(__dirname, "..", "server.ts")
      : path.join(process.resourcesPath, "app", "dist", "server.cjs");

    const cmd = isDev ? "npx" : "node";
    const args = isDev ? ["tsx", serverScript] : [serverScript];

    console.log(`[electron] Starting backend: ${cmd} ${args.join(" ")}`);

    serverProcess = spawn(cmd, args, {
      cwd: isDev ? path.join(__dirname, "..") : process.resourcesPath,
      env: { ...process.env, PORT: String(SERVER_PORT) },
      stdio: ["ignore", "pipe", "pipe"],
      shell: process.platform === "win32",
    });

    serverProcess.stdout?.on("data", (d) => {
      const line = d.toString().trim();
      console.log(`[server] ${line}`);
      // Resolve once the server says it's ready
      if (line.includes("SALAMANDA WIDS running")) resolve();
    });

    serverProcess.stderr?.on("data", (d) => {
      const msg = d.toString().trim();
      if (msg) console.error(`[server:err] ${msg}`);
    });

    serverProcess.on("error", (e) => console.error("[electron] Backend spawn error:", e));

    // Safety: resolve after 8s even if we miss the ready line
    setTimeout(resolve, 8000);
  });
}

// ── Create the main window ────────────────────────────────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    title: "SALAMANDA WIDS",
    backgroundColor: "#020617",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: !isDev, // relax CSP in dev for Vite HMR
    },
    // macOS: use native traffic lights
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    icon: getAppIcon(),
  });

  mainWindow.loadURL(SERVER_URL);

  // Open external links in the OS browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(SERVER_URL)) shell.openExternal(url);
    return { action: "deny" };
  });

  if (isDev) mainWindow.webContents.openDevTools({ mode: "detach" });

  mainWindow.on("closed", () => { mainWindow = null; });
}

// ── System Tray ───────────────────────────────────────────────────────────────
function createTray() {
  const icon = getAppIcon() ?? nativeImage.createEmpty();
  tray = new Tray(icon.resize({ width: 16, height: 16 }));

  const menu = Menu.buildFromTemplate([
    { label: "Open SALAMANDA", click: () => { mainWindow?.show() ?? createWindow(); } },
    { type: "separator" },
    { label: "Quit", click: () => app.quit() },
  ]);

  tray.setContextMenu(menu);
  tray.setToolTip("SALAMANDA WIDS — Network Intrusion Detection");
  tray.on("click", () => { mainWindow?.isVisible() ? mainWindow.focus() : mainWindow?.show(); });
}

function getAppIcon(): Electron.NativeImage | undefined {
  const candidates = [
    path.join(__dirname, "..", "public", "icon.png"),
    path.join(__dirname, "..", "src", "assets", "icon.png"),
    path.join(process.resourcesPath ?? "", "icon.png"),
  ];
  for (const p of candidates) if (fs.existsSync(p)) return nativeImage.createFromPath(p);
  return undefined;
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  // macOS: hide dock icon while loading
  if (process.platform === "darwin") app.dock?.hide();

  await startBackend();

  createWindow();
  createTray();

  if (process.platform === "darwin") app.dock?.show();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  // On macOS keep the app running in the tray even with no windows
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  if (serverProcess) {
    console.log("[electron] Stopping backend...");
    serverProcess.kill("SIGTERM");
    serverProcess = null;
  }
});

// IPC: allow renderer to query app version / platform
ipcMain.handle("app-info", () => ({
  version: app.getVersion(),
  platform: process.platform,
  electron: process.versions.electron,
  node: process.versions.node,
}));
