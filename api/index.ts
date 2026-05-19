import express from "express";
import { createClient } from "@insforge/sdk";

// ── Insforge client ───────────────────────────────────────────────────────────
const db = createClient({
  baseUrl: "https://bh9n4s8r.us-east.insforge.app",
  anonKey:
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3OC0xMjM0LTU2NzgtOTBhYi1jZGVmMTIzNDU2NzgiLCJlbWFpbCI6ImFub25AaW5zZm9yZ2UuY29tIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxODcwMTF9.2i2nCebcymH-w2vXTtlHHCtFwR3ndX_gEKHdYYzTfIo",
});

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

// GET /api/status — read from Insforge
app.get("/api/status", async (_req, res) => {
  const [statsRes, devicesRes, alertsRes] = await Promise.all([
    db.database.from("detection_stats").select().eq("id", 1).maybeSingle(),
    db.database.from("devices").select("status"),
    db.database.from("alerts").select("id").eq("dismissed", false),
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

// GET /api/alerts
app.get("/api/alerts", async (_req, res) => {
  const { data } = await db.database
    .from("alerts")
    .select()
    .eq("dismissed", false)
    .order("timestamp", { ascending: false })
    .limit(200);
  res.json(data ?? []);
});

// DELETE /api/alerts/:id
app.delete("/api/alerts/:id", async (req, res) => {
  const { id } = req.params;
  const { data: alert } = await db.database.from("alerts").select("type").eq("id", id).maybeSingle();
  if (!alert) return res.status(404).json({ error: "Alert not found" });

  await db.database.from("alerts").update({ dismissed: true }).eq("id", id);

  // Increment false positive count
  const { data: stats } = await db.database.from("detection_stats").select().eq("id", 1).maybeSingle();
  if (stats) {
    const fp = { ...(stats.false_positive_counts ?? {}), [alert.type]: (stats.false_positive_counts?.[alert.type] ?? 0) + 1 };
    await db.database.from("detection_stats").update({ false_positive_counts: fp }).eq("id", 1);
  }
  res.json({ message: "Alert dismissed", id });
});

// DELETE /api/alerts — clear all
app.delete("/api/alerts", async (_req, res) => {
  await db.database.from("alerts").update({ dismissed: true }).eq("dismissed", false);
  res.json({ message: "All alerts cleared" });
});

// GET /api/devices
app.get("/api/devices", async (_req, res) => {
  const { data } = await db.database.from("devices").select().order("last_seen", { ascending: false });
  res.json(data ?? []);
});

// POST /api/devices/:mac/status
app.post("/api/devices/:mac/status", async (req, res) => {
  const { mac } = req.params;
  const { status } = req.body;
  if (!["trusted", "unknown", "blocked"].includes(status)) {
    return res.status(400).json({ error: "Invalid status" });
  }
  await db.database.from("devices")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("mac", mac);
  res.json({ message: "Status updated", status, mac });
});

// GET /api/traffic/chart
app.get("/api/traffic/chart", async (_req, res) => {
  const { data } = await db.database
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

// GET /api/analytics
app.get("/api/analytics", async (_req, res) => {
  const [statsRes, devicesRes, alertsRes] = await Promise.all([
    db.database.from("detection_stats").select().eq("id", 1).maybeSingle(),
    db.database.from("devices").select("status"),
    db.database.from("alerts").select("severity").eq("dismissed", false),
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

// GET /api/config
app.get("/api/config", async (_req, res) => {
  const { data } = await db.database.from("engine_config").select().eq("id", 1).maybeSingle();
  if (!data) return res.status(404).json({ error: "Config not found" });
  res.json({
    knownNetworks: data.known_networks ?? [],
    trustedMacs: data.trusted_macs ?? [],
    deauthThreshold: data.deauth_threshold,
    deauthWindowMs: data.deauth_window_ms,
    dedupWindowMs: data.dedup_window_ms,
  });
});

// PUT /api/config
app.put("/api/config", async (req, res) => {
  const body = req.body;
  await db.database.from("engine_config").update({
    known_networks: body.knownNetworks,
    trusted_macs: body.trustedMacs,
    deauth_threshold: body.deauthThreshold,
    deauth_window_ms: body.deauthWindowMs,
    dedup_window_ms: body.dedupWindowMs,
    updated_at: new Date().toISOString(),
  }).eq("id", 1);
  res.json({ message: "Config updated", config: body });
});

// GET /api/alerts/export — CSV
app.get("/api/alerts/export", async (_req, res) => {
  const { data } = await db.database
    .from("alerts").select().eq("dismissed", false).order("timestamp", { ascending: false });
  const alerts: Alert[] = data ?? [];
  const header = "ID,Timestamp,Type,Severity,Target MAC,Description\n";
  const rows = alerts.map((a) =>
    `"${a.id}","${new Date(a.timestamp).toISOString()}","${a.type}","${a.severity}","${a.targetMac ?? a.target_mac}","${String(a.description).replace(/"/g, '""')}"`
  ).join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", `attachment; filename="salamanda-alerts-${Date.now()}.csv"`);
  res.send(header + rows);
});

// SSE stream — not supported on Vercel serverless, return 501
app.get("/api/stream", (_req, res) => {
  res.status(501).json({ message: "SSE not supported on serverless. Use Insforge realtime." });
});

export default app;
