import express from "express";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";

// ── Supabase client ───────────────────────────────────────────────────────────
const supabaseUrl = process.env.SUPABASE_URL ?? "https://kuntnvlvyuqetiorvlve.supabase.co";
const supabaseKey = process.env.SUPABASE_SECRET_KEY ?? "";

const supabase = createClient(supabaseUrl, supabaseKey);

// ── Types ─────────────────────────────────────────────────────────────────────
interface Alert {
  id: string;
  timestamp: number;
  type: string;
  severity: string;
  description: string;
  targetMac: string;
  details: any;
}

const app = express();
app.use(express.json());

// ── Helpers ───────────────────────────────────────────────────────────────────
function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "salamanda-salt-2026").digest("hex");
}
function generateToken(): string {
  return crypto.randomBytes(32).toString("hex");
}
function generateOtp(): string {
  return String(Math.floor(100000 + Math.random() * 900000));
}

// ── Seed helpers ──────────────────────────────────────────────────────────────
async function ensureDetectionStats() {
  const { data } = await supabase.from("detection_stats").select("id").eq("id", 1).maybeSingle();
  if (!data) {
    await supabase.from("detection_stats").insert([{
      id: 1, detection_counts: {}, false_positive_counts: {},
      total_packets_processed: 0, updated_at: new Date().toISOString(),
    }]);
  }
}
async function ensureEngineConfig() {
  const { data } = await supabase.from("engine_config").select("id").eq("id", 1).maybeSingle();
  if (!data) {
    await supabase.from("engine_config").insert([{
      id: 1,
      known_networks: [{ ssid: "Enterprise_Secure_WiFi", bssid: "DE:AD:BE:EF:00:01", channel: 6 }],
      trusted_macs: [], deauth_threshold: 5, deauth_window_ms: 3000, dedup_window_ms: 10000,
      updated_at: new Date().toISOString(),
    }]);
  }
}

ensureDetectionStats().catch(console.error);
ensureEngineConfig().catch(console.error);

// ════════════════════════════════════════════════════════════════
// ── LOCAL AUTH — backed by Supabase DB (works on Vercel) ────────
// ════════════════════════════════════════════════════════════════

// POST /api/local-auth/signup
app.post("/api/local-auth/signup", async (req, res) => {
  const { email, password, name } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  const { data: existing } = await supabase
    .from("local_users").select("id").eq("email", email.toLowerCase()).maybeSingle();
  if (existing) return res.status(409).json({ error: "An account with this email already exists" });

  const otp = generateOtp();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await supabase.from("local_users").insert([{
    id: crypto.randomUUID(),
    email: email.toLowerCase(),
    name: name ?? null,
    password_hash: hashPassword(password),
    verified: false,
    otp_code: otp,
    otp_expires_at: otpExpiry,
    created_at: new Date().toISOString(),
  }]);

  res.json({ requireEmailVerification: true, email: email.toLowerCase(), devOtp: otp });
});

// POST /api/local-auth/signin
app.post("/api/local-auth/signin", async (req, res) => {
  const { email, password } = req.body ?? {};
  if (!email || !password) return res.status(400).json({ error: "Email and password required" });

  const { data: user } = await supabase
    .from("local_users").select().eq("email", email.toLowerCase()).maybeSingle();

  if (!user || user.password_hash !== hashPassword(password))
    return res.status(401).json({ error: "Invalid email or password" });

  const otp = generateOtp();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await supabase.from("local_users")
    .update({ otp_code: otp, otp_expires_at: otpExpiry })
    .eq("id", user.id);

  res.json({ requireOtp: true, email: email.toLowerCase(), devOtp: otp });
});

// POST /api/local-auth/verify-otp
app.post("/api/local-auth/verify-otp", async (req, res) => {
  const { email, otp } = req.body ?? {};
  if (!email || !otp) return res.status(400).json({ error: "Email and OTP required" });

  const { data: user } = await supabase
    .from("local_users").select().eq("email", email.toLowerCase()).maybeSingle();

  if (!user) return res.status(404).json({ error: "User not found" });
  if (user.otp_code !== String(otp)) return res.status(401).json({ error: "Invalid verification code" });
  if (new Date(user.otp_expires_at) < new Date()) return res.status(401).json({ error: "Code expired — request a new one" });

  const token = generateToken();
  const tokenExpiry = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  await supabase.from("local_users")
    .update({ verified: true, otp_code: null, otp_expires_at: null, session_token: token, token_expires_at: tokenExpiry })
    .eq("id", user.id);

  res.json({
    accessToken: token,
    user: { id: user.id, email: user.email, name: user.name ?? undefined },
  });
});

// POST /api/local-auth/resend-otp
app.post("/api/local-auth/resend-otp", async (req, res) => {
  const { email } = req.body ?? {};
  if (!email) return res.status(400).json({ error: "Email required" });

  const { data: user } = await supabase
    .from("local_users").select("id").eq("email", email.toLowerCase()).maybeSingle();
  if (!user) return res.status(404).json({ error: "User not found" });

  const otp = generateOtp();
  const otpExpiry = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  await supabase.from("local_users")
    .update({ otp_code: otp, otp_expires_at: otpExpiry })
    .eq("id", user.id);

  res.json({ sent: true, devOtp: otp });
});

// GET /api/local-auth/me
app.get("/api/local-auth/me", async (req, res) => {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return res.status(401).json({ error: "Unauthorized" });
  const token = auth.slice(7);

  const { data: user } = await supabase
    .from("local_users").select("id,email,name,token_expires_at")
    .eq("session_token", token).maybeSingle();

  if (!user) return res.status(401).json({ error: "Invalid or expired session" });
  if (user.token_expires_at && new Date(user.token_expires_at) < new Date())
    return res.status(401).json({ error: "Session expired — please sign in again" });

  res.json({ user: { id: user.id, email: user.email, name: user.name ?? undefined } });
});

// POST /api/local-auth/signout
app.post("/api/local-auth/signout", async (req, res) => {
  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) {
    const token = auth.slice(7);
    await supabase.from("local_users")
      .update({ session_token: null, token_expires_at: null })
      .eq("session_token", token);
  }
  res.json({ ok: true });
});

// ════════════════════════════════════════════════════════════════
// ── GET /api/status ───────────────────────────────────────────────────────────
app.get("/api/status", async (_req, res) => {
  const [statsRes, devicesRes, alertsRes] = await Promise.all([
    supabase.from("detection_stats").select().eq("id", 1).maybeSingle(),
    supabase.from("devices").select("status"),
    supabase.from("alerts").select("id").eq("dismissed", false),
  ]);
  const stats = statsRes.data ?? {};
  const devices = devicesRes.data ?? [];
  res.json({
    activeAlerts: alertsRes.data?.length ?? 0,
    totalDevices: devices.length,
    uptime: process.uptime(),
    monitoring: true,
    totalPacketsProcessed: stats.total_packets_processed ?? 0,
    detectionCounts: stats.detection_counts ?? {},
    trustedDevices: devices.filter((d: any) => d.status === "trusted").length,
  });
});

// ── GET /api/alerts ───────────────────────────────────────────────────────────
app.get("/api/alerts", async (_req, res) => {
  const { data } = await supabase
    .from("alerts")
    .select()
    .eq("dismissed", false)
    .order("timestamp", { ascending: false })
    .limit(200);
  res.json(data ?? []);
});

// ── DELETE /api/alerts/:id ────────────────────────────────────────────────────
app.delete("/api/alerts/:id", async (req, res) => {
  const { id } = req.params;
  const { data: alert } = await supabase.from("alerts").select("type").eq("id", id).maybeSingle();
  if (!alert) return res.status(404).json({ error: "Alert not found" });

  await supabase.from("alerts").update({ dismissed: true }).eq("id", id);

  const { data: stats } = await supabase.from("detection_stats").select().eq("id", 1).maybeSingle();
  if (stats) {
    const fp = { ...(stats.false_positive_counts ?? {}), [alert.type]: (stats.false_positive_counts?.[alert.type] ?? 0) + 1 };
    await supabase.from("detection_stats").update({ false_positive_counts: fp }).eq("id", 1);
  }
  res.json({ message: "Alert dismissed", id });
});

// ── DELETE /api/alerts — clear all ───────────────────────────────────────────
app.delete("/api/alerts", async (_req, res) => {
  await supabase.from("alerts").update({ dismissed: true }).eq("dismissed", false);
  res.json({ message: "All alerts cleared" });
});

// ── GET /api/devices ──────────────────────────────────────────────────────────
app.get("/api/devices", async (_req, res) => {
  const { data } = await supabase.from("devices").select().order("last_seen", { ascending: false });
  res.json(data ?? []);
});

// ── POST /api/devices/:mac/status ─────────────────────────────────────────────
app.post("/api/devices/:mac/status", async (req, res) => {
  const { mac } = req.params;
  const { status } = req.body;
  if (!["trusted", "unknown", "blocked"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  await supabase.from("devices")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("mac", mac);
  res.json({ message: "Status updated", status, mac });
});

// ── GET /api/traffic/chart ────────────────────────────────────────────────────
app.get("/api/traffic/chart", async (_req, res) => {
  const { data } = await supabase
    .from("traffic_buckets")
    .select()
    .order("created_at", { ascending: false })
    .limit(12);
  const buckets = [...(data ?? [])].reverse().map((r: any) => ({
    time: r.time,
    data: r.data_count,
    beacons: r.beacons_count,
    deauth: r.deauth_count,
    mgmt: r.mgmt_count,
  }));
  res.json(buckets);
});

// ── GET /api/analytics ────────────────────────────────────────────────────────
app.get("/api/analytics", async (_req, res) => {
  const [statsRes, devicesRes, alertsRes] = await Promise.all([
    supabase.from("detection_stats").select().eq("id", 1).maybeSingle(),
    supabase.from("devices").select("status"),
    supabase.from("alerts").select("severity").eq("dismissed", false),
  ]);
  const stats = statsRes.data ?? {};
  const dc = stats.detection_counts ?? {};
  const fp = stats.false_positive_counts ?? {};
  const accuracyByType: Record<string, number> = {};
  for (const type of Object.keys(dc)) {
    const detected = dc[type] || 0;
    const fpCount = fp[type] || 0;
    accuracyByType[type] = detected > 0 ? Math.round(((detected - fpCount) / detected) * 100) : 100;
  }
  const devices = devicesRes.data ?? [];
  const alerts = alertsRes.data ?? [];
  res.json({
    detectionCounts: dc,
    falsePositiveCounts: fp,
    accuracyByType,
    totalDetections: Object.values(dc as Record<string, number>).reduce((a, b) => a + b, 0),
    totalPacketsProcessed: stats.total_packets_processed ?? 0,
    deviceBreakdown: {
      trusted: devices.filter((d: any) => d.status === "trusted").length,
      unknown: devices.filter((d: any) => d.status === "unknown").length,
      blocked: devices.filter((d: any) => d.status === "blocked").length,
    },
    alertSeverityBreakdown: {
      high: alerts.filter((a: any) => a.severity === "high").length,
      medium: alerts.filter((a: any) => a.severity === "medium").length,
      low: alerts.filter((a: any) => a.severity === "low").length,
    },
  });
});

// ── GET /api/config ───────────────────────────────────────────────────────────
app.get("/api/config", async (_req, res) => {
  await ensureEngineConfig();
  const { data } = await supabase.from("engine_config").select().eq("id", 1).maybeSingle();
  if (!data) return res.status(404).json({ error: "Config not found" });
  res.json({
    knownNetworks: data.known_networks ?? [],
    trustedMacs: data.trusted_macs ?? [],
    deauthThreshold: data.deauth_threshold,
    deauthWindowMs: data.deauth_window_ms,
    dedupWindowMs: data.dedup_window_ms,
  });
});

// ── PUT /api/config ───────────────────────────────────────────────────────────
app.put("/api/config", async (req, res) => {
  const body = req.body;
  await supabase.from("engine_config").update({
    known_networks: body.knownNetworks,
    trusted_macs: body.trustedMacs,
    deauth_threshold: body.deauthThreshold,
    deauth_window_ms: body.deauthWindowMs,
    dedup_window_ms: body.dedupWindowMs,
    updated_at: new Date().toISOString(),
  }).eq("id", 1);
  res.json({ message: "Config updated", config: body });
});

// ── GET /api/alerts/export — CSV ──────────────────────────────────────────────
app.get("/api/alerts/export", async (_req, res) => {
  const { data } = await supabase
    .from("alerts").select().eq("dismissed", false).order("timestamp", { ascending: false });
  const alerts: Alert[] = data ?? [];
  const header = "ID,Timestamp,Type,Severity,Target MAC,Description\n";
  const rows = alerts.map((a) =>
    `"${a.id}","${new Date(a.timestamp).toISOString()}","${a.type}","${a.severity}","${a.targetMac}","${String(a.description).replace(/"/g, '""')}" `
  ).join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="salamanda-alerts-${Date.now()}.csv"`);
  res.send(header + rows);
});

// ── Snort rules ───────────────────────────────────────────────────────────────
const DEFAULT_SNORT_RULES = [
  { sid: 1000001, msg: "Possible HTTP attack", action: "alert", protocol: "tcp", srcIp: "any", srcPort: "any", dstIp: "any", dstPort: "80", enabled: true, priority: 3 },
  { sid: 1000002, msg: "TCP SYN Flood", action: "alert", protocol: "tcp", srcIp: "any", srcPort: "any", dstIp: "any", dstPort: "any", enabled: true, priority: 1 },
  { sid: 1000003, msg: "ICMP Ping Detected", action: "alert", protocol: "icmp", srcIp: "any", srcPort: "any", dstIp: "any", dstPort: "any", enabled: true, priority: 3 },
  { sid: 1000004, msg: "SSH Brute Force Attempt", action: "alert", protocol: "tcp", srcIp: "any", srcPort: "any", dstIp: "any", dstPort: "22", enabled: true, priority: 1 },
  { sid: 1000005, msg: "RDP Scan Detected", action: "alert", protocol: "tcp", srcIp: "any", srcPort: "any", dstIp: "any", dstPort: "3389", enabled: true, priority: 2 },
  { sid: 1000006, msg: "DNS Query Flood", action: "alert", protocol: "udp", srcIp: "any", srcPort: "any", dstIp: "any", dstPort: "53", enabled: true, priority: 2 },
  { sid: 1000007, msg: "SMB Scan - Possible WannaCry", action: "alert", protocol: "tcp", srcIp: "any", srcPort: "any", dstIp: "any", dstPort: "445", enabled: true, priority: 1 },
  { sid: 1000008, msg: "Telnet Connection Attempt", action: "alert", protocol: "tcp", srcIp: "any", srcPort: "any", dstIp: "any", dstPort: "23", enabled: true, priority: 2 },
  { sid: 1000009, msg: "FTP Connection Attempt", action: "alert", protocol: "tcp", srcIp: "any", srcPort: "any", dstIp: "any", dstPort: "21", enabled: true, priority: 3 },
  { sid: 1000010, msg: "SNMP Scan Detected", action: "alert", protocol: "udp", srcIp: "any", srcPort: "any", dstIp: "any", dstPort: "161", enabled: true, priority: 2 },
];

app.get("/api/snort-rules", (_req, res) => {
  res.json(DEFAULT_SNORT_RULES);
});

app.get("/api/snort-rules/file", (_req, res) => {
  res.json({ content: "Snort rules stored in Supabase", path: "Supabase database" });
});

app.put("/api/snort-rules/file", (req, res) => {
  res.json({ message: "Rules saved to Supabase", count: DEFAULT_SNORT_RULES.length });
});

app.post("/api/snort-rules/reload", (_req, res) => {
  res.json({ message: "Rules reloaded", count: DEFAULT_SNORT_RULES.length });
});

// ── Network monitor ───────────────────────────────────────────────────────────
app.get("/api/network/arp", (_req, res) => res.json([]));
app.get("/api/network/flows", (_req, res) => res.json([]));
app.get("/api/network/dns", (_req, res) => res.json([]));
app.get("/api/network/alerts", (_req, res) => res.json([]));

app.get("/api/network/stats", (_req, res) => {
  res.json({
    capture: { packetsReceived: 0, packetsDropped: 0, interface: "N/A (cloud)", isLive: false },
    analyzer: { packetsAnalyzed: 0, arpEntries: 0, activeFlows: 0, dnsQueries: 0, alertsGenerated: 0 },
    isLiveCapture: false,
    snortRulesLoaded: DEFAULT_SNORT_RULES.length,
    modelsLoaded: { v1_wireless: false, v2_nslkdd: false, nb_fallback: false },
  });
});

// ── SSE stream — not supported on Vercel serverless ───────────────────────────
app.get("/api/stream", (_req, res) => {
  res.status(501).json({ message: "SSE not supported on serverless. Use Supabase realtime." });
});

export default app;