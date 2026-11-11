/**
 * SALAMANDA WIDS — Electron Main Process
 * Launches the Express backend and opens a BrowserWindow pointing to it.
 * Works on macOS, Windows, and Linux.
 */

import { app, BrowserWindow, Menu, Tray, nativeImage, shell, ipcMain, dialog } from "electron";
import { spawn, execSync, type ChildProcess } from "child_process";
import path from "path";
import fs from "fs";

// ── Dev vs production mode ───────────────────────────────────────────────────
const isDev = !app.isPackaged;
const SERVER_PORT = 3000;
const SERVER_URL = `http://localhost:${SERVER_PORT}`;

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverProcess: ChildProcess | null = null;

// ── Ensure .env.local exists for the backend ────────────────────────────────
// On first run (no .env.local next to the app), copy from the bundled template.
// The template has safe defaults (URL, publishable key) but no secret key —
// the app runs in fully-local mode until the user adds one.
function ensureEnvFile(): void {
  const envDir = isDev ? path.join(__dirname, "..") : process.resourcesPath ?? "";
  const envPath = path.join(envDir, ".env.local");
  const templatePath = path.join(envDir, ".env.template");

  if (fs.existsSync(envPath)) return; // already configured

  // Try copying the bundled template
  if (fs.existsSync(templatePath)) {
    try {
      fs.copyFileSync(templatePath, envPath);
      console.log("[electron] Created .env.local from template");
      return;
    } catch (e) {
      console.warn("[electron] Could not copy .env.template:", e);
    }
  }

  // Fallback: write minimal env with safe defaults so the server starts
  const minimal = [
    "SUPABASE_URL=https://kuntnvlvyuqetiorvlve.supabase.co",
    'SUPABASE_PUBLISHABLE_KEY=sb_publishable_pEeWmRrCl_NB77xSmIkenA_J3srWmtZ',
    "SUPABASE_SECRET_KEY=",
    "CAPTURE_IFACE=Wi-Fi",
    "",
  ].join("\n");
  try {
    fs.writeFileSync(envPath, minimal);
    console.log("[electron] Created minimal .env.local");
  } catch (e) {
    console.warn("[electron] Could not write .env.local:", e);
  }
}

// ── Check and install Npcap if missing (Windows only) ─────────────────────────
function checkNpcap(): boolean {
  if (process.platform !== "win32") return true;
  return fs.existsSync("C:\\Program Files\\Npcap\\NPFInstall.exe");
}

async function promptNpcapInstall(): Promise<void> {
  if (process.platform !== "win32" || checkNpcap()) return;

  const installerPaths = [
    path.join(process.resourcesPath ?? "", "installers", "npcap-1.90.exe"),
    path.join(__dirname, "..", "installers", "npcap-1.90.exe"),
    path.join(process.cwd(), "installers", "npcap-1.90.exe"),
  ];

  const installer = installerPaths.find((p) => fs.existsSync(p));

  const { response } = await dialog.showMessageBox({
    type: "info",
    title: "SALAMANDA WIDS — Npcap Required",
    message: "Npcap is required for live packet capture.",
    detail: installer
      ? "SALAMANDA includes Npcap. Would you like to install it now? (Requires admin privileges)"
      : "Please install Npcap from https://npcap.com to enable live packet capture.",
    buttons: installer ? ["Install Now", "Skip (limited mode)"] : ["OK"],
    defaultId: 0,
  });

  if (response === 0 && installer) {
    try {
      // Run installer with elevation
      execSync(`powershell -Command "Start-Process '${installer}' -Verb RunAs -Wait"`, { stdio: "ignore" });
    } catch {
      // User cancelled UAC or install failed — continue without it
    }
  }
}

// ── Start the Express/WIDS backend server ────────────────────────────────────
function startBackend(): Promise<void> {
  return new Promise((resolve) => {
    // In production the asar contains dist/server.cjs.
    // Electron exposes asar contents at <resourcesPath>/app.asar/<path> via its VFS,
    // but Node's child_process.spawn cannot execute files inside an asar.
    // electron-builder sets app.asar.unpacked for native modules — we replicate
    // this by checking the unpacked path first, then falling back to the asar VFS path.
    const serverInAsar   = path.join(process.resourcesPath, "app.asar", "dist", "server.cjs");
    const serverUnpacked = path.join(process.resourcesPath, "app.asar.unpacked", "dist", "server.cjs");
    const serverDirect   = path.join(process.resourcesPath, "dist", "server.cjs");

    const serverScript = isDev
      ? path.join(__dirname, "..", "server.ts")
      : fs.existsSync(serverUnpacked) ? serverUnpacked
      : fs.existsSync(serverDirect)   ? serverDirect
      : serverInAsar;   // last resort — asar VFS (may fail for spawn)

    const cmd  = isDev ? "npx" : process.execPath; // use bundled Electron Node in prod
    const args = isDev ? ["tsx", serverScript] : [serverScript];

    const cwd = isDev
      ? path.join(__dirname, "..")
      : process.resourcesPath;

    console.log(`[electron] Starting backend: ${cmd} ${args.join(" ")} (cwd=${cwd})`);

    serverProcess = spawn(cmd, args, {
      cwd,
      env: { ...process.env, PORT: String(SERVER_PORT), ELECTRON_RUN_AS_NODE: "1" },
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
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
      preload: path.join(__dirname, "preload.cjs"),
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

  // Check for Npcap on Windows — prompt install if missing
  await promptNpcapInstall();

  // Create .env.local from template on first run
  ensureEnvFile();

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
