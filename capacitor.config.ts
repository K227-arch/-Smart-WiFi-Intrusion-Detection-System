import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.salamanda.wids",
  appName: "SALAMANDA WIDS",
  webDir: "dist",
  // In production the mobile app connects to a local or remote SALAMANDA server.
  // Change this to your deployed server URL for production builds.
  server: {
    // For development: point to the local Express server via USB tunnel
    // For production: set to your deployed URL e.g. "https://bh9n4s8r.insforge.site"
    url: "http://localhost:3000",
    cleartext: true, // allow HTTP for local dev
  },
  ios: {
    contentInset: "always",
    backgroundColor: "#020617",
    scheme: "salamanda",
  },
  android: {
    backgroundColor: "#020617",
    allowMixedContent: true, // needed for local HTTP in dev
    captureInput: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#020617",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: true,
      spinnerColor: "#F59E0B",
    },
  },
};

export default config;
