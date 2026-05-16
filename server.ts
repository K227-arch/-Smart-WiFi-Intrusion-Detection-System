import express from "express";
import path from "path";
import fs from "fs";
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
  type: "ROGUE_AP" | "DEAUTH_ATTACK" | "MAC_SPOOFING" | "UNAUTHORIZED_DEVICE" | "CHANNEL_ANOMALY";
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

// Engine configuration — editable at runtime via API
interface EngineConfig {
  knownNetworks: Array<{ ssid: string; bssid: string; channel: number }>;
  trustedMacs: string[];
  deauthThreshold: number;
  deauthWindowMs: number;
  dedupWindowMs: number;
}

// --- Persistence helpers ---
const CONFIG_FILE = path.join(process.cwd(), "wids-config.json");
const ALERTS_FILE = path.join(process.cwd(), "wids-alerts.json");

function loadConfig(): EngineConfig {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
    }
  } catch (e) {
    console.warn("Could not load config, using defaults:", e);
  }
  return {
    knownNetworks: [{ ssid: "Enterprise_Secure_WiFi", bssid: "DE:AD:BE:EF:00:01", channel: 6 }],
    trustedMacs: ["00:11:22:33:44:55", "AA:BB:CC:DD:EE:FF"],
    deauthThreshold: 5,
    deauthWindowMs: 3000,
    dedupWindowMs: 10000,
  };
}

function saveConfig(cfg: EngineConfig) {
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
  } catch (e) {
    console.error("Could not save config:", e);
  }
}

function loadAlerts(): Alert[] {
  try {
    if (fs.existsSync(ALERTS_FILE)) {
      const data: Alert[] = JSON.parse(fs.readFileSync(ALERTS_FILE, "utf-8"));
      // Only keep alerts from the last 24 hours
      const cutoff = Date.now() - 86_400_000;
      return data.filter((a) => a.timestamp > cutoff);
    }
  } catch (e) {
    console.warn("Could not load alerts:", e);
  }
  return [];
}

function saveAlerts(alerts: Alert[]) {
  try {
    fs.writeFileSync(ALERTS_FILE, JSON.stringify(alerts.slice(0, 200)));
  } catch (e) {
    console.error("Could not save alerts:", e);
  }
}

// --- Global State ---
let config: EngineConfig = loadConfig();
let alerts: Alert[] = loadAlerts();
let devices: Map<string, Device> = new Map();
let trustedMacs: Set<string> = new Set(config.trustedMacs);
let sseClients: express.Response[] = [];

// Detection state
const deauthTracker: Map<string, { count: number; windowStart: number }> = new Map();
const ssidBssidMap: Map<string, Set<string>> = new Map();
// Track known channel per BSSID for channel anomaly detection
const bssidChannelMap: Map<string, number> = new Map();

// Traffic stats
interface TrafficBucket {
  time: string;
  data: number;
  beacons: number;
  deauth: number;
  mgmt: number;
}
let trafficBuckets: TrafficBucket[] = [];
let currentBucket: TrafficBucket | null = null;
let bucketStartTime = 0;
const BUCKET_INTERVAL_MS = 30_000;

// System stats — track total and per-type for real accuracy calculation
let totalPacketsProcessed = 0;
let detectionCounts: Record<string, number> = {
  ROGUE_AP: 0,
  DEAUTH_ATTACK: 0,
  MAC_SPOOFING: 0,
  UNAUTHORIZED_DEVICE: 0,
  CHANNEL_ANOMALY: 0,
};
// False positive tracking (manually dismissed alerts count as false positives)
let falsePositiveCounts: Record<string, number> = {
  ROGUE_AP: 0,
  DEAUTH_ATTACK: 0,
  MAC_SPOOFING: 0,
  UNAUTHORIZED_DEVICE: 0,
  CHANNEL_ANOMALY: 0,
};

// --- Detection Engine ---
const detectionEngine = {
  processPacket: (packet: WiFiPacket) => {
    totalPacketsProcessed++;
    broadcastPacket(packet);
    updateTrafficBucket(packet);

    const { knownNetworks, dedupWindowMs } = config;

    // 1. Rogue AP — SSID matches a known network but BSSID is different
    if (packet.ssid && packet.type === "beacons") {
      const knownNet = knownNetworks.find((n) => n.ssid === packet.ssid);
      if (knownNet && packet.bssid !== knownNet.bssid) {
        addAlert({
          type: "ROGUE_AP",
          severity: "high",
          targetMac: packet.bssid,
          description: `Rogue AP detected: SSID "${packet.ssid}" broadcast from unauthorized BSSID ${packet.bssid}. Expected ${knownNet.bssid}.`,
          details: { expectedBssid: knownNet.bssid, actualBssid: packet.bssid, ssid: packet.ssid },
        }, dedupWindowMs);
      }
    }

    // 2. MAC Spoofing — known SSID appearing from a new BSSID
    if (packet.ssid && packet.type === "beacons") {
      if (!ssidBssidMap.has(packet.ssid)) {
        ssidBssidMap.set(packet.ssid, new Set([packet.bssid]));
      } else {
        const knownBssids = ssidBssidMap.get(packet.ssid)!;
        if (!knownBssids.has(packet.bssid)) {
          addAlert({
            type: "MAC_SPOOFING",
            severity: "high",
            targetMac: packet.bssid,
            description: `MAC Spoofing: SSID "${packet.ssid}" now seen from new BSSID ${packet.bssid}. Known BSSIDs: ${[...knownBssids].join(", ")}.`,
            details: { ssid: packet.ssid, newBssid: packet.bssid, knownBssids: [...knownBssids] },
          }, dedupWindowMs);
          knownBssids.add(packet.bssid);
        }
      }
    }

    // 3. Deauth flood — threshold-based rolling window
    if (packet.type === "deauth") {
      const now = Date.now();
      const tracker = deauthTracker.get(packet.sourceMac);
      if (!tracker || now - tracker.windowStart > config.deauthWindowMs) {
        deauthTracker.set(packet.sourceMac, { count: 1, windowStart: now });
      } else {
        tracker.count++;
        if (tracker.count >= config.deauthThreshold) {
          addAlert({
            type: "DEAUTH_ATTACK",
            severity: "high",
            targetMac: packet.destMac || "broadcast",
            description: `Deauth flood: ${tracker.count} frames from ${packet.sourceMac} in ${config.deauthWindowMs / 1000}s. DoS attack targeting ${packet.destMac || "network"}.`,
            details: { source: packet.sourceMac, count: tracker.count, windowMs: config.deauthWindowMs },
          }, dedupWindowMs);
          deauthTracker.set(packet.sourceMac, { count: 0, windowStart: now });
        }
      }
    }

    // 4. Channel anomaly — known BSSID suddenly on a different channel
    if (packet.bssid && packet.channel) {
      const knownChannel = bssidChannelMap.get(packet.bssid);
      if (knownChannel === undefined) {
        bssidChannelMap.set(packet.bssid, packet.channel);
      } else if (knownChannel !== packet.channel) {
        addAlert({
          type: "CHANNEL_ANOMALY",
          severity: "medium",
          targetMac: packet.bssid,
          description: `Channel anomaly: BSSID ${packet.bssid} moved from channel ${knownChannel} to ${packet.channel}. Possible Evil Twin or channel hopping attack.`,
          details: { bssid: packet.bssid, previousChannel: knownChannel, newChannel: packet.channel },
        }, dedupWindowMs);
        bssidChannelMap.set(packet.bssid, packet.channel);
      }
    }

    // 5. Unauthorized device — new MAC not in trusted list
    if (!trustedMacs.has(packet.sourceMac) && !devices.has(packet.sourceMac)) {
      addAlert({
        type: "UNAUTHORIZED_DEVICE",
        severity: "low",
        targetMac: packet.sourceMac,
        description: `New unknown device on network: ${packet.sourceMac}${packet.ssid ? ` (SSID: ${packet.ssid})` : ""} on channel ${packet.channel}.`,
        details: { ssid: packet.ssid, channel: packet.channel, signal: packet.signalStrength },
      }, dedupWindowMs);
    }

    // Update device registry
    const existing = devices.get(packet.sourceMac);
    if (existing) {
      existing.lastSeen = Date.now();
      existing.avgSignal = Math.round((existing.avgSignal + packet.signalStrength) / 2);
      if (packet.ssid && !existing.ssid) existing.ssid = packet.ssid;
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

function updateTrafficBucket(packet: WiFiPacket) {
  const now = Date.now();
  if (!currentBucket || now - bucketStartTime > BUCKET_INTERVAL_MS) {
    if (currentBucket) {
      trafficBuckets.push(currentBucket);
      if (trafficBuckets.length > 20) trafficBuckets.shift();
    }
    bucketStartTime = now;
    const label = new Date(now).toLocaleTimeString("en-US", {
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    });
    currentBucket = { time: label, data: 0, beacons: 0, deauth: 0, mgmt: 0 };
  }
  if (packet.type === "data") currentBucket!.data++;
  else if (packet.type === "beacons") currentBucket!.beacons++;
  else if (packet.type === "deauth") currentBucket!.deauth++;
  else if (packet.type === "mgmt") currentBucket!.mgmt++;
}

function addAlert(alertData: Omit<Alert, "id" | "timestamp">, dedupWindowMs: number) {
  const recent = alerts.find(
    (a) =>
      a.type === alertData.type &&
      a.targetMac === alertData.targetMac &&
      Date.now() - a.timestamp < dedupWindowMs
  );
  if (recent) return;

  const newAlert: Alert = {
    ...alertData,
    id: Math.random().toString(36).substr(2, 9),
    timestamp: Date.now(),
  };
  alerts.unshift(newAlert);
  if (alerts.length > 200) alerts.pop();

  detectionCounts[alertData.type] = (detectionCounts[alertData.type] || 0) + 1;

  saveAlerts(alerts);

  // Broadcast alert using named SSE event type "alert"
  // Clients can listen with es.addEventListener("alert", ...) — no packet noise
  const payload = JSON.stringify(newAlert);
  sseClients.forEach((client) => client.write(`event: alert\ndata: ${payload}\n\n`));
}

function broadcastPacket(packet: WiFiPacket) {
  // Only broadcast if there are clients — skip serialization otherwise
  if (sseClients.length === 0) return;
  // Use named SSE event type "packet" so alert-only listeners can ignore these
  const payload = JSON.stringify(packet);
  sseClients.forEach((client) => client.write(`event: packet\ndata: ${payload}\n\n`));
}

// --- Simulator ---
function startSimulator() {
  // Seed SSID→BSSID map from config
  config.knownNetworks.forEach((n) => {
    ssidBssidMap.set(n.ssid, new Set([n.bssid]));
    bssidChannelMap.set(n.bssid, n.channel);
  });

  // Seed known devices
  const seedDevices = [
    { mac: "00:11:22:33:44:55", ssid: "Enterprise_Secure_WiFi" },
    { mac: "AA:BB:CC:DD:EE:FF", ssid: "Enterprise_Secure_WiFi" },
    { mac: "11:22:33:44:55:66", ssid: "Guest_WiFi" },
  ];
  seedDevices.forEach((d) => {
    devices.set(d.mac, {
      mac: d.mac,
      firstSeen: Date.now() - Math.random() * 3_600_000,
      lastSeen: Date.now(),
      status: trustedMacs.has(d.mac) ? "trusted" : "unknown",
      ssid: d.ssid,
      avgSignal: -45 - Math.random() * 20,
    });
  });

  const KNOWN_AP_BSSID = config.knownNetworks[0]?.bssid ?? "DE:AD:BE:EF:00:01";
  const KNOWN_SSID = config.knownNetworks[0]?.ssid ?? "Enterprise_Secure_WiFi";

  let deauthBurstActive = false;
  let deauthBurstCount = 0;

  setInterval(() => {
    const randByte = () =>
      Math.floor(Math.random() * 255).toString(16).padStart(2, "0").toUpperCase();

    // Normal data traffic — trusted devices
    detectionEngine.processPacket({
      timestamp: Date.now(), bssid: KNOWN_AP_BSSID, ssid: KNOWN_SSID,
      sourceMac: "00:11:22:33:44:55", type: "data",
      signalStrength: -40 - Math.random() * 20, channel: 6,
    });

    if (Math.random() > 0.6) {
      detectionEngine.processPacket({
        timestamp: Date.now(), bssid: KNOWN_AP_BSSID, ssid: KNOWN_SSID,
        sourceMac: "AA:BB:CC:DD:EE:FF", type: "data",
        signalStrength: -50 - Math.random() * 15, channel: 6,
      });
    }

    // Beacon frames from legitimate AP
    if (Math.random() > 0.7) {
      detectionEngine.processPacket({
        timestamp: Date.now(), bssid: KNOWN_AP_BSSID, ssid: KNOWN_SSID,
        sourceMac: KNOWN_AP_BSSID, type: "beacons",
        signalStrength: -30 - Math.random() * 10, channel: 6,
      });
    }

    // Management frames (probe requests, association, etc.)
    if (Math.random() > 0.65) {
      detectionEngine.processPacket({
        timestamp: Date.now(), bssid: KNOWN_AP_BSSID,
        sourceMac: Math.random() > 0.5 ? "00:11:22:33:44:55" : "AA:BB:CC:DD:EE:FF",
        type: "mgmt", signalStrength: -55 - Math.random() * 20, channel: 6,
      });
    }

    // Unknown device appearing
    if (Math.random() > 0.95) {
      detectionEngine.processPacket({
        timestamp: Date.now(), bssid: KNOWN_AP_BSSID,
        sourceMac: `00:DE:AD:${randByte()}:${randByte()}:01`,
        type: "data", signalStrength: -70 - Math.random() * 20, channel: 6,
      });
    }

    // Deauth burst
    if (!deauthBurstActive && Math.random() > 0.992) {
      deauthBurstActive = true;
      deauthBurstCount = 0;
    }
    if (deauthBurstActive) {
      detectionEngine.processPacket({
        timestamp: Date.now(), bssid: KNOWN_AP_BSSID,
        sourceMac: "C0:FF:EE:AT:TA:CK", destMac: "00:11:22:33:44:55",
        type: "deauth", signalStrength: -30, channel: 6,
      });
      deauthBurstCount++;
      if (deauthBurstCount >= config.deauthThreshold + 2) deauthBurstActive = false;
    }

    // Rogue AP (Evil Twin)
    if (Math.random() > 0.993) {
      detectionEngine.processPacket({
        timestamp: Date.now(), ssid: KNOWN_SSID, bssid: "FA:KE:AP:00:11:22",
        sourceMac: "FA:KE:AP:00:11:22", type: "beacons",
        signalStrength: -20, channel: 1,
      });
    }

    // MAC Spoofing — new BSSID for known SSID
    if (Math.random() > 0.997) {
      const spoofedBssid = `SP:00:FE:${randByte()}:${randByte()}:${randByte()}`;
      detectionEngine.processPacket({
        timestamp: Date.now(), ssid: "Guest_WiFi", bssid: spoofedBssid,
        sourceMac: spoofedBssid, type: "beacons",
        signalStrength: -35, channel: 11,
      });
    }

    // Channel anomaly — legitimate AP suddenly on wrong channel
    if (Math.random() > 0.998) {
      detectionEngine.processPacket({
        timestamp: Date.now(), ssid: KNOWN_SSID, bssid: KNOWN_AP_BSSID,
        sourceMac: KNOWN_AP_BSSID, type: "beacons",
        signalStrength: -25, channel: 11, // wrong channel
      });
    }
  }, 500);
}

// --- Server ---
async function startServer() {
  const app = express();
  const PORT = 3000;
  app.use(express.json());

  // GET /api/status
  app.get("/api/status", (_req, res) => {
    res.json({
      activeAlerts: alerts.length,
      totalDevices: devices.size,
      uptime: process.uptime(),
      monitoring: true,
      totalPacketsProcessed,
      detectionCounts,
      trustedDevices: trustedMacs.size,
    });
  });

  // GET /api/alerts
  app.get("/api/alerts", (_req, res) => res.json(alerts));

  // DELETE /api/alerts/:id  — dismiss a single alert (counts as false positive)
  app.delete("/api/alerts/:id", (req, res) => {
    const { id } = req.params;
    const idx = alerts.findIndex((a) => a.id === id);
    if (idx === -1) return res.status(404).json({ error: "Alert not found" });
    const [removed] = alerts.splice(idx, 1);
    falsePositiveCounts[removed.type] = (falsePositiveCounts[removed.type] || 0) + 1;
    saveAlerts(alerts);
    res.json({ message: "Alert dismissed", id });
  });

  // DELETE /api/alerts — clear all alerts
  app.delete("/api/alerts", (_req, res) => {
    alerts = [];
    saveAlerts(alerts);
    res.json({ message: "All alerts cleared" });
  });

  // GET /api/devices
  app.get("/api/devices", (_req, res) => res.json(Array.from(devices.values())));

  // POST /api/devices/:mac/status
  app.post("/api/devices/:mac/status", (req, res) => {
    const { mac } = req.params;
    const { status } = req.body;
    if (!["trusted", "unknown", "blocked"].includes(status)) {
      return res.status(400).json({ error: "Invalid status" });
    }
    const device = devices.get(mac);
    if (!device) {
      devices.set(mac, { mac, status, firstSeen: Date.now(), lastSeen: Date.now(), avgSignal: 0 });
    } else {
      device.status = status;
    }
    if (status === "trusted") {
      trustedMacs.add(mac);
    } else {
      trustedMacs.delete(mac);
    }
    // Persist trusted MACs back to config
    config.trustedMacs = [...trustedMacs];
    saveConfig(config);
    res.json({ message: "Status updated", status, mac });
  });

  // GET /api/traffic/chart
  app.get("/api/traffic/chart", (_req, res) => {
    const all = currentBucket ? [...trafficBuckets, currentBucket] : [...trafficBuckets];
    res.json(all.slice(-12));
  });

  // GET /api/analytics
  app.get("/api/analytics", (_req, res) => {
    const total = Object.values(detectionCounts).reduce((a, b) => a + b, 0);
    // Real accuracy: (detections - false positives) / detections * 100
    const accuracyByType: Record<string, number> = {};
    for (const type of Object.keys(detectionCounts)) {
      const detected = detectionCounts[type] || 0;
      const fp = falsePositiveCounts[type] || 0;
      accuracyByType[type] = detected > 0 ? Math.round(((detected - fp) / detected) * 100) : 100;
    }
    res.json({
      detectionCounts,
      falsePositiveCounts,
      accuracyByType,
      totalDetections: total,
      totalPacketsProcessed,
      deviceBreakdown: {
        trusted: [...devices.values()].filter((d) => d.status === "trusted").length,
        unknown: [...devices.values()].filter((d) => d.status === "unknown").length,
        blocked: [...devices.values()].filter((d) => d.status === "blocked").length,
      },
      alertSeverityBreakdown: {
        high: alerts.filter((a) => a.severity === "high").length,
        medium: alerts.filter((a) => a.severity === "medium").length,
        low: alerts.filter((a) => a.severity === "low").length,
      },
    });
  });

  // GET /api/config — get engine configuration
  app.get("/api/config", (_req, res) => res.json(config));

  // PUT /api/config — update engine configuration
  app.put("/api/config", (req, res) => {
    const body = req.body as Partial<EngineConfig>;
    if (body.knownNetworks !== undefined) config.knownNetworks = body.knownNetworks;
    if (body.trustedMacs !== undefined) {
      config.trustedMacs = body.trustedMacs;
      trustedMacs = new Set(body.trustedMacs);
    }
    if (body.deauthThreshold !== undefined) config.deauthThreshold = Number(body.deauthThreshold);
    if (body.deauthWindowMs !== undefined) config.deauthWindowMs = Number(body.deauthWindowMs);
    if (body.dedupWindowMs !== undefined) config.dedupWindowMs = Number(body.dedupWindowMs);
    saveConfig(config);
    res.json({ message: "Config updated", config });
  });

  // GET /api/alerts/export — CSV download
  app.get("/api/alerts/export", (_req, res) => {
    const header = "ID,Timestamp,Type,Severity,Target MAC,Description\n";
    const rows = alerts
      .map(
        (a) =>
          `"${a.id}","${new Date(a.timestamp).toISOString()}","${a.type}","${a.severity}","${a.targetMac}","${a.description.replace(/"/g, '""')}"`
      )
      .join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="salamanda-alerts-${Date.now()}.csv"`);
    res.send(header + rows);
  });

  // GET /api/stream — SSE
  app.get("/api/stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 15_000);
    sseClients.push(res);
    req.on("close", () => {
      clearInterval(heartbeat);
      sseClients = sseClients.filter((c) => c !== res);
    });
  });

  // Vite / static
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SALAMANDA WIDS running on http://localhost:${PORT}`);
    startSimulator();
  });
}

startServer();
