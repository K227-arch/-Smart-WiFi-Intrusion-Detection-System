/**
 * usePlatform — detects whether the app is running inside Electron,
 * a Capacitor-wrapped native app, or a plain browser.
 *
 * Use this to conditionally show/hide features that only make sense
 * on certain platforms (e.g. live capture UI on desktop only).
 */

// Extend Window for Electron preload bridge
declare global {
  interface Window {
    electronAPI?: {
      getAppInfo: () => Promise<{ version: string; platform: string; electron: string; node: string }>;
      platform: string;
      isElectron: boolean;
    };
    Capacitor?: {
      getPlatform: () => "ios" | "android" | "web";
      isNativePlatform: () => boolean;
    };
  }
}

export type Platform = "electron-mac" | "electron-win" | "electron-linux" | "capacitor-ios" | "capacitor-android" | "web";

export function getPlatform(): Platform {
  // Electron — injected by preload.ts
  if (window.electronAPI?.isElectron) {
    const p = window.electronAPI.platform;
    if (p === "darwin") return "electron-mac";
    if (p === "win32") return "electron-win";
    return "electron-linux";
  }
  // Capacitor native
  if (window.Capacitor?.isNativePlatform?.()) {
    const p = window.Capacitor.getPlatform();
    if (p === "ios") return "capacitor-ios";
    if (p === "android") return "capacitor-android";
  }
  return "web";
}

export function usePlatform() {
  const platform = getPlatform();
  return {
    platform,
    isElectron: platform.startsWith("electron"),
    isMobile: platform === "capacitor-ios" || platform === "capacitor-android",
    isDesktop: platform.startsWith("electron"),
    isWeb: platform === "web",
    isMac: platform === "electron-mac",
    isWindows: platform === "electron-win",
    isLinux: platform === "electron-linux",
    isIOS: platform === "capacitor-ios",
    isAndroid: platform === "capacitor-android",
  };
}
