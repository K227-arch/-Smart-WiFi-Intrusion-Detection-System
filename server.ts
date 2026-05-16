import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

// --- Types ---
interface WiFiPacket {
  timestamp: number;
  ssid?: string;
  bssid: string;
  sourceMac: string;
  destMac?: string;
  type: "data" | "mgmt" | "beacons" | "deauth";
  signalStrength: number;
  channel: number;
}

interface Alert {
  id: string;
  timestamp: number;
  type: "ROGUE_AP" | "DEAUTH_ATTACK" | "MAC_SPOOFING" | "UNAUTHORIZED_DEVICE";
  severity: "high" | "medium" | "low";
  description: string;
  targetMac: string;
  details: any;
}

interface Device {
  mac: string;
  lastSeen: number;
  status: "trusted" | "unknown" | "blocked";
  firstSeen: number;
  ssid?: string;
  avgSignal: number;
}

// --- Global State (In-memory for demo) ---
let alerts: Alert[] = [];
let devices: Map<string, Device> = new Map();
let trustedMacs: Set<string> = new Set(["00:11:22:33:44:55", "AA:BB:CC:DD:EE:FF"]);
let sseClients: express.Response[] = [];
const KNOWN_AP_BSSID = "DE:AD:BE:EF:00:01";
const KNOWN_SSID = "Enterprise_Secure_WiFi";

// --- Detection Engine Logic ---
const detectionEngine = {
  processPacket: (packet: WiFiPacket) => {
    // 0. Broadcast packet for real-time view
    broadcastPacket(packet);

    // 1. Rogue AP Detection (Evil Twin)
    if (packet.ssid === KNOWN_SSID && packet.bssid !== KNOWN_AP_BSSID) {
      addAlert({
        type: "ROGUE_AP",
        severity: "high",
        targetMac: packet.bssid,
        description: `Rogue Access Point detected! SSID "${packet.ssid}" broadcast from unauthorized BSSID ${packet.bssid}.`,
        details: { expectedBssid: KNOWN_AP_BSSID, actualBssid: packet.bssid },
      });
    }

    // 2. Deauthentication Attack Detection
    if (packet.type === "deauth") {
      addAlert({
        type: "DEAUTH_ATTACK",
        severity: "high",
        targetMac: packet.destMac || "broadcast",
        description: `Deauthentication packets observed targeting ${packet.destMac || "network"}. Possible DoS attack.`,
        details: { source: packet.sourceMac },
      });
    }

    // 3. Unauthorized Device Detection
    if (!trustedMacs.has(packet.sourceMac) && !devices.has(packet.sourceMac)) {
      addAlert({
        type: "UNAUTHORIZED_DEVICE",
        severity: "medium",
        targetMac: packet.sourceMac,
        description: `New unknown device discovered: ${packet.sourceMac}`,
        details: {},
      });
    }

    // Update Device Registry
    const existing = devices.get(packet.sourceMac);
    if (existing) {
      existing.lastSeen = Date.now();
      existing.avgSignal = (existing.avgSignal + packet.signalStrength) / 2;
    } else {
      devices.set(packet.sourceMac, {
        mac: packet.sourceMac,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        status: trustedMacs.has(packet.sourceMac) ? "trusted" : "unknown",
        ssid: packet.ssid,
        avgSignal: packet.signalStrength,
      });
    }
  },
};

function addAlert(alertData: Omit<Alert, "id" | "timestamp">) {
  // Simple deduplication: don't add same alert type for same target within last 10 seconds
  const recent = alerts.find(a => a.type === alertData.type && a.targetMac === alertData.targetMac && (Date.now() - a.timestamp < 10000));
  if (recent) return;

  const newAlert: Alert = {
    ...alertData,
    id: Math.random().toString(36).substr(2, 9),
    timestamp: Date.now(),
  };
  alerts.unshift(newAlert);
  if (alerts.length > 100) alerts.pop();
}

function broadcastPacket(packet: WiFiPacket) {
  const data = JSON.stringify(packet);
  sseClients.forEach(client => {
    client.write(`data: ${data}\n\n`);
  });
}

// --- Traffic Simulator ---
// Since we don't have a real WiFi card in monitor mode in Cloud Run, we simulate packets.
function startSimulator() {
  setInterval(() => {
    // Normal traffic
    detectionEngine.processPacket({
      timestamp: Date.now(),
      bssid: KNOWN_AP_BSSID,
      sourceMac: "00:11:22:33:44:55",
      type: "data",
      signalStrength: -40 - Math.random() * 20,
      channel: 6,
    });

    // Random noise / Unknown devices
    if (Math.random() > 0.95) {
      detectionEngine.processPacket({
        timestamp: Date.now(),
        bssid: KNOWN_AP_BSSID,
        sourceMac: `00:DE:AD:${Math.floor(Math.random() * 255).toString(16).padStart(2, '0')}:00:01`,
        type: "data",
        signalStrength: -70 - Math.random() * 20,
        channel: 6,
      });
    }

    // Occasional Deauth Strike
    if (Math.random() > 0.98) {
      detectionEngine.processPacket({
        timestamp: Date.now(),
        bssid: KNOWN_AP_BSSID,
        sourceMac: "attacker-mac-123",
        destMac: "00:11:22:33:44:55",
        type: "deauth",
        signalStrength: -30,
        channel: 6,
      });
    }

    // Rogue AP Simulation
    if (Math.random() > 0.99) {
      detectionEngine.processPacket({
        timestamp: Date.now(),
        ssid: KNOWN_SSID,
        bssid: "FA:KE:AP:00:11:22",
        sourceMac: "FA:KE:AP:00:11:22",
        type: "beacons",
        signalStrength: -20,
        channel: 1,
      });
    }
  }, 500);
}

// --- Server Implementation ---
async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/status", (req, res) => {
    res.json({
      activeAlerts: alerts.length,
      totalDevices: devices.size,
      uptime: process.uptime(),
      monitoring: true,
    });
  });

  app.get("/api/alerts", (req, res) => {
    res.json(alerts);
  });

  app.get("/api/devices", (req, res) => {
    res.json(Array.from(devices.values()));
  });

  app.post("/api/devices/:mac/status", (req, res) => {
    const { mac } = req.params;
    const { status } = req.body;

    if (!["trusted", "unknown", "blocked"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }

    const device = devices.get(mac);
    if (!device) {
      // If we don't know the device yet, we can still pre-register its status
      devices.set(mac, {
        mac,
        status,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        avgSignal: 0
      });
    } else {
      device.status = status;
    }

    if (status === "trusted") {
      trustedMacs.add(mac);
    } else {
      trustedMacs.delete(mac);
    }

    res.json({ message: "Status updated", status, mac });
  });

  app.get("/api/stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();

    sseClients.push(res);

    req.on("close", () => {
      sseClients = sseClients.filter(c => c !== res);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`WIDS Server running on http://localhost:${PORT}`);
    startSimulator();
  });
}

startServer();
