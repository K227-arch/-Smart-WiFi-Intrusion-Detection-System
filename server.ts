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

// Deauth threshold tracking: count deauth packets per source MAC in a rolling window
const deauthTracker: Map<string, { count: number; windowStart: number }> = new Map();
const DEAUTH_THRESHOLD = 5;       // packets
const DEAUTH_WINDOW_MS = 3000;    // 3-second rolling window

// MAC spoofing: track which BSSIDs have been seen for each SSID
const ssidBssidMap: Map<string, Set<string>> = new Map();

// Traffic stats for chart (rolling 10-minute buckets)
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
const BUCKET_INTERVAL_MS = 30_000; // 30-second buckets

// System stats
let totalPacketsProcessed = 0;
let detectionCounts = { ROGUE_AP: 0, DEAUTH_ATTACK: 0, MAC_SPOOFING: 0, UNAUTHORIZED_DEVICE: 0 };

// --- Detection Engine Logic ---
const detectionEngine = {
  processPacket: (packet: WiFiPacket) => {
    totalPacketsProcessed++;

    // 0. Broadcast packet for real-time view
    broadcastPacket(packet);

    // Update rolling traffic bucket
    updateTrafficBucket(packet);

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

    // 2. MAC Spoofing Detection
    // If a SSID is being broadcast by a BSSID we haven't seen before AND we already know that SSID
    if (packet.ssid && packet.type === "beacons") {
      if (!ssidBssidMap.has(packet.ssid)) {
        ssidBssidMap.set(packet.ssid, new Set([packet.bssid]));
      } else {
        const knownBssids = ssidBssidMap.get(packet.ssid)!;
        if (!knownBssids.has(packet.bssid)) {
          // New BSSID for a known SSID — potential MAC spoofing / Evil Twin
          addAlert({
            type: "MAC_SPOOFING",
            severity: "high",
            targetMac: packet.bssid,
            description: `MAC Spoofing suspected: SSID "${packet.ssid}" now seen from new BSSID ${packet.bssid}. Previously known BSSIDs: ${[...knownBssids].join(", ")}.`,
            details: { ssid: packet.ssid, newBssid: packet.bssid, knownBssids: [...knownBssids] },
          });
          knownBssids.add(packet.bssid);
        }
      }
    }

    // 3. Deauthentication Attack Detection (threshold-based)
    if (packet.type === "deauth") {
      const now = Date.now();
      const key = packet.sourceMac;
      const tracker = deauthTracker.get(key);

      if (!tracker || now - tracker.windowStart > DEAUTH_WINDOW_MS) {
        // Start a new window
        deauthTracker.set(key, { count: 1, windowStart: now });
      } else {
        tracker.count++;
        if (tracker.count >= DEAUTH_THRESHOLD) {
          addAlert({
            type: "DEAUTH_ATTACK",
            severity: "high",
            targetMac: packet.destMac || "broadcast",
            description: `Deauthentication flood detected! ${tracker.count} deauth frames from ${packet.sourceMac} within ${DEAUTH_WINDOW_MS / 1000}s. Possible DoS attack targeting ${packet.destMac || "network"}.`,
            details: { source: packet.sourceMac, count: tracker.count, windowMs: DEAUTH_WINDOW_MS },
          });
          // Reset to avoid alert spam
          deauthTracker.set(key, { count: 0, windowStart: now });
        }
      }
    }

    // 4. Unauthorized Device Detection
    if (!trustedMacs.has(packet.sourceMac) && !devices.has(packet.sourceMac)) {
      addAlert({
        type: "UNAUTHORIZED_DEVICE",
        severity: "medium",
        targetMac: packet.sourceMac,
        description: `New unknown device discovered on network: ${packet.sourceMac}`,
        details: { ssid: packet.ssid, channel: packet.channel },
      });
    }

    // Update Device Registry
    const existing = devices.get(packet.sourceMac);
    if (existing) {
      existing.lastSeen = Date.now();
      existing.avgSignal = (existing.avgSignal + packet.signalStrength) / 2;
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
    const label = new Date(now).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
    currentBucket = { time: label, data: 0, beacons: 0, deauth: 0, mgmt: 0 };
  }
  if (packet.type === "data") currentBucket!.data++;
  else if (packet.type === "beacons") currentBucket!.beacons++;
  else if (packet.type === "deauth") currentBucket!.deauth++;
  else if (packet.type === "mgmt") currentBucket!.mgmt++;
}

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
  if (alerts.length > 200) alerts.pop();

  // Track detection counts for analytics
  detectionCounts[alertData.type] = (detectionCounts[alertData.type] || 0) + 1;

  // Broadcast alert to SSE clients
  const alertData2 = JSON.stringify({ event: "alert", data: newAlert });
  sseClients.forEach(client => {
    client.write(`data: ${alertData2}\n\n`);
  });
}

function broadcastPacket(packet: WiFiPacket) {
  const data = JSON.stringify({ event: "packet", data: packet });
  sseClients.forEach(client => {
    client.write(`data: ${data}\n\n`);
  });
}

// --- Traffic Simulator ---
// Since we don't have a real WiFi card in monitor mode in Cloud Run, we simulate packets.
function startSimulator() {
  // Seed known SSID/BSSID mapping so MAC spoofing detection works
  ssidBssidMap.set(KNOWN_SSID, new Set([KNOWN_AP_BSSID]));

  // Seed a few known devices
  const knownDevices = [
    { mac: "00:11:22:33:44:55", ssid: KNOWN_SSID },
    { mac: "AA:BB:CC:DD:EE:FF", ssid: KNOWN_SSID },
    { mac: "11:22:33:44:55:66", ssid: "Guest_WiFi" },
  ];
  knownDevices.forEach(d => {
    devices.set(d.mac, {
      mac: d.mac,
      firstSeen: Date.now() - Math.random() * 3600000,
      lastSeen: Date.now(),
      status: trustedMacs.has(d.mac) ? "trusted" : "unknown",
      ssid: d.ssid,
      avgSignal: -45 - Math.random() * 20,
    });
  });

  let deauthBurstActive = false;
  let deauthBurstCount = 0;

  setInterval(() => {
    // Normal trusted device traffic
    detectionEngine.processPacket({
      timestamp: Date.now(),
      bssid: KNOWN_AP_BSSID,
      ssid: KNOWN_SSID,
      sourceMac: "00:11:22:33:44:55",
      type: "data",
      signalStrength: -40 - Math.random() * 20,
      channel: 6,
    });

    // Second trusted device
    if (Math.random() > 0.6) {
      detectionEngine.processPacket({
        timestamp: Date.now(),
        bssid: KNOWN_AP_BSSID,
        ssid: KNOWN_SSID,
        sourceMac: "AA:BB:CC:DD:EE:FF",
        type: "data",
        signalStrength: -50 - Math.random() * 15,
        channel: 6,
      });
    }

    // Beacon frames from legitimate AP
    if (Math.random() > 0.7) {
      detectionEngine.processPacket({
        timestamp: Date.now(),
        bssid: KNOWN_AP_BSSID,
        ssid: KNOWN_SSID,
        sourceMac: KNOWN_AP_BSSID,
        type: "beacons",
        signalStrength: -30 - Math.random() * 10,
        channel: 6,
      });
    }

    // Random unknown device appearing
    if (Math.random() > 0.95) {
      const randByte = () => Math.floor(Math.random() * 255).toString(16).padStart(2, '0').toUpperCase();
      detectionEngine.processPacket({
        timestamp: Date.now(),
        bssid: KNOWN_AP_BSSID,
        sourceMac: `00:DE:AD:${randByte()}:${randByte()}:01`,
        type: "data",
        signalStrength: -70 - Math.random() * 20,
        channel: 6,
      });
    }

    // Deauth burst simulation (fires a burst of DEAUTH_THRESHOLD+ packets)
    if (!deauthBurstActive && Math.random() > 0.992) {
      deauthBurstActive = true;
      deauthBurstCount = 0;
    }
    if (deauthBurstActive) {
      detectionEngine.processPacket({
        timestamp: Date.now(),
        bssid: KNOWN_AP_BSSID,
        sourceMac: "C0:FF:EE:AT:TA:CK",
        destMac: "00:11:22:33:44:55",
        type: "deauth",
        signalStrength: -30,
        channel: 6,
      });
      deauthBurstCount++;
      if (deauthBurstCount >= DEAUTH_THRESHOLD + 2) {
        deauthBurstActive = false;
      }
    }

    // Rogue AP simulation (Evil Twin)
    if (Math.random() > 0.993) {
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

    // MAC Spoofing simulation: new BSSID broadcasting a known SSID
    if (Math.random() > 0.997) {
      const randByte = () => Math.floor(Math.random() * 255).toString(16).padStart(2, '0').toUpperCase();
      const spoofedBssid = `SP:00:FE:${randByte()}:${randByte()}:${randByte()}`;
      detectionEngine.processPacket({
        timestamp: Date.now(),
        ssid: "Guest_WiFi",
        bssid: spoofedBssid,
        sourceMac: spoofedBssid,
        type: "beacons",
        signalStrength: -35,
        channel: 11,
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
      totalPacketsProcessed,
      detectionCounts,
      trustedDevices: [...trustedMacs].length,
    });
  });

  app.get("/api/alerts", (req, res) => {
    res.json(alerts);
  });

  app.get("/api/devices", (req, res) => {
    res.json(Array.from(devices.values()));
  });

  // Traffic chart data (real rolling buckets)
  app.get("/api/traffic/chart", (req, res) => {
    const allBuckets = currentBucket ? [...trafficBuckets, currentBucket] : [...trafficBuckets];
    res.json(allBuckets.slice(-12)); // last 12 buckets
  });

  // Analytics summary
  app.get("/api/analytics", (req, res) => {
    const total = Object.values(detectionCounts).reduce((a, b) => a + b, 0);
    res.json({
      detectionCounts,
      totalDetections: total,
      totalPacketsProcessed,
      deviceBreakdown: {
        trusted: [...devices.values()].filter(d => d.status === "trusted").length,
        unknown: [...devices.values()].filter(d => d.status === "unknown").length,
        blocked: [...devices.values()].filter(d => d.status === "blocked").length,
      },
      alertSeverityBreakdown: {
        high: alerts.filter(a => a.severity === "high").length,
        medium: alerts.filter(a => a.severity === "medium").length,
        low: alerts.filter(a => a.severity === "low").length,
      },
    });
  });

  // Export logs as CSV
  app.get("/api/alerts/export", (req, res) => {
    const header = "ID,Timestamp,Type,Severity,Target MAC,Description\n";
    const rows = alerts.map(a =>
      `"${a.id}","${new Date(a.timestamp).toISOString()}","${a.type}","${a.severity}","${a.targetMac}","${a.description.replace(/"/g, '""')}"`
    ).join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="wids-alerts-${Date.now()}.csv"`);
    res.send(header + rows);
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

    // Send a heartbeat comment every 15s to keep connection alive
    const heartbeat = setInterval(() => {
      res.write(": heartbeat\n\n");
    }, 15000);

    sseClients.push(res);

    req.on("close", () => {
      clearInterval(heartbeat);
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
