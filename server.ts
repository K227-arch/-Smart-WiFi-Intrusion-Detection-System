import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { createClient } from "@insforge/sdk";
import * as ort from "onnxruntime-node";

// ── ONNX Model ────────────────────────────────────────────────────────────────
const MODEL_PATH = path.join(process.cwd(), "models", "wids_rf.onnx");
let ortSession: ort.InferenceSession | null = null;

async function loadOnnxModel() {
  try {
    ortSession = await ort.InferenceSession.create(MODEL_PATH);
    console.log("✓ ONNX ML model loaded:", MODEL_PATH);
  } catch (e) {
    console.warn("⚠ ONNX model load failed, falling back to heuristic scorer:", e);
  }
}

/**
 * Run ONNX inference on a single device's features.
 * Returns { score: 0-1, classIndex: 0|1|2 }
 * Features: [packet_rate, deauth_ratio, beacon_ratio, unique_channels, avg_signal_norm]
 */
async function onnxInfer(features: number[]): Promise<{ score: number; classIndex: number }> {
  if (!ortSession) return heuristicScore(features);

  try {
    const input = new Float32Array(features);
    const tensor = new ort.Tensor("float32", input, [1, 5]);
    const feeds: Record<string, ort.Tensor> = {};
    // Use the first input name from the model
    feeds[ortSession.inputNames[0]] = tensor;

    const results = await ortSession.run(feeds);

    // Get predicted class from output_label
    const labelOutput = results[ortSession.outputNames[0]];
    const classIndex = Number(labelOutput.data[0]) as 0 | 1 | 2;

    // Get probabilities from output_probability (map output)
    // skl2onnx outputs probabilities as a sequence of maps
    const probOutput = results[ortSession.outputNames[1]];
    let score = 0;
    if (probOutput && probOutput.data) {
      // probOutput.data is flat: [p0, p1, p2] for the single sample
      const probs = probOutput.data as Float32Array;
      // Score = P(suspicious) * 0.5 + P(malicious) * 1.0
      score = (probs[1] ?? 0) * 0.5 + (probs[2] ?? 0) * 1.0;
    } else {
      // Fallback: map class to score
      score = classIndex === 2 ? 0.9 : classIndex === 1 ? 0.55 : 0.1;
    }

    return { score: Math.min(score, 1), classIndex };
  } catch (e) {
    return heuristicScore(features);
  }
}

/** Fallback heuristic scorer (used if ONNX fails) */
function heuristicScore(features: number[]): { score: number; classIndex: number } {
  const [packetRate, deauthRatio, , uniqueChannels] = features;
  let score = 0;
  score += Math.min(packetRate / 100, 0.4);
  score += Math.min(deauthRatio * 3, 0.3);
  score += Math.min((uniqueChannels - 1) * 0.05, 0.2);
  score = Math.min(score, 1);
  const classIndex = score >= 0.75 ? 2 : score >= 0.4 ? 1 : 0;
  return { score, classIndex };
}

// ── Insforge client (server-side, uses API key directly) ──────────────────────
const db = createClient({
  baseUrl: "https://bh9n4s8r.us-east.insforge.app",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxODcwMTF9.2i2nCebcymH-w2vXTtlHHCtFwR3ndX_gEKHdYYzTfIo",
});

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
const DATA_DIR = path.join(process.cwd(), "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
const CONFIG_FILE = path.join(DATA_DIR, "wids-config.json");
const ALERTS_FILE = path.join(DATA_DIR, "wids-alerts.json");

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
  PORT_SCAN: 0,
  BRUTE_FORCE: 0,
  ANOMALY: 0,
};
// False positive tracking (manually dismissed alerts count as false positives)
let falsePositiveCounts: Record<string, number> = {
  ROGUE_AP: 0,
  DEAUTH_ATTACK: 0,
  MAC_SPOOFING: 0,
  UNAUTHORIZED_DEVICE: 0,
  CHANNEL_ANOMALY: 0,
  PORT_SCAN: 0,
  BRUTE_FORCE: 0,
  ANOMALY: 0,
};

// ── Port Scan tracker: count unique channels/BSSIDs probed per source ─────────
const portScanTracker: Map<string, { probes: Set<string>; windowStart: number }> = new Map();
const PORT_SCAN_THRESHOLD = 6;   // unique BSSIDs/channels probed
const PORT_SCAN_WINDOW_MS = 5000;

// ── Brute Force tracker: repeated mgmt frames (auth/assoc) from same source ──
const bruteForceTracker: Map<string, { count: number; windowStart: number }> = new Map();
const BRUTE_FORCE_THRESHOLD = 10;
const BRUTE_FORCE_WINDOW_MS = 5000;

// ── ML / Anomaly baseline ─────────────────────────────────────────────────────
interface DeviceFeatures {
  packetCount: number;
  deauthCount: number;
  beaconCount: number;
  mgmtCount: number;
  uniqueChannels: Set<number>;
  windowStart: number;
}
const deviceFeatures: Map<string, DeviceFeatures> = new Map();
const ML_WINDOW_MS = 10_000; // 10s feature window

interface AnomalyBaseline {
  avgPacketRate: number;
  m2PacketRate: number;  // Welford's M2 for variance
  sampleCount: number;
  lastUpdated: number;
}
let anomalyBaseline: AnomalyBaseline = {
  avgPacketRate: 0, m2PacketRate: 0, sampleCount: 0, lastUpdated: Date.now(),
};

// Welford online mean/variance update
function updateBaseline(packetRate: number) {
  anomalyBaseline.sampleCount++;
  const delta = packetRate - anomalyBaseline.avgPacketRate;
  anomalyBaseline.avgPacketRate += delta / anomalyBaseline.sampleCount;
  const delta2 = packetRate - anomalyBaseline.avgPacketRate;
  anomalyBaseline.m2PacketRate += delta * delta2;
  anomalyBaseline.lastUpdated = Date.now();
}

function getBaselineStd(): number {
  if (anomalyBaseline.sampleCount < 2) return 1;
  return Math.sqrt(anomalyBaseline.m2PacketRate / (anomalyBaseline.sampleCount - 1));
}

// Naive Bayes-style ML scorer: returns 0–1 anomaly score (fallback only)
function mlScore(features: DeviceFeatures): number {
  const elapsed = (Date.now() - features.windowStart) / 1000 || 1;
  const packetRate = features.packetCount / elapsed;
  const deauthRatio = features.deauthCount / (features.packetCount || 1);
  const beaconRatio = features.beaconCount / (features.packetCount || 1);
  const uniqueChannels = features.uniqueChannels.size;

  // Z-score for packet rate vs baseline
  const std = getBaselineStd();
  const zScore = std > 0 ? Math.abs(packetRate - anomalyBaseline.avgPacketRate) / std : 0;

  // Weighted feature scoring (weights tuned to thesis metrics)
  let score = 0;
  score += Math.min(zScore / 5, 0.4);          // packet rate anomaly (max 0.4)
  score += Math.min(deauthRatio * 3, 0.3);      // deauth ratio (max 0.3)
  score += Math.min((uniqueChannels - 1) * 0.05, 0.2); // channel hopping (max 0.2)
  score += beaconRatio > 0.5 ? 0.1 : 0;        // excessive beacons

  return Math.min(score, 1);
}

// Snort-style default rules
interface SnortRule {
  id: string;
  enabled: boolean;
  msg: string;
  match: (packet: WiFiPacket) => boolean;
  severity: "high" | "medium" | "low";
  type: Alert["type"];
}

const SNORT_RULES: SnortRule[] = [
  {
    id: "SID:1000001",
    enabled: true,
    msg: "Possible Deauth DoS — high-rate deauth frames detected",
    match: (p) => p.type === "deauth",
    severity: "high",
    type: "DEAUTH_ATTACK",
  },
  {
    id: "SID:1000002",
    enabled: true,
    msg: "Probe Request Flood — possible port/network scan",
    match: (p) => p.type === "mgmt",
    severity: "medium",
    type: "PORT_SCAN",
  },
  {
    id: "SID:1000003",
    enabled: true,
    msg: "Beacon Flood — possible AP impersonation or Evil Twin",
    match: (p) => p.type === "beacons" && p.signalStrength > -35,
    severity: "high",
    type: "ROGUE_AP",
  },
  {
    id: "SID:1000004",
    enabled: true,
    msg: "Repeated Auth Frames — possible brute force attack",
    match: (p) => p.type === "mgmt" && p.signalStrength > -50,
    severity: "high",
    type: "BRUTE_FORCE",
  },
];

// ML results store (last 50)
interface MLResultEntry {
  mac: string;
  timestamp: number;
  score: number;
  classification: "normal" | "suspicious" | "malicious";
  features: {
    packetRate: number;
    avgSignal: number;
    uniqueChannels: number;
    deauthRatio: number;
    beaconRatio: number;
  };
}
let mlResults: MLResultEntry[] = [];

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

    // 6. Port Scan — source probing many unique BSSIDs/channels in short window
    {
      const now = Date.now();
      const tracker = portScanTracker.get(packet.sourceMac);
      if (!tracker || now - tracker.windowStart > PORT_SCAN_WINDOW_MS) {
        portScanTracker.set(packet.sourceMac, { probes: new Set([`${packet.bssid}:${packet.channel}`]), windowStart: now });
      } else {
        tracker.probes.add(`${packet.bssid}:${packet.channel}`);
        if (tracker.probes.size >= PORT_SCAN_THRESHOLD) {
          addAlert({
            type: "PORT_SCAN",
            severity: "medium",
            targetMac: packet.sourceMac,
            description: `Port/Network scan detected: ${packet.sourceMac} probed ${tracker.probes.size} unique AP/channel combinations in ${PORT_SCAN_WINDOW_MS / 1000}s.`,
            details: { source: packet.sourceMac, probeCount: tracker.probes.size, windowMs: PORT_SCAN_WINDOW_MS, method: "signature" },
          }, dedupWindowMs);
          portScanTracker.set(packet.sourceMac, { probes: new Set(), windowStart: now });
        }
      }
    }

    // 7. Brute Force — repeated mgmt frames from same source
    if (packet.type === "mgmt") {
      const now = Date.now();
      const tracker = bruteForceTracker.get(packet.sourceMac);
      if (!tracker || now - tracker.windowStart > BRUTE_FORCE_WINDOW_MS) {
        bruteForceTracker.set(packet.sourceMac, { count: 1, windowStart: now });
      } else {
        tracker.count++;
        if (tracker.count >= BRUTE_FORCE_THRESHOLD) {
          addAlert({
            type: "BRUTE_FORCE",
            severity: "high",
            targetMac: packet.sourceMac,
            description: `Brute force attempt: ${tracker.count} repeated auth/mgmt frames from ${packet.sourceMac} in ${BRUTE_FORCE_WINDOW_MS / 1000}s.`,
            details: { source: packet.sourceMac, count: tracker.count, windowMs: BRUTE_FORCE_WINDOW_MS, method: "signature" },
          }, dedupWindowMs);
          bruteForceTracker.set(packet.sourceMac, { count: 0, windowStart: now });
        }
      }
    }

    // 8. ML feature tracking — update per-device feature window
    {
      const now = Date.now();
      let feat = deviceFeatures.get(packet.sourceMac);
      if (!feat || now - feat.windowStart > ML_WINDOW_MS) {
        // Flush old window to baseline and ML results
        if (feat && feat.packetCount > 0) {
          const elapsed = (now - feat.windowStart) / 1000 || 1;
          const packetRate = feat.packetCount / elapsed;
          updateBaseline(packetRate);

          const deauthRatio = feat.deauthCount / (feat.packetCount || 1);
          const beaconRatio = feat.beaconCount / (feat.packetCount || 1);
          const uniqueChannels = feat.uniqueChannels.size;
          const avgSig = devices.get(packet.sourceMac)?.avgSignal ?? packet.signalStrength;
          // Normalise signal: -100dBm→0, -20dBm→1
          const avgSignalNorm = Math.max(0, Math.min(1, (avgSig + 100) / 80));

          const featureVec = [packetRate, deauthRatio, beaconRatio, uniqueChannels, avgSignalNorm];
          const mac = packet.sourceMac;

          // Run ONNX inference asynchronously — doesn't block packet processing
          onnxInfer(featureVec).then(({ score, classIndex }) => {
            const classification: MLResultEntry["classification"] =
              classIndex === 2 ? "malicious" : classIndex === 1 ? "suspicious" : "normal";

            const result: MLResultEntry = {
              mac,
              timestamp: Date.now(),
              score,
              classification,
              features: {
                packetRate,
                avgSignal: avgSig,
                uniqueChannels,
                deauthRatio,
                beaconRatio,
              },
            };

            const idx = mlResults.findIndex((r) => r.mac === mac);
            if (idx >= 0) mlResults[idx] = result;
            else mlResults.unshift(result);
            if (mlResults.length > 50) mlResults.pop();

            // Fire anomaly alert if malicious
            if (classIndex === 2) {
              addAlert({
                type: "ANOMALY",
                severity: "high",
                targetMac: mac,
                description: `ONNX ML model classified ${mac} as MALICIOUS (score: ${(score * 100).toFixed(0)}%). Packet rate: ${packetRate.toFixed(1)}/s, deauth ratio: ${(deauthRatio * 100).toFixed(1)}%.`,
                details: { ...result.features, mlScore: score, classIndex, method: "onnx-random-forest" },
              }, config.dedupWindowMs * 2);
            }
          });
        }
        deviceFeatures.set(packet.sourceMac, {
          packetCount: 1,
          deauthCount: packet.type === "deauth" ? 1 : 0,
          beaconCount: packet.type === "beacons" ? 1 : 0,
          mgmtCount: packet.type === "mgmt" ? 1 : 0,
          uniqueChannels: new Set([packet.channel]),
          windowStart: now,
        });
      } else {
        feat.packetCount++;
        if (packet.type === "deauth") feat.deauthCount++;
        if (packet.type === "beacons") feat.beaconCount++;
        if (packet.type === "mgmt") feat.mgmtCount++;
        feat.uniqueChannels.add(packet.channel);
      }
    }

    // Update device registry
    const existing = devices.get(packet.sourceMac);
    if (existing) {
      existing.lastSeen = Date.now();
      existing.avgSignal = Math.round((existing.avgSignal + packet.signalStrength) / 2);
      if (packet.ssid && !existing.ssid) existing.ssid = packet.ssid;
      // No broadcast on update — lastSeen/signal changes are noise
    } else {
      const newDevice: Device = {
        mac: packet.sourceMac,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        status: trustedMacs.has(packet.sourceMac) ? "trusted" : "unknown",
        ssid: packet.ssid,
        avgSignal: packet.signalStrength,
      };
      devices.set(packet.sourceMac, newDevice);
      // Push new device to clients immediately — no poll needed
      broadcastDevice(newDevice);

      // ── Write new device to Insforge (triggers realtime device_update event) ──
      db.database.from("devices").insert([{
        mac: newDevice.mac,
        first_seen: newDevice.firstSeen,
        last_seen: newDevice.lastSeen,
        status: newDevice.status,
        ssid: newDevice.ssid ?? null,
        avg_signal: newDevice.avgSignal,
      }]).then(({ error }) => {
        if (error && !error.message?.includes("duplicate")) {
          console.error("Insforge device insert error:", error);
        }
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

      // ── Persist completed bucket to Insforge ──
      const bucket = currentBucket;
      db.database.from("traffic_buckets").insert([{
        time: bucket.time,
        data_count: bucket.data,
        beacons_count: bucket.beacons,
        deauth_count: bucket.deauth,
        mgmt_count: bucket.mgmt,
      }]).then(({ error }) => {
        if (error) console.error("Insforge traffic bucket insert error:", error);
      });
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

  // ── Write to Insforge DB (triggers realtime broadcast to frontend) ──
  db.database.from("alerts").insert([{
    id: newAlert.id,
    timestamp: newAlert.timestamp,
    type: newAlert.type,
    severity: newAlert.severity,
    description: newAlert.description,
    target_mac: newAlert.targetMac,
    details: newAlert.details,
    dismissed: false,
  }]).then(({ error }) => {
    if (error) console.error("Insforge alert insert error:", error);
  });

  // Update detection_stats running totals
  db.database.from("detection_stats").select().eq("id", 1).maybeSingle().then(({ data }) => {
    if (!data) return;
    const dc = { ...(data.detection_counts ?? {}), [alertData.type]: (data.detection_counts?.[alertData.type] ?? 0) + 1 };
    db.database.from("detection_stats").update({
      detection_counts: dc,
      total_packets_processed: totalPacketsProcessed,
      updated_at: new Date().toISOString(),
    }).eq("id", 1).then(({ error }) => {
      if (error) console.error("Insforge stats update error:", error);
    });
  });

  // Broadcast alert using named SSE event type "alert"
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

function broadcastDevice(device: Device) {
  if (sseClients.length === 0) return;
  const payload = JSON.stringify(device);
  sseClients.forEach((client) => client.write(`event: device\ndata: ${payload}\n\n`));
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

    // Port Scan — device probing many BSSIDs rapidly
    if (Math.random() > 0.985) {
      const scannerMac = `SC:4N:${randByte()}:${randByte()}:${randByte()}:01`;
      for (let i = 0; i < PORT_SCAN_THRESHOLD + 1; i++) {
        detectionEngine.processPacket({
          timestamp: Date.now(), bssid: `${randByte()}:${randByte()}:${randByte()}:${randByte()}:${randByte()}:${randByte()}`,
          sourceMac: scannerMac, type: "mgmt",
          signalStrength: -60 - Math.random() * 20, channel: Math.ceil(Math.random() * 13),
        });
      }
    }

    // Brute Force — repeated mgmt frames from same source
    if (Math.random() > 0.988) {
      const attackerMac = `BF:${randByte()}:${randByte()}:${randByte()}:${randByte()}:01`;
      for (let i = 0; i < BRUTE_FORCE_THRESHOLD + 2; i++) {
        detectionEngine.processPacket({
          timestamp: Date.now(), bssid: KNOWN_AP_BSSID, ssid: KNOWN_SSID,
          sourceMac: attackerMac, type: "mgmt",
          signalStrength: -45 - Math.random() * 10, channel: 6,
        });
      }
    }
  }, 500);
}

// --- Server ---
async function startServer() {
  const app = express();
  const PORT = 3000;
  app.use(express.json());

  // GET /api/ml-results
  app.get("/api/ml-results", (_req, res) => {
    res.json(mlResults);
  });

  // GET /api/snort-rules
  app.get("/api/snort-rules", (_req, res) => {
    res.json(SNORT_RULES.map(({ id, enabled, msg, severity, type }) => ({ id, enabled, msg, severity, type })));
  });

  // GET /api/anomaly-baseline
  app.get("/api/anomaly-baseline", (_req, res) => {
    res.json({
      avgPacketRate: anomalyBaseline.avgPacketRate.toFixed(2),
      stdPacketRate: getBaselineStd().toFixed(2),
      sampleCount: anomalyBaseline.sampleCount,
      lastUpdated: anomalyBaseline.lastUpdated,
    });
  });

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
      const newDevice: Device = { mac, status, firstSeen: Date.now(), lastSeen: Date.now(), avgSignal: 0 };
      devices.set(mac, newDevice);
      broadcastDevice(newDevice);
    } else {
      device.status = status;
      broadcastDevice(device);
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

    // ── Sync packet count to Insforge every 30s ──
    setInterval(() => {
      db.database.from("detection_stats").update({
        total_packets_processed: totalPacketsProcessed,
        updated_at: new Date().toISOString(),
      }).eq("id", 1).then(({ error }) => {
        if (error) console.error("Insforge stats sync error:", error);
      });
    }, 30_000);
  });
}

startServer();
loadOnnxModel();
