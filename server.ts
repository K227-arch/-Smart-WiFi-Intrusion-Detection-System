import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import https from "https";
import { createServer as createViteServer } from "vite";
import { createClient } from "@insforge/sdk";
import * as ort from "onnxruntime-node";
import { PacketCaptureEngine, type CapturedPacket } from "./src/capture/packetCapture";
import { NetworkAnalyzer, type NetworkAlert, addOwnIp } from "./src/capture/networkAnalyzer";
import { loadSnortRules, matchSnortRule, ensureDefaultRulesFile, type SnortRuleParsed } from "./src/capture/snortRules";

// ── Auto-detect the active WiFi interface ────────────────────────────────────
// Walks all network interfaces and returns the first one that is up, not
// loopback, and has a real IPv4 address.  Prefers en1 (macOS WiFi) then en0.
import os from "os";

function detectActiveInterface(): string {
  const preferred = ["en1", "en0", "wlan0", "wlan1", "wlp2s0"];
  const ifaces = os.networkInterfaces();

  // Try preferred order first
  for (const name of preferred) {
    const addrs = ifaces[name];
    if (addrs?.some((a) => a.family === "IPv4" && !a.internal)) return name;
  }
  // Fall back to any active non-loopback IPv4 interface
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (addrs?.some((a) => a.family === "IPv4" && !a.internal)) return name;
  }
  return "en1"; // last resort
}

const ACTIVE_IFACE = process.env.CAPTURE_IFACE ?? detectActiveInterface();
console.log(`✓ Capture interface: ${ACTIVE_IFACE}`);
import dns from "dns/promises";
async function resolveHostname(ip: string): Promise<string | null> {
  try {
    const hostnames = await dns.reverse(ip);
    return hostnames[0] ?? null;
  } catch {
    return null;
  }
}

// ── Safe fire-and-forget DB write — silently drops on network error ───────────
// The InsForge SDK returns a thenable query builder, not a raw Promise.
// We call .then() on it to execute and swallow network-level errors.
function dbWrite(query: { then: Function } | Promise<any>, label?: string) {
  Promise.resolve().then(() => (query as any).then
    ? (query as any).then((res: any) => {
        if (res?.error) {
          const msg: string = res.error?.message ?? String(res.error);
          if (!msg.includes("fetch failed") && !msg.includes("Network request failed")) {
            console.error(`DB write error${label ? ` (${label})` : ""}:`, msg);
          }
        }
      })
    : query
  ).catch((e: any) => {
    const msg: string = e?.message ?? String(e);
    if (!msg.includes("fetch failed") && !msg.includes("Network request failed")) {
      console.error(`DB write error${label ? ` (${label})` : ""}:`, msg);
    }
  });
}

// ── ONNX Models ───────────────────────────────────────────────────────────────
// Model v1: 5-feature wireless scorer (original)
const MODEL_PATH_V1 = path.join(process.cwd(), "models", "wids_rf.onnx");
// Model v2: 10-feature NSL-KDD network classifier
const MODEL_PATH_V2 = path.join(process.cwd(), "models", "wids_rf_v2.onnx");
// Model v2 NB: lightweight Naive Bayes fallback
const MODEL_PATH_NB = path.join(process.cwd(), "models", "wids_nb_v2.onnx");

let ortSessionV1: ort.InferenceSession | null = null;
let ortSessionV2: ort.InferenceSession | null = null;
let ortSessionNB: ort.InferenceSession | null = null;

async function loadOnnxModel() {
  try {
    ortSessionV1 = await ort.InferenceSession.create(MODEL_PATH_V1);
    console.log("✓ ONNX v1 (wireless RF) loaded");
  } catch (e) { console.warn("⚠ ONNX v1 load failed:", (e as Error).message); }
  try {
    ortSessionV2 = await ort.InferenceSession.create(MODEL_PATH_V2);
    console.log("✓ ONNX v2 (NSL-KDD RF) loaded");
  } catch (e) { console.warn("⚠ ONNX v2 load failed:", (e as Error).message); }
  try {
    ortSessionNB = await ort.InferenceSession.create(MODEL_PATH_NB);
    console.log("✓ ONNX NB (Naive Bayes) loaded");
  } catch (e) { console.warn("⚠ ONNX NB load failed:", (e as Error).message); }
}

/**
 * Run ONNX inference on a single device's features.
 * Returns { score: 0-1, classIndex: 0|1|2 }
 * Features: [packet_rate, deauth_ratio, beacon_ratio, unique_channels, avg_signal_norm]
 */
async function onnxInfer(features: number[]): Promise<{ score: number; classIndex: number }> {
  const session = ortSessionV1;
  if (!session) return heuristicScore(features);

  try {
    const input = new Float32Array(features);
    const tensor = new ort.Tensor("float32", input, [1, 5]);
    const feeds: Record<string, ort.Tensor> = {};
    feeds[session.inputNames[0]] = tensor;
    const results = await session.run(feeds);
    const labelOutput = results[session.outputNames[0]];
    const classIndex = Number(labelOutput.data[0]) as 0 | 1 | 2;
    const probOutput = results[session.outputNames[1]];
    let score = 0;
    if (probOutput?.data) {
      const probs = probOutput.data as Float32Array;
      score = (probs[1] ?? 0) * 0.5 + (probs[2] ?? 0) * 1.0;
    } else {
      score = classIndex === 2 ? 0.9 : classIndex === 1 ? 0.55 : 0.1;
    }
    return { score: Math.min(score, 1), classIndex };
  } catch (e) { return heuristicScore(features); }
}

/**
 * NSL-KDD v2 inference — 10 features, 5 classes
 * Classes: 0=Normal 1=DoS 2=Probe 3=R2L 4=U2R
 */
async function onnxInferV2(features: number[]): Promise<{ classIndex: number; className: string; confidence: number }> {
  const session = ortSessionV2 ?? ortSessionNB;
  if (!session) return { classIndex: 0, className: "Normal", confidence: 1 };
  try {
    const input = new Float32Array(features);
    const tensor = new ort.Tensor("float32", input, [1, 10]);
    const feeds: Record<string, ort.Tensor> = {};
    feeds[session.inputNames[0]] = tensor;
    const results = await session.run(feeds);
    const classIndex = Number(results[session.outputNames[0]].data[0]);
    const classNames = ["Normal", "DoS", "Probe", "R2L", "U2R"];
    const probOutput = results[session.outputNames[1]];
    let confidence = 1;
    if (probOutput?.data) {
      const probs = probOutput.data as Float32Array;
      confidence = probs[classIndex] ?? 1;
    }
    return { classIndex, className: classNames[classIndex] ?? "Unknown", confidence };
  } catch { return { classIndex: 0, className: "Normal", confidence: 1 }; }
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
  // Layer-4 enrichment (populated from real Ethernet/IP capture)
  srcPort?: number;
  dstPort?: number;
  protocol?: "tcp" | "udp" | "icmp";
  srcIp?: string;
  dstIp?: string;
}

interface Alert {
  id: string;
  timestamp: number;
  type: "ROGUE_AP" | "DEAUTH_ATTACK" | "MAC_SPOOFING" | "UNAUTHORIZED_DEVICE" | "CHANNEL_ANOMALY" | "PORT_SCAN" | "BRUTE_FORCE" | "ANOMALY";
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
  ipAddress?: string;
  hostname?: string;
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
    knownNetworks: [],
    trustedMacs: [],
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
let trustedMacs: Set<string> = new Set(config.trustedMacs.map((m) => m.toUpperCase()));
let sseClients: express.Response[] = [];

// ── Auto-trust own machine MACs + gateway so they never flood UNAUTHORIZED alerts
{
  const ifaces = os.networkInterfaces();
  Object.values(ifaces).flat().forEach((a) => {
    if (a && a.mac && a.mac !== "00:00:00:00:00:00") {
      trustedMacs.add(a.mac.toUpperCase());
    }
  });
  // Trust the AP/gateway MAC from config known networks
  config.knownNetworks.forEach((n) => {
    if (n.bssid) trustedMacs.add(n.bssid.toUpperCase());
  });
  console.log(`✓ Auto-trusted ${trustedMacs.size} MACs (own interfaces + configured networks)`);
}

// Register own IPs with the NetworkAnalyzer so it never alerts on our own traffic
{
  const ifaces = os.networkInterfaces();
  Object.values(ifaces).flat().forEach((a) => {
    if (a && a.family === "IPv4" && !a.internal) addOwnIp(a.address);
  });
}

// ── Own machine IPs — computed once for Snort/ML filtering ───────────────────
const OWN_IPS = new Set<string>(
  Object.values(os.networkInterfaces()).flat()
    .filter((a): a is import("os").NetworkInterfaceInfo => !!a && a.family === "IPv4" && !a.internal)
    .map((a) => a.address)
);
const BACKEND_IP_PREFIXES = [
  "3.132.", "3.151.", "18.219.", "52.54.", "98.84.",
  "32.195.", "32.192.", "54.80.", "96.45.", "127.", "169.254.",
];
function isFilteredIp(ip?: string): boolean {
  if (!ip) return true;
  if (OWN_IPS.has(ip)) return true;
  return BACKEND_IP_PREFIXES.some((p) => ip.startsWith(p));
}

// Detection state
const deauthTracker: Map<string, { count: number; windowStart: number }> = new Map();
const ssidBssidMap: Map<string, Set<string>> = new Map();
// Track known channel per BSSID for channel anomaly detection
const bssidChannelMap: Map<string, number> = new Map();
// Per-MAC dedup tracker for UNAUTHORIZED_DEVICE (one alert per new MAC ever)
const unauthorizedAlerted: Set<string> = new Set();

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

// ── Statistical Anomaly Detection Engine ─────────────────────────────────────
// Maintains per-device Welford online statistics for multiple features.
// Fires ANOMALY alerts when any feature deviates beyond Z_THRESHOLD std devs
// from the device's own learned baseline (not a global baseline).
// Requires MIN_SAMPLES windows before alerting to avoid cold-start false positives.

const ANOMALY_Z_THRESHOLD = 3.5;   // standard deviations to trigger alert
const ANOMALY_MIN_SAMPLES = 5;     // minimum windows before alerting
const ANOMALY_DEDUP_MS = 120_000;  // 2-minute dedup per device+feature

interface FeatureStat {
  mean: number;
  m2: number;       // Welford M2 accumulator
  count: number;
}

interface DeviceAnomalyProfile {
  packetRate: FeatureStat;
  deauthRatio: FeatureStat;
  portDiversity: FeatureStat;  // unique dst ports per window
  lastAlertTime: Map<string, number>;  // feature → last alert timestamp
}

const deviceAnomalyProfiles = new Map<string, DeviceAnomalyProfile>();

// Per-device port diversity tracker (unique dst ports seen in current window)
interface PortWindow {
  ports: Set<number>;
  windowStart: number;
}
const devicePortWindows = new Map<string, PortWindow>();

function welfordUpdate(stat: FeatureStat, value: number): void {
  stat.count++;
  const delta = value - stat.mean;
  stat.mean += delta / stat.count;
  const delta2 = value - stat.mean;
  stat.m2 += delta * delta2;
}

function welfordStd(stat: FeatureStat): number {
  if (stat.count < 2) return 1;
  return Math.sqrt(stat.m2 / (stat.count - 1));
}

function welfordZScore(stat: FeatureStat, value: number): number {
  const std = welfordStd(stat);
  if (std === 0) return 0;
  return Math.abs(value - stat.mean) / std;
}

function getOrCreateProfile(mac: string): DeviceAnomalyProfile {
  if (!deviceAnomalyProfiles.has(mac)) {
    deviceAnomalyProfiles.set(mac, {
      packetRate:    { mean: 0, m2: 0, count: 0 },
      deauthRatio:   { mean: 0, m2: 0, count: 0 },
      portDiversity: { mean: 0, m2: 0, count: 0 },
      lastAlertTime: new Map(),
    });
  }
  return deviceAnomalyProfiles.get(mac)!;
}

/**
 * Update a device's anomaly profile with the current window's features.
 * Returns a list of anomalous features (with z-scores) if any exceed the threshold.
 */
function updateAnomalyProfile(
  mac: string,
  packetRate: number,
  deauthRatio: number,
  portDiversity: number
): Array<{ feature: string; value: number; mean: number; std: number; zScore: number }> {
  const profile = getOrCreateProfile(mac);
  const now = Date.now();

  // Update Welford stats
  welfordUpdate(profile.packetRate, packetRate);
  welfordUpdate(profile.deauthRatio, deauthRatio);
  welfordUpdate(profile.portDiversity, portDiversity);

  // Don't alert until we have enough samples for a reliable baseline
  if (profile.packetRate.count < ANOMALY_MIN_SAMPLES) return [];

  const anomalies: Array<{ feature: string; value: number; mean: number; std: number; zScore: number }> = [];

  const checks: Array<{ name: string; stat: FeatureStat; value: number }> = [
    { name: "packetRate",    stat: profile.packetRate,    value: packetRate },
    { name: "deauthRatio",   stat: profile.deauthRatio,   value: deauthRatio },
    { name: "portDiversity", stat: profile.portDiversity, value: portDiversity },
  ];

  for (const { name, stat, value } of checks) {
    const zScore = welfordZScore(stat, value);
    if (zScore >= ANOMALY_Z_THRESHOLD) {
      // Dedup: only fire once per feature per ANOMALY_DEDUP_MS
      const lastAlert = profile.lastAlertTime.get(name) ?? 0;
      if (now - lastAlert >= ANOMALY_DEDUP_MS) {
        profile.lastAlertTime.set(name, now);
        anomalies.push({
          feature: name,
          value,
          mean: stat.mean,
          std: welfordStd(stat),
          zScore,
        });
      }
    }
  }

  return anomalies;
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

// ── Live Packet Capture + Network Analyzer ────────────────────────────────────
const captureEngine = new PacketCaptureEngine(
  ACTIVE_IFACE,
  process.env.CAPTURE_FILTER ?? ""
);
const networkAnalyzer = new NetworkAnalyzer();

// Network alerts from layer 3/4 analysis
let networkAlerts: (NetworkAlert & { id: string })[] = [];

// Forward network analyzer alerts into the main alert system
networkAnalyzer.on("alert", (na: NetworkAlert) => {
  const typeMap: Record<string, Alert["type"]> = {
    ARP_SPOOFING: "MAC_SPOOFING",
    SYN_FLOOD: "DEAUTH_ATTACK",
    PORT_SCAN_TCP: "PORT_SCAN",
    DNS_TUNNELING: "ANOMALY",
    DNS_EXFILTRATION: "ANOMALY",
    ICMP_FLOOD: "DEAUTH_ATTACK",
    TCP_ANOMALY: "CHANNEL_ANOMALY",
    ARP_SCAN: "PORT_SCAN",
    PROTOCOL_ANOMALY: "ANOMALY",
  };
  const alertType = typeMap[na.type] ?? "ANOMALY";
  addAlert({
    type: alertType as Alert["type"],
    severity: na.severity,
    targetMac: na.srcMac ?? na.srcIp ?? "unknown",
    description: na.description,
    details: { ...na.details, networkAlertType: na.type, detectionMethod: na.detectionMethod, srcIp: na.srcIp, dstIp: na.dstIp },
  }, config.dedupWindowMs);

  // Also store in networkAlerts for the dedicated endpoint
  const entry = { ...na, id: Math.random().toString(36).substr(2, 9) };
  networkAlerts.unshift(entry);
  if (networkAlerts.length > 200) networkAlerts.pop();
});

// Forward captured packets to network analyzer + NSL-KDD ML
captureEngine.on("packet", (pkt: CapturedPacket) => {
  networkAnalyzer.processPacket(pkt);

  // ── Bridge real captured packet → WiFi detection engine ──────────────────
  // Ethernet frames from a WiFi interface carry real 802.3 traffic.
  // We map them to the WiFiPacket shape so Rogue AP, Deauth, MAC Spoof,
  // Channel Anomaly, and Unauthorized Device detection all run.
  // Port Scan and Brute Force are intentionally skipped here — those are
  // handled by the NetworkAnalyzer (TCP/UDP layer) which has proper context.
  const wifiPkt: WiFiPacket = {
    timestamp: pkt.timestamp,
    bssid: pkt.dstMac,
    sourceMac: pkt.srcMac,
    destMac: pkt.dstMac,
    // Only classify as deauth/mgmt when we have real 802.11 frame type hints.
    // For plain Ethernet, use "data" so brute-force/port-scan don't false-fire.
    type: "data",
    signalStrength: -50,
    channel: config.knownNetworks[0]?.channel ?? 1,
    ssid: undefined,
    // Enrich with layer-3/4 info from the real captured packet
    srcIp: pkt.srcIp,
    dstIp: pkt.dstIp,
    srcPort: pkt.srcPort,
    dstPort: pkt.dstPort,
    protocol: pkt.protocol === 6 ? "tcp" : pkt.protocol === 17 ? "udp" : pkt.protocol === 1 ? "icmp" : undefined,
  };
  // Only run the WiFi detection checks that make sense for Ethernet capture:
  // unauthorized device, rogue AP (if SSID is known), channel anomaly.
  // Skip port scan and brute force — those come from networkAnalyzer alerts.
  detectionEngine.processPacketEthernetMode(wifiPkt);

  // Run Snort rules — skip own machine and trusted backend IPs
  if (pkt.srcIp && !isFilteredIp(pkt.srcIp)) {
    for (const rule of snortRules) {
      if (matchSnortRule(rule, pkt)) {
        addAlert({
          type: "ANOMALY",
          severity: rule.priority === 1 ? "high" : rule.priority === 2 ? "medium" : "low",
          targetMac: pkt.srcMac,
          description: `[SID:${rule.sid}] ${rule.msg} — src: ${pkt.srcIp} → dst: ${pkt.dstIp ?? pkt.dstMac}`,
          details: { sid: rule.sid, rule: rule.msg, srcIp: pkt.srcIp, dstIp: pkt.dstIp, srcPort: pkt.srcPort, dstPort: pkt.dstPort, method: "snort" },
        }, config.dedupWindowMs * 5);
      }
    }
  }

  // NSL-KDD v2 ML inference — skip own machine and trusted backend IPs
  if (pkt.srcIp && pkt.protocol && !isFilteredIp(pkt.srcIp)) {
    const features = [
      0,
      pkt.protocol === 6 ? 0 : pkt.protocol === 17 ? 1 : 2,
      pkt.length,
      0,
      pkt.srcIp === pkt.dstIp ? 1 : 0,
      0,
      0,
      1,
      1,
      (pkt.tcpFlags !== undefined && (pkt.tcpFlags & 0x02) && !(pkt.tcpFlags & 0x10)) ? 1 : 0,
    ];
    onnxInferV2(features).then(({ classIndex, className, confidence }) => {
      // Require very high confidence (≥0.92) to avoid false positives on normal traffic
      if (classIndex > 0 && confidence >= 0.92) {
        addAlert({
          type: classIndex === 1 ? "DEAUTH_ATTACK" : classIndex === 2 ? "PORT_SCAN" : "ANOMALY",
          severity: classIndex === 1 ? "high" : classIndex === 2 ? "medium" : "high",
          targetMac: pkt.srcMac,
          description: `NSL-KDD ML (v2): ${pkt.srcIp} classified as ${className} (confidence: ${(confidence * 100).toFixed(0)}%).`,
          details: { srcIp: pkt.srcIp, dstIp: pkt.dstIp, className, confidence, classIndex, model: "wids_rf_v2", method: "ml-nslkdd" },
        }, 300_000); // 5-minute dedup per MAC+type
      }
    });
  }
});

// ── Snort Rules ───────────────────────────────────────────────────────────────
const SNORT_RULES_FILE = path.join(process.cwd(), "data", "wids.rules");
ensureDefaultRulesFile(SNORT_RULES_FILE);
let snortRules: SnortRuleParsed[] = loadSnortRules(SNORT_RULES_FILE);

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

    // 5. Unauthorized device — new MAC not in trusted list, alert only once per MAC
    if (!trustedMacs.has(packet.sourceMac.toUpperCase()) && !unauthorizedAlerted.has(packet.sourceMac)) {
      unauthorizedAlerted.add(packet.sourceMac);
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

          // ── Statistical anomaly detection — per-device Welford baseline ──
          // Compute port diversity from the current window's port tracker
          const portWindow = devicePortWindows.get(packet.sourceMac);
          const portDiversity = portWindow ? portWindow.ports.size : 0;
          const anomalies = updateAnomalyProfile(packet.sourceMac, packetRate, deauthRatio, portDiversity);
          for (const a of anomalies) {
            const featureLabel: Record<string, string> = {
              packetRate: "packet rate",
              deauthRatio: "deauth frame ratio",
              portDiversity: "port diversity",
            };
            addAlert({
              type: "ANOMALY",
              severity: a.zScore >= 5 ? "high" : "medium",
              targetMac: packet.sourceMac,
              description: `Statistical anomaly on ${packet.sourceMac}: ${featureLabel[a.feature] ?? a.feature} = ${a.value.toFixed(2)} (z-score ${a.zScore.toFixed(1)}σ above baseline mean ${a.mean.toFixed(2)} ± ${a.std.toFixed(2)}).`,
              details: {
                feature: a.feature,
                value: a.value,
                mean: a.mean,
                std: a.std,
                zScore: a.zScore,
                packetRate,
                deauthRatio,
                portDiversity,
                method: "statistical-anomaly",
              },
            }, ANOMALY_DEDUP_MS);
          }
        } // end if (feat && feat.packetCount > 0)
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

      // Track port diversity for anomaly detection
      if (packet.dstPort) {
        const now2 = Date.now();
        const pw = devicePortWindows.get(packet.sourceMac);
        if (!pw || now2 - pw.windowStart > ML_WINDOW_MS) {
          devicePortWindows.set(packet.sourceMac, { ports: new Set([packet.dstPort]), windowStart: now2 });
        } else {
          pw.ports.add(packet.dstPort);
        }
      }
    }

    // Update device registry
    const existing = devices.get(packet.sourceMac);
    if (existing) {
      existing.lastSeen = Date.now();
      existing.avgSignal = Math.round((existing.avgSignal + packet.signalStrength) / 2);
      if (packet.ssid && !existing.ssid) existing.ssid = packet.ssid;

      // Try to enrich IP from ARP table if not yet resolved
      if (!existing.ipAddress) {
        const arpEntry = networkAnalyzer.getArpTable().find((e) => e.mac === packet.sourceMac);
        const resolvedIp = arpEntry?.ip ?? undefined;
        if (resolvedIp) {
          existing.ipAddress = resolvedIp;
          resolveHostname(resolvedIp).then((hostname) => {
            if (hostname && existing) {
              existing.hostname = hostname;
              dbWrite(db.database.from("devices").update({
                ip_address: resolvedIp,
                hostname,
                updated_at: new Date().toISOString(),
              }).eq("mac", existing.mac), "device hostname update");
            }
          });
          dbWrite(db.database.from("devices").update({
            ip_address: resolvedIp,
            updated_at: new Date().toISOString(),
          }).eq("mac", existing.mac), "device ip update");
        }
      }
    } else {
      // Resolve IP from live ARP table only — no fake IPs
      const arpEntry = networkAnalyzer.getArpTable().find((e) => e.mac === packet.sourceMac);
      const ipAddress = arpEntry?.ip ?? undefined;

      const newDevice: Device = {
        mac: packet.sourceMac,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        status: trustedMacs.has(packet.sourceMac.toUpperCase()) ? "trusted" : "unknown",
        ssid: packet.ssid,
        avgSignal: packet.signalStrength,
        ipAddress,
      };
      devices.set(packet.sourceMac, newDevice);

      // Async hostname resolution
      if (ipAddress) {
        resolveHostname(ipAddress).then((hostname) => {
          if (hostname) {
            newDevice.hostname = hostname;
            dbWrite(db.database.from("devices").update({
              hostname,
              updated_at: new Date().toISOString(),
            }).eq("mac", newDevice.mac), "device hostname");
          }
        });
      }

      broadcastDevice(newDevice);

      // ── Write new device to Insforge (upsert to handle restarts) ──
      dbWrite(db.database.from("devices").upsert([{
        mac: newDevice.mac,
        first_seen: newDevice.firstSeen,
        last_seen: newDevice.lastSeen,
        status: newDevice.status,
        ssid: newDevice.ssid ?? null,
        avg_signal: newDevice.avgSignal,
        ip_address: newDevice.ipAddress ?? null,
        hostname: newDevice.hostname ?? null,
      }]), "device upsert");
    }
  },

  // ── Ethernet-mode processing ──────────────────────────────────────────────
  // Called when packets come from a real Ethernet/WiFi capture (not 802.11 raw).
  // Runs only the detections that are meaningful for Ethernet frames:
  //   - Unauthorized device (new MAC)
  //   - ML feature tracking + anomaly scoring
  //   - Device registry update
  // Skips: Rogue AP, MAC Spoofing, Deauth flood, Channel Anomaly, Port Scan,
  //        Brute Force — those either need 802.11 headers or are handled by
  //        the NetworkAnalyzer at the TCP/UDP layer.
  processPacketEthernetMode: (packet: WiFiPacket) => {
    totalPacketsProcessed++;
    broadcastPacket(packet);
    updateTrafficBucket(packet);

    const { dedupWindowMs } = config;

    // Unauthorized device — new MAC not in trusted list, alert only once per MAC
    if (!trustedMacs.has(packet.sourceMac.toUpperCase()) && !unauthorizedAlerted.has(packet.sourceMac)) {
      unauthorizedAlerted.add(packet.sourceMac);
      addAlert({
        type: "UNAUTHORIZED_DEVICE",
        severity: "low",
        targetMac: packet.sourceMac,
        description: `New unknown device on network: ${packet.sourceMac}.`,
        details: { channel: packet.channel, signal: packet.signalStrength },
      }, dedupWindowMs);
    }

    // ML feature tracking — same as full processPacket
    {
      const now = Date.now();
      let feat = deviceFeatures.get(packet.sourceMac);
      if (!feat || now - feat.windowStart > ML_WINDOW_MS) {
        if (feat && feat.packetCount > 0) {
          const elapsed = (now - feat.windowStart) / 1000 || 1;
          const packetRate = feat.packetCount / elapsed;
          updateBaseline(packetRate);
          const deauthRatio = feat.deauthCount / (feat.packetCount || 1);
          const beaconRatio = feat.beaconCount / (feat.packetCount || 1);
          const uniqueChannels = feat.uniqueChannels.size;
          const avgSig = devices.get(packet.sourceMac)?.avgSignal ?? packet.signalStrength;
          const avgSignalNorm = Math.max(0, Math.min(1, (avgSig + 100) / 80));
          const featureVec = [packetRate, deauthRatio, beaconRatio, uniqueChannels, avgSignalNorm];
          const mac = packet.sourceMac;
          onnxInfer(featureVec).then(({ score, classIndex }) => {
            const classification: MLResultEntry["classification"] =
              classIndex === 2 ? "malicious" : classIndex === 1 ? "suspicious" : "normal";
            const result: MLResultEntry = {
              mac, timestamp: Date.now(), score, classification,
              features: { packetRate, avgSignal: avgSig, uniqueChannels, deauthRatio, beaconRatio },
            };
            const idx = mlResults.findIndex((r) => r.mac === mac);
            if (idx >= 0) mlResults[idx] = result; else mlResults.unshift(result);
            if (mlResults.length > 50) mlResults.pop();
            if (classIndex === 2) {
              addAlert({
                type: "ANOMALY", severity: "high", targetMac: mac,
                description: `ML: ${mac} classified as MALICIOUS (score: ${(score * 100).toFixed(0)}%). Packet rate: ${packetRate.toFixed(1)}/s.`,
                details: { ...result.features, mlScore: score, classIndex, method: "onnx-rf" },
              }, config.dedupWindowMs * 2);
            }
          });

          // ── Statistical anomaly detection (Ethernet mode) ──
          const portWindowE = devicePortWindows.get(packet.sourceMac);
          const portDiversityE = portWindowE ? portWindowE.ports.size : 0;
          const anomaliesE = updateAnomalyProfile(packet.sourceMac, packetRate, deauthRatio, portDiversityE);
          for (const a of anomaliesE) {
            const featureLabel: Record<string, string> = {
              packetRate: "packet rate",
              deauthRatio: "deauth frame ratio",
              portDiversity: "port diversity",
            };
            addAlert({
              type: "ANOMALY",
              severity: a.zScore >= 5 ? "high" : "medium",
              targetMac: packet.sourceMac,
              description: `Statistical anomaly on ${packet.sourceMac}: ${featureLabel[a.feature] ?? a.feature} = ${a.value.toFixed(2)} (z-score ${a.zScore.toFixed(1)}σ above baseline mean ${a.mean.toFixed(2)} ± ${a.std.toFixed(2)}).`,
              details: {
                feature: a.feature,
                value: a.value,
                mean: a.mean,
                std: a.std,
                zScore: a.zScore,
                packetRate,
                deauthRatio,
                portDiversity: portDiversityE,
                method: "statistical-anomaly",
              },
            }, ANOMALY_DEDUP_MS);
          }
        }
        deviceFeatures.set(packet.sourceMac, {
          packetCount: 1, deauthCount: 0, beaconCount: 0, mgmtCount: 0,
          uniqueChannels: new Set([packet.channel]), windowStart: now,
        });
      } else {
        feat.packetCount++;
        feat.uniqueChannels.add(packet.channel);
      }

      // Track port diversity for anomaly detection
      if (packet.dstPort) {
        const now2 = Date.now();
        const pw = devicePortWindows.get(packet.sourceMac);
        if (!pw || now2 - pw.windowStart > ML_WINDOW_MS) {
          devicePortWindows.set(packet.sourceMac, { ports: new Set([packet.dstPort]), windowStart: now2 });
        } else {
          pw.ports.add(packet.dstPort);
        }
      }
    }

    // Update device registry
    const existing = devices.get(packet.sourceMac);
    if (existing) {
      existing.lastSeen = Date.now();
      if (!existing.ipAddress) {
        const arpEntry = networkAnalyzer.getArpTable().find((e) => e.mac === packet.sourceMac);
        if (arpEntry?.ip) {
          existing.ipAddress = arpEntry.ip;
          dbWrite(db.database.from("devices").update({ ip_address: arpEntry.ip, updated_at: new Date().toISOString() }).eq("mac", existing.mac), "device ip");
        }
      }
    } else {
      const arpEntry = networkAnalyzer.getArpTable().find((e) => e.mac === packet.sourceMac);
      const ipAddress = arpEntry?.ip ?? undefined;
      const newDevice: Device = {
        mac: packet.sourceMac, firstSeen: Date.now(), lastSeen: Date.now(),
        status: trustedMacs.has(packet.sourceMac.toUpperCase()) ? "trusted" : "unknown",
        ssid: undefined, avgSignal: packet.signalStrength, ipAddress,
      };
      devices.set(packet.sourceMac, newDevice);
      broadcastDevice(newDevice);
      dbWrite(db.database.from("devices").upsert([{
        mac: newDevice.mac, first_seen: newDevice.firstSeen, last_seen: newDevice.lastSeen,
        status: newDevice.status, ssid: null, avg_signal: newDevice.avgSignal,
        ip_address: newDevice.ipAddress ?? null, hostname: null,
      }]), "device upsert");
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
      dbWrite(db.database.from("traffic_buckets").insert([{
        time: bucket.time,
        data_count: bucket.data,
        beacons_count: bucket.beacons,
        deauth_count: bucket.deauth,
        mgmt_count: bucket.mgmt,
      }]), "traffic bucket");
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
  dbWrite(db.database.from("alerts").insert([{
    id: newAlert.id,
    timestamp: newAlert.timestamp,
    type: newAlert.type,
    severity: newAlert.severity,
    description: newAlert.description,
    target_mac: newAlert.targetMac,
    details: newAlert.details,
    dismissed: false,
  }]), "alert insert");

  // Update detection_stats running totals (best-effort, non-blocking)
  db.database.from("detection_stats").select().eq("id", 1).maybeSingle().then(({ data }) => {
    if (!data) return;
    const dc = { ...(data.detection_counts ?? {}), [alertData.type]: (data.detection_counts?.[alertData.type] ?? 0) + 1 };
    dbWrite(db.database.from("detection_stats").update({
      detection_counts: dc,
      total_packets_processed: totalPacketsProcessed,
      updated_at: new Date().toISOString(),
    }).eq("id", 1), "stats update");
  }).catch(() => {});

  // Broadcast alert via SSE to connected browser clients
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

// --- Server ---
async function startServer() {
  const app = express();
  const PORT = 3000;
  app.use(express.json());

  // ── Local Auth System ─────────────────────────────────────────────────────
  setupLocalAuth(app);

  // GET /api/ml-results
  app.get("/api/ml-results", (_req, res) => {
    res.json(mlResults);
  });

  // ── InsForge Auth Proxy ───────────────────────────────────────────────────
  // The browser can't reach the InsForge backend directly due to TLS cert
  // verification issues on some machines. All /insforge-auth/* requests are
  // proxied through this Express server which already has a working connection.
  const INSFORGE_BASE = "https://bh9n4s8r.us-east.insforge.app";
  const INSFORGE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxODcwMTF9.2i2nCebcymH-w2vXTtlHHCtFwR3ndX_gEKHdYYzTfIo";

  // Helper: make an HTTPS request bypassing TLS cert verification
  function httpsRequest(
    method: string,
    urlStr: string,
    headers: Record<string, string>,
    body?: string
  ): Promise<{ status: number; headers: Record<string, string | string[]>; body: string }> {
    return new Promise((resolve, reject) => {
      const u = new URL(urlStr);
      const options = {
        hostname: u.hostname,
        port: u.port || 443,
        path: u.pathname + u.search,
        method,
        headers: { ...headers, ...(body ? { "content-length": Buffer.byteLength(body).toString() } : {}) },
        rejectUnauthorized: false,
      };
      const req = https.request(options, (res) => {
        let data = "";
        res.on("data", (chunk) => { data += chunk; });
        res.on("end", () => {
          resolve({
            status: res.statusCode ?? 502,
            headers: res.headers as Record<string, string | string[]>,
            body: data,
          });
        });
      });
      req.on("error", reject);
      if (body) req.write(body);
      req.end();
    });
  }

  // Proxy all /insforge-auth/* → InsForge backend, bypassing browser TLS issues
  app.all("/insforge-auth/*", async (req, res) => {
    // Strip the /insforge-auth prefix to get the real InsForge path
    const upstreamPath = req.path.replace(/^\/insforge-auth/, "");
    const qs = req.url.includes("?") ? "?" + req.url.split("?").slice(1).join("?") : "";
    const upstreamUrl = `${INSFORGE_BASE}${upstreamPath}${qs}`;

    try {
      // Forward all headers except host; add anon key if not already present
      const forwardHeaders: Record<string, string> = { "content-type": "application/json" };
      for (const [k, v] of Object.entries(req.headers)) {
        if (k.toLowerCase() === "host") continue;
        if (k.toLowerCase() === "content-length") continue; // recalculated below
        if (typeof v === "string") forwardHeaders[k] = v;
        else if (Array.isArray(v)) forwardHeaders[k] = v[0];
      }
      if (!forwardHeaders["apikey"]) forwardHeaders["apikey"] = INSFORGE_ANON_KEY;
      if (!forwardHeaders["x-anon-key"]) forwardHeaders["x-anon-key"] = INSFORGE_ANON_KEY;

      const body = req.method !== "GET" && req.method !== "HEAD"
        ? JSON.stringify(req.body)
        : undefined;

      const upstream = await httpsRequest(req.method, upstreamUrl, forwardHeaders, body);

      // Relay status + headers (skip hop-by-hop headers)
      const skipHeaders = new Set(["transfer-encoding", "connection", "keep-alive", "upgrade", "content-length"]);
      res.status(upstream.status);
      for (const [key, value] of Object.entries(upstream.headers)) {
        if (!skipHeaders.has(key.toLowerCase())) {
          res.setHeader(key, value);
        }
      }
      res.send(upstream.body);
    } catch (err: any) {
      console.error("[auth-proxy] error:", err.message);
      res.status(502).json({ error: "Auth proxy error", message: err.message });
    }
  });

  // ── User Session Management ───────────────────────────────────────────────
  // POST /api/session/register — called by frontend on login
  // Registers the user's active session so other users can see who's online
  app.post("/api/session/register", async (req, res) => {
    const { userId, email, name, avatarUrl } = req.body;
    if (!userId || !email) return res.status(400).json({ error: "userId and email required" });

    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
      ?? req.socket.remoteAddress
      ?? "unknown";

    // Derive subnet from IP (e.g. 192.168.100.x → 192.168.100)
    const subnet = ip.split(".").slice(0, 3).join(".");
    const now = Date.now();
    const sessionId = `${userId}-${now}`;

    // Upsert session — one active session per user
    dbWrite(db.database.from("user_sessions").upsert([{
      id: sessionId,
      user_id: userId,
      email,
      name: name ?? null,
      avatar_url: avatarUrl ?? null,
      ip_address: ip,
      subnet,
      connected_at: now,
      last_seen_at: now,
      is_active: true,
    }]), "session register");

    // Broadcast to SSE clients so other users see the new session immediately
    const payload = JSON.stringify({ type: "session_join", userId, email, name, ip, subnet });
    sseClients.forEach((c) => c.write(`event: session\ndata: ${payload}\n\n`));

    res.json({ sessionId, ip, subnet });
  });

  // POST /api/session/heartbeat — called every 30s to keep session alive
  app.post("/api/session/heartbeat", async (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) return res.status(400).json({ error: "sessionId required" });
    dbWrite(db.database.from("user_sessions").update({
      last_seen_at: Date.now(),
      is_active: true,
    }).eq("id", sessionId), "session heartbeat");
    res.json({ ok: true });
  });

  // POST /api/session/leave — called on sign-out or page unload
  app.post("/api/session/leave", async (req, res) => {
    const { sessionId, userId, email } = req.body;
    if (sessionId) {
      dbWrite(db.database.from("user_sessions").update({ is_active: false }).eq("id", sessionId), "session leave");
    }
    const payload = JSON.stringify({ type: "session_leave", userId, email });
    sseClients.forEach((c) => c.write(`event: session\ndata: ${payload}\n\n`));
    res.json({ ok: true });
  });

  // GET /api/sessions/active — returns all users currently viewing the dashboard
  app.get("/api/sessions/active", async (_req, res) => {
    // Sessions active in the last 60s
    const cutoff = Date.now() - 60_000;
    const { data, error } = await db.database
      .from("user_sessions")
      .select()
      .eq("is_active", true)
      .gt("last_seen_at", cutoff);
    if (error) return res.json([]);
    res.json(data ?? []);
  });

  // GET /api/snort-rules — live Snort rules (file-based)
  app.get("/api/snort-rules", (_req, res) => {
    res.json(snortRules.map(({ raw, sid, msg, action, protocol, srcIp, srcPort, dstIp, dstPort, enabled, classtype, priority }) =>
      ({ raw, sid, msg, action, protocol, srcIp, srcPort, dstIp, dstPort, enabled, classtype, priority })));
  });

  // POST /api/snort-rules/reload
  app.post("/api/snort-rules/reload", (_req, res) => {
    snortRules = loadSnortRules(SNORT_RULES_FILE);
    res.json({ message: `Reloaded ${snortRules.length} rules`, count: snortRules.length });
  });

  // GET /api/snort-rules/file
  app.get("/api/snort-rules/file", (_req, res) => {
    const content = fs.existsSync(SNORT_RULES_FILE) ? fs.readFileSync(SNORT_RULES_FILE, "utf-8") : "";
    res.json({ content, path: SNORT_RULES_FILE });
  });

  // PUT /api/snort-rules/file
  app.put("/api/snort-rules/file", (req, res) => {
    const { content } = req.body;
    if (typeof content !== "string") return res.status(400).json({ error: "content required" });
    fs.writeFileSync(SNORT_RULES_FILE, content);
    snortRules = loadSnortRules(SNORT_RULES_FILE);
    res.json({ message: `Saved and reloaded ${snortRules.length} rules` });
  });

  // GET /api/anomaly-baseline
  app.get("/api/anomaly-baseline", (_req, res) => {
    res.json({
      avgPacketRate: anomalyBaseline.avgPacketRate.toFixed(2),
      stdPacketRate: getBaselineStd().toFixed(2),
      sampleCount: anomalyBaseline.sampleCount,
      lastUpdated: anomalyBaseline.lastUpdated,
      deviceProfiles: deviceAnomalyProfiles.size,
      zThreshold: ANOMALY_Z_THRESHOLD,
      minSamples: ANOMALY_MIN_SAMPLES,
    });
  });

  // GET /api/network/arp
  app.get("/api/network/arp", (_req, res) => res.json(networkAnalyzer.getArpTable()));

  // GET /api/network/flows
  app.get("/api/network/flows", (_req, res) => res.json(networkAnalyzer.getFlows()));

  // GET /api/network/dns
  app.get("/api/network/dns", (_req, res) => res.json(networkAnalyzer.getDnsRecords()));

  // GET /api/network/alerts
  app.get("/api/network/alerts", (_req, res) => res.json(networkAlerts.slice(0, 100)));

  // GET /api/network/stats
  app.get("/api/network/stats", (_req, res) => {
    res.json({
      capture: captureEngine.getStats(),
      analyzer: networkAnalyzer.getStats(),
      isLiveCapture: captureEngine.isLive(),
      snortRulesLoaded: snortRules.length,
      modelsLoaded: {
        v1_wireless: ortSessionV1 !== null,
        v2_nslkdd: ortSessionV2 !== null,
        nb_fallback: ortSessionNB !== null,
      },
    });
  });

  // POST /api/pcap/replay
  app.post("/api/pcap/replay", async (req, res) => {
    const { filePath, speed = 10 } = req.body;
    if (!filePath) return res.status(400).json({ error: "filePath required" });
    const safePath = path.resolve(process.cwd(), "data", path.basename(filePath));
    if (!fs.existsSync(safePath)) return res.status(404).json({ error: "File not found in data/" });
    res.json({ message: `Replaying ${path.basename(safePath)} at ${speed}x speed` });
    captureEngine.replayPcap(safePath, speed).catch(console.error);
  });

  app.get("/api/status", (_req, res) => {
    res.json({
      activeAlerts: alerts.length,
      totalDevices: devices.size,
      uptime: process.uptime(),
      monitoring: engineActive,
      totalPacketsProcessed,
      detectionCounts,
      trustedDevices: trustedMacs.size,
      activeInterface: ACTIVE_IFACE,
      captureMode: captureEngine.isLive() ? "live" : "simulator",
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
  app.get("/api/devices", (_req, res) => res.json(Array.from(devices.values()).map((d) => ({
    mac: d.mac,
    first_seen: d.firstSeen,
    last_seen: d.lastSeen,
    status: d.status,
    ssid: d.ssid ?? null,
    avg_signal: d.avgSignal,
    ip_address: d.ipAddress ?? null,
    hostname: d.hostname ?? null,
  }))));

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
      trustedMacs.add(mac.toUpperCase());
      unauthorizedAlerted.delete(mac);
    } else {
      trustedMacs.delete(mac.toUpperCase());
    }
    // Persist trusted MACs back to config
    config.trustedMacs = [...trustedMacs];
    saveConfig(config);
    // Sync status to InsForge DB
    dbWrite(db.database.from("devices").update({
      status,
      updated_at: new Date().toISOString(),
    }).eq("mac", mac), "device status update");
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

    // ── Clear stale dismissed/old alerts from DB on startup ──────────────────
    dbWrite(
      db.database.from("alerts").update({ dismissed: true })
        .lt("timestamp", Date.now() - 86_400_000),
      "startup alert cleanup"
    );

    // ── Seed SSID→BSSID and channel maps from saved config ──
    // This primes the detection engine with known-good networks so Rogue AP
    // and Channel Anomaly detection work from the very first real packet.
    config.knownNetworks.forEach((n) => {
      ssidBssidMap.set(n.ssid, new Set([n.bssid]));
      bssidChannelMap.set(n.bssid, n.channel);
    });

    // ── Start live packet capture on the active WiFi interface ──
    captureEngine.start().then((live) => {
      if (live) {
        engineActive = true;
        console.log(`✓ Live capture active on ${ACTIVE_IFACE} — capturing real network traffic`);
      } else {
        console.warn(`⚠ Live capture unavailable on ${ACTIVE_IFACE} — running in simulator mode.`);
        console.warn("  Install Npcap (Windows) or run: sudo npm run setup:capture (macOS/Linux)");
        console.warn("  Simulator will generate synthetic traffic for demo purposes.");
        startSimulator();
      }
    });

    // ── Sync packet count + detection stats to Insforge every 30s ──
    setInterval(() => {
      dbWrite(db.database.from("detection_stats").update({
        detection_counts: detectionCounts,
        total_packets_processed: totalPacketsProcessed,
        updated_at: new Date().toISOString(),
      }).eq("id", 1), "stats sync");
    }, 30_000);
  });
}

// ── Engine active flag — true when either live capture or simulator is running ─
let engineActive = false;

// ── Local Auth System ─────────────────────────────────────────────────────────
// Self-contained email+password auth with 2FA OTP.
// Uses Node's built-in crypto — no external dependencies.
// Users stored in data/wids-users.json, sessions in data/wids-sessions.json.
// OTPs are printed to the server console (dev mode — no email service configured).

interface LocalUser {
  id: string;
  email: string;
  name?: string;
  passwordHash: string;
  passwordSalt: string;
  createdAt: number;
}
interface LocalSession {
  token: string;
  userId: string;
  email: string;
  createdAt: number;
  expiresAt: number;
}
interface PendingOtp {
  email: string;
  otp: string;
  expiresAt: number;
  purpose: "signin" | "signup";
}

const AUTH_DATA_DIR = path.join(process.cwd(), "data");
const USERS_FILE   = path.join(AUTH_DATA_DIR, "wids-users.json");
const SESSIONS_FILE = path.join(AUTH_DATA_DIR, "wids-sessions.json");
const OTP_EXPIRY_MS     = 10 * 60 * 1000;          // 10 minutes
const SESSION_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const pendingOtps = new Map<string, PendingOtp>();  // email → OTP (in-memory)

function loadUsers(): LocalUser[] {
  try {
    if (fs.existsSync(USERS_FILE)) return JSON.parse(fs.readFileSync(USERS_FILE, "utf-8"));
  } catch { /* ignore */ }
  return [];
}
function saveUsers(users: LocalUser[]) {
  try { fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2)); } catch { /* ignore */ }
}
function loadSessions(): LocalSession[] {
  try {
    if (fs.existsSync(SESSIONS_FILE)) {
      const all: LocalSession[] = JSON.parse(fs.readFileSync(SESSIONS_FILE, "utf-8"));
      return all.filter((s) => s.expiresAt > Date.now());
    }
  } catch { /* ignore */ }
  return [];
}
function saveSessions(sessions: LocalSession[]) {
  try { fs.writeFileSync(SESSIONS_FILE, JSON.stringify(sessions, null, 2)); } catch { /* ignore */ }
}
function hashPassword(password: string, salt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err: Error | null, key: Buffer) => {
      if (err) reject(err); else resolve(key.toString("hex"));
    });
  });
}
function generateOtp(): string { return String(crypto.randomInt(100000, 999999)); }
function generateToken(): string { return crypto.randomBytes(32).toString("hex"); }
function printOtp(email: string, otp: string) {
  const padded = email.padEnd(22);
  console.log(`\n╔══════════════════════════════════════╗`);
  console.log(`║  2FA CODE for ${padded}║`);
  console.log(`║  OTP: ${otp}  (expires in 10 min)   ║`);
  console.log(`╚══════════════════════════════════════╝\n`);
}

function requireLocalAuth(req: express.Request, res: express.Response, next: express.NextFunction) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
  const token = auth.slice(7);
  const session = loadSessions().find((s) => s.token === token && s.expiresAt > Date.now());
  if (!session) return res.status(401).json({ error: "Session expired or invalid" });
  (req as any).localUser = session;
  next();
}

function setupLocalAuth(app: express.Express) {
  // POST /api/local-auth/signup
  app.post("/api/local-auth/signup", async (req, res) => {
    const { email, password, name } = req.body ?? {};
    if (!email || !password) return res.status(400).json({ error: "email and password required" });
    if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters" });

    const users = loadUsers();
    if (users.find((u) => u.email.toLowerCase() === email.toLowerCase())) {
      return res.status(409).json({ error: "An account with this email already exists" });
    }

    const salt = crypto.randomBytes(16).toString("hex");
    const passwordHash = await hashPassword(password, salt);
    const newUser: LocalUser = {
      id: crypto.randomBytes(16).toString("hex"),
      email: email.toLowerCase().trim(),
      name: name?.trim() || undefined,
      passwordHash,
      passwordSalt: salt,
      createdAt: Date.now(),
    };
    users.push(newUser);
    saveUsers(users);

    const otp = generateOtp();
    pendingOtps.set(newUser.email, { email: newUser.email, otp, expiresAt: Date.now() + OTP_EXPIRY_MS, purpose: "signup" });
    printOtp(newUser.email, otp);

    res.json({ requireEmailVerification: true, email: newUser.email, devOtp: otp });
  });

  // POST /api/local-auth/signin
  app.post("/api/local-auth/signin", async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) return res.status(400).json({ error: "email and password required" });

    const users = loadUsers();
    const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase().trim());
    if (!user) return res.status(401).json({ error: "Invalid email or password" });

    const hash = await hashPassword(password, user.passwordSalt);
    if (hash !== user.passwordHash) return res.status(401).json({ error: "Invalid email or password" });

    const otp = generateOtp();
    pendingOtps.set(user.email, { email: user.email, otp, expiresAt: Date.now() + OTP_EXPIRY_MS, purpose: "signin" });
    printOtp(user.email, otp);

    res.json({ requireOtp: true, email: user.email, devOtp: otp });
  });

  // POST /api/local-auth/verify-otp
  app.post("/api/local-auth/verify-otp", (req, res) => {
    const { email, otp } = req.body ?? {};
    if (!email || !otp) return res.status(400).json({ error: "email and otp required" });

    const key = email.toLowerCase().trim();
    const pending = pendingOtps.get(key);
    if (!pending) return res.status(400).json({ error: "No pending verification. Please sign in again." });
    if (Date.now() > pending.expiresAt) {
      pendingOtps.delete(key);
      return res.status(400).json({ error: "Code expired. Please sign in again." });
    }
    if (pending.otp !== String(otp).trim()) {
      return res.status(400).json({ error: "Invalid code. Please check and try again." });
    }

    pendingOtps.delete(key);
    const users = loadUsers();
    const user = users.find((u) => u.email.toLowerCase() === key);
    if (!user) return res.status(404).json({ error: "User not found" });

    const token = generateToken();
    const sessions = loadSessions();
    sessions.push({ token, userId: user.id, email: user.email, createdAt: Date.now(), expiresAt: Date.now() + SESSION_EXPIRY_MS });
    saveSessions(sessions);

    res.json({ accessToken: token, user: { id: user.id, email: user.email, name: user.name } });
  });

  // POST /api/local-auth/resend-otp
  app.post("/api/local-auth/resend-otp", (req, res) => {
    const { email } = req.body ?? {};
    if (!email) return res.status(400).json({ error: "email required" });

    const users = loadUsers();
    const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase().trim());
    if (!user) return res.status(404).json({ error: "No account found for this email" });

    const otp = generateOtp();
    pendingOtps.set(user.email, { email: user.email, otp, expiresAt: Date.now() + OTP_EXPIRY_MS, purpose: "signin" });
    printOtp(user.email, otp);

    res.json({ sent: true, email: user.email, devOtp: otp });
  });

  // GET /api/local-auth/me
  app.get("/api/local-auth/me", requireLocalAuth, (req, res) => {
    const session = (req as any).localUser as LocalSession;
    const user = loadUsers().find((u) => u.id === session.userId);
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ user: { id: user.id, email: user.email, name: user.name } });
  });

  // POST /api/local-auth/signout
  app.post("/api/local-auth/signout", (req, res) => {
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) {
      const token = auth.slice(7);
      saveSessions(loadSessions().filter((s) => s.token !== token));
    }
    res.json({ ok: true });
  });

  console.log("✓ Local auth system ready");
}

// ── Simulator — generates synthetic WiFi + network traffic when libpcap is unavailable ──
// Produces realistic-looking packets including occasional attack patterns so all
// detection engines (signature, anomaly, ML) have data to work with.
function startSimulator() {
  const MACS = [
    "AA:BB:CC:11:22:33", "DE:AD:BE:EF:00:01", "11:22:33:44:55:66",
    "CA:FE:BA:BE:00:01", "00:11:22:33:44:55", "FF:EE:DD:CC:BB:AA",
  ];
  const SSIDS = ["Enterprise_Secure_WiFi", "HomeNet_5G", "GuestWiFi", "IoT_Network"];
  const CHANNELS = [1, 6, 11, 36, 40, 44, 48];
  const KNOWN_BSSID = "DE:AD:BE:EF:00:01";
  const KNOWN_SSID = config.knownNetworks[0]?.ssid ?? "Enterprise_Secure_WiFi";

  // Common dst ports for realistic traffic
  const COMMON_PORTS = [80, 443, 22, 53, 8080, 3389, 445, 21, 23, 25, 110, 143, 3306, 5432];

  let tick = 0;

  const interval = setInterval(() => {
    tick++;
    const mac = MACS[Math.floor(Math.random() * MACS.length)];
    const types: WiFiPacket["type"][] = ["data", "data", "data", "mgmt", "beacons", "deauth"];
    const type = types[Math.floor(Math.random() * types.length)];
    const channel = CHANNELS[Math.floor(Math.random() * CHANNELS.length)];
    const signal = -40 - Math.random() * 50;
    const srcPort = 1024 + Math.floor(Math.random() * 60000);
    const dstPort = COMMON_PORTS[Math.floor(Math.random() * COMMON_PORTS.length)];

    const packet: WiFiPacket = {
      timestamp: Date.now(),
      sourceMac: mac,
      destMac: MACS[Math.floor(Math.random() * MACS.length)],
      bssid: KNOWN_BSSID,
      ssid: type === "beacons" ? SSIDS[Math.floor(Math.random() * SSIDS.length)] : undefined,
      type,
      signalStrength: signal,
      channel,
      srcPort,
      dstPort,
      protocol: Math.random() > 0.3 ? "tcp" : "udp",
      srcIp: `192.168.${Math.floor(Math.random() * 3)}.${10 + Math.floor(Math.random() * 240)}`,
      dstIp: `192.168.1.${1 + Math.floor(Math.random() * 50)}`,
    };

    // Inject attack patterns periodically
    if (tick % 80 === 0) {
      // Deauth flood burst
      for (let i = 0; i < 8; i++) {
        detectionEngine.processPacket({ ...packet, type: "deauth", sourceMac: "EV:IL:MA:C0:00:01" });
      }
    }
    if (tick % 120 === 0) {
      // Rogue AP — known SSID from wrong BSSID
      detectionEngine.processPacket({
        ...packet, type: "beacons",
        ssid: KNOWN_SSID,
        bssid: "BA:D0:BA:D0:BA:D0",
        sourceMac: "BA:D0:BA:D0:BA:D0",
      });
    }
    if (tick % 60 === 0) {
      // Port scan burst — many different dst ports from same source
      const scannerMac = "5C:4N:MA:C0:00:01";
      for (let p = 20; p < 40; p++) {
        detectionEngine.processPacket({
          ...packet, type: "data",
          sourceMac: scannerMac,
          dstPort: p,
          srcIp: "10.0.0.99",
          dstIp: "192.168.1.1",
        });
      }
    }

    detectionEngine.processPacket(packet);
  }, 200); // 5 packets/sec baseline

  // Clean up on process exit
  process.on("SIGINT", () => { clearInterval(interval); process.exit(0); });
  process.on("SIGTERM", () => { clearInterval(interval); process.exit(0); });

  console.log("✓ Simulator started — generating synthetic traffic at 5 pkt/s");
  engineActive = true;
}

startServer();
loadOnnxModel();
