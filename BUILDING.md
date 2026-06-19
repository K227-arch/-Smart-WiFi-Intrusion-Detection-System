# Building SALAMANDA WIDS for All Platforms

## Prerequisites

| Platform | Requirement |
|---|---|
| macOS app | macOS machine + Xcode Command Line Tools |
| Windows app | Windows or macOS with Wine/cross-compile |
| iOS app | macOS + Xcode 15+ + Apple Developer account |
| Android app | Android Studio + Java 17+ |

---

## Web (Vercel / InsForge hosting)

```bash
npm run build
# Deploy via InsForge MCP or push to GitHub → Vercel auto-deploys
```

---

## Desktop — Electron

### Development (run locally)

```bash
npm run electron:dev
```
This starts the Express server + Electron window simultaneously.

### Build macOS (.dmg + .zip for Apple Silicon + Intel)

```bash
npm run electron:build:mac
# Output: release/SALAMANDA WIDS-2.0.0.dmg
```

### Build Windows (.exe installer + portable)

```bash
npm run electron:build:win
# Output: release/SALAMANDA WIDS Setup 2.0.0.exe
```

### Build Linux (.AppImage + .deb + .rpm)

```bash
npm run electron:build:linux
# Output: release/SALAMANDA WIDS-2.0.0.AppImage
```

### Live capture on desktop
The Electron build bundles the Express backend. For live packet capture you still need `cap`/libpcap:
- **macOS**: `sudo npm run setup:capture` once, then rebuild
- **Windows**: Install [Npcap](https://npcap.com) (select "WinPcap compatibility mode")
- **Linux**: `sudo apt install libpcap-dev` or `sudo npm run setup:capture:linux`

---

## Mobile — Capacitor

### Setup (first time only)

```bash
npx cap init "SALAMANDA WIDS" com.salamanda.wids --web-dir dist
npm run build
npx cap sync
```

### iOS (requires macOS + Xcode)

```bash
npm run cap:ios
# Opens Xcode → select your team → build & run on simulator or device
```

**Note:** On iOS the app connects to a remote SALAMANDA server. To use your local machine, edit `capacitor.config.ts` and set `server.url` to your LAN IP (`http://192.168.1.X:3000`).

### Android (requires Android Studio)

```bash
npm run cap:android
# Opens Android Studio → build & run on emulator or device
```

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Platform                                           │
│  ┌─────────────┐  ┌──────────┐  ┌────────────────┐ │
│  │  Electron   │  │  Web     │  │  Capacitor     │ │
│  │ (macOS/Win/ │  │ (Vercel/ │  │ (iOS/Android)  │ │
│  │  Linux)     │  │  InsForge│  │                │ │
│  └──────┬──────┘  └────┬─────┘  └───────┬────────┘ │
│         │              │                │          │
│         └──────────────┼────────────────┘          │
│                        ▼                           │
│              React + Vite Frontend                 │
│                        │                           │
│                        ▼                           │
│           Express Backend (server.ts)              │
│   ┌───────────────────────────────────────┐        │
│   │  Packet Capture  │  ML (ONNX)         │        │
│   │  Network Analyzer│  InsForge DB       │        │
│   │  Snort Rules     │  Auth (local)      │        │
│   └───────────────────────────────────────┘        │
└─────────────────────────────────────────────────────┘
```

---

## Code Signing (macOS App Store / Notarization)

1. Add to `.env.local`:
```
APPLE_ID=your@apple.id
APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
APPLE_TEAM_ID=XXXXXXXXXX
```
2. Run `npm run electron:build:mac` — electron-builder handles notarization automatically.

## Code Signing (Windows)

1. Obtain a code signing certificate (.pfx)
2. Add to `package.json` build config:
```json
"win": {
  "certificateFile": "cert.pfx",
  "certificatePassword": "..."
}
```
