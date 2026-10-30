import { useCallback, useEffect, useRef, useState } from "react";
import { supabaseClient } from "../lib/supabase";
import type { Alert, Analytics, Device, EngineConfig, MLResult, SystemStatus, TrafficBucket } from "../types";

// ── helpers ──────────────────────────────────────────────────────────────────
function rowToAlert(r: any): Alert {
  return {
    id: r.id,
    timestamp: r.timestamp,
    type: r.type,
    severity: r.severity,
    description: r.description,
    targetMac: r.target_mac,
    details: r.details ?? {},
    mlScore: r.ml_score ?? undefined,
    detectionMethod: r.detection_method ?? undefined,
  };
}

function rowToDevice(r: any): Device {
  return {
    mac: r.mac,
    firstSeen: r.first_seen,
    lastSeen: r.last_seen,
    status: r.status,
    ssid: r.ssid ?? undefined,
    avgSignal: Number(r.avg_signal ?? 0),
    ipAddress: r.ip_address ?? undefined,
    hostname: r.hostname ?? undefined,
  };
}

// ── hook ─────────────────────────────────────────────────────────────────────
export function useWidsData() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [chartData, setChartData] = useState<TrafficBucket[]>([]);
  const [engineConfig, setEngineConfig] = useState<EngineConfig | null>(null);
  const [newAlertCount, setNewAlertCount] = useState(0);
  const [mlResults, setMlResults] = useState<MLResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const initialLoadDone = useRef(false);

  // ── fetch live status from the Express server (real capture state) ─────────
  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/status");
      if (!res.ok) return;
      const s = await res.json();
      setStatus({
        activeAlerts: s.activeAlerts ?? 0,
        totalDevices: s.totalDevices ?? 0,
        uptime: s.uptime ?? 0,
        monitoring: s.monitoring ?? false,
        totalPacketsProcessed: s.totalPacketsProcessed ?? 0,
        detectionCounts: s.detectionCounts ?? {},
        trustedDevices: s.trustedDevices ?? 0,
        activeInterface: s.activeInterface ?? undefined,
        captureMode: s.captureMode ?? undefined,
      });
    } catch { /* server may not be reachable in cloud mode */ }
  }, []);

  // ── initial data load from Supabase DB ─────────────────────────────────────
  const fetchData = useCallback(async () => {
    if (!initialLoadDone.current) setIsLoading(true);
    try {
      const [alertsRes, devicesRes, statsRes, configRes, chartRes] = await Promise.all([
        supabaseClient.from("alerts").select().eq("dismissed", false).order("timestamp", { ascending: false }).limit(200),
        supabaseClient.from("devices").select().order("last_seen", { ascending: false }),
        supabaseClient.from("detection_stats").select().eq("id", 1).maybeSingle(),
        supabaseClient.from("engine_config").select().eq("id", 1).maybeSingle(),
        supabaseClient.from("traffic_buckets").select().order("created_at", { ascending: false }).limit(12),
      ]);

      if (alertsRes.data) setAlerts(alertsRes.data.map(rowToAlert));
      if (devicesRes.data) setDevices(devicesRes.data.map(rowToDevice));

      if (configRes.data) {
        setEngineConfig({
          knownNetworks: configRes.data.known_networks ?? [],
          trustedMacs: configRes.data.trusted_macs ?? [],
          deauthThreshold: configRes.data.deauth_threshold,
          deauthWindowMs: configRes.data.deauth_window_ms,
          dedupWindowMs: configRes.data.dedup_window_ms,
        });
      }

      if (chartRes.data) {
        setChartData(
          [...chartRes.data].reverse().map((r: any) => ({
            time: r.time,
            data: r.data_count,
            beacons: r.beacons_count,
            deauth: r.deauth_count,
            mgmt: r.mgmt_count,
          }))
        );
      }

      if (statsRes.data) {
        const stats = statsRes.data;
        const allAlerts = alertsRes.data ?? [];
        const allDevices = devicesRes.data ?? [];
        const dc = stats.detection_counts ?? {};
        const fp = stats.false_positive_counts ?? {};
        const accuracyByType: Record<string, number> = {};
        for (const type of Object.keys(dc)) {
          const detected = dc[type] || 0;
          const fpCount = fp[type] || 0;
          accuracyByType[type] = detected > 0 ? Math.round(((detected - fpCount) / detected) * 100) : 100;
        }
        setAnalytics({
          detectionCounts: dc,
          falsePositiveCounts: fp,
          accuracyByType,
          totalDetections: Object.values(dc as Record<string, number>).reduce((a, b) => a + b, 0),
          totalPacketsProcessed: stats.total_packets_processed ?? 0,
          deviceBreakdown: {
            trusted: allDevices.filter((d: any) => d.status === "trusted").length,
            unknown: allDevices.filter((d: any) => d.status === "unknown").length,
            blocked: allDevices.filter((d: any) => d.status === "blocked").length,
          },
          alertSeverityBreakdown: {
            high: allAlerts.filter((a: any) => a.severity === "high").length,
            medium: allAlerts.filter((a: any) => a.severity === "medium").length,
            low: allAlerts.filter((a: any) => a.severity === "low").length,
          },
        });
      }

      // Fetch ML results from local Express API
      fetch("/api/ml-results")
        .then((r) => r.json())
        .then((data) => { if (Array.isArray(data)) setMlResults(data); })
        .catch(() => {});

      fetchStatus();

      // Local API fallback
      if (!alertsRes.data?.length) {
        fetch("/api/alerts")
          .then((r) => r.json())
          .then((data: any[]) => {
            if (Array.isArray(data) && data.length > 0) {
              setAlerts(data.map((a) => ({
                id: a.id,
                timestamp: a.timestamp,
                type: a.type,
                severity: a.severity,
                description: a.description,
                targetMac: a.targetMac ?? a.target_mac,
                details: a.details ?? {},
                mlScore: a.mlScore,
                detectionMethod: a.detectionMethod,
              })));
            }
          })
          .catch(() => {});
      }
      if (!devicesRes.data?.length) {
        fetch("/api/devices")
          .then((r) => r.json())
          .then((data: any[]) => {
            if (Array.isArray(data) && data.length > 0) {
              setDevices(data.map((d) => ({
                mac: d.mac,
                firstSeen: d.first_seen ?? d.firstSeen ?? Date.now(),
                lastSeen: d.last_seen ?? d.lastSeen ?? Date.now(),
                status: d.status,
                ssid: d.ssid ?? undefined,
                avgSignal: Number(d.avg_signal ?? d.avgSignal ?? 0),
                ipAddress: d.ip_address ?? d.ipAddress ?? undefined,
                hostname: d.hostname ?? undefined,
              })));
            }
          })
          .catch(() => {});
      }
    } finally {
      setIsLoading(false);
      initialLoadDone.current = true;
    }
  }, [fetchStatus]);

  // ── realtime subscriptions + status polling ────────────────────────────────
  useEffect(() => {
    fetchData();
    const statusInterval = setInterval(fetchStatus, 30_000);

    const connectRealtime = async () => {
      try {
        // Supabase realtime connection
        const channel = supabaseClient.channel("wids_changes");
        
        channel
          .on("postgres_changes", { event: "INSERT", schema: "public", table: "alerts" }, (payload: any) => {
            const alert = rowToAlert(payload.new);
            setAlerts((prev) => {
              if (prev.some((a) => a.id === alert.id)) return prev;
              return [alert, ...prev].slice(0, 200);
            });
            setNewAlertCount((n) => n + 1);
            setAnalytics((prev) => {
              if (!prev) return prev;
              const dc = { ...prev.detectionCounts };
              dc[alert.type] = (dc[alert.type] ?? 0) + 1;
              const sev = { ...prev.alertSeverityBreakdown };
              if (alert.severity === "high") sev.high++;
              else if (alert.severity === "medium") sev.medium++;
              else sev.low++;
              return { ...prev, detectionCounts: dc, totalDetections: prev.totalDetections + 1, alertSeverityBreakdown: sev };
            });
            fetchStatus();
          })
          .on("postgres_changes", { event: "UPDATE", schema: "public", table: "devices" }, (payload: any) => {
            const device = rowToDevice(payload.new);
            setDevices((prev) => {
              const idx = prev.findIndex((d) => d.mac === device.mac);
              if (idx === -1) return [...prev, device];
              const next = [...prev];
              next[idx] = { ...next[idx], ...device };
              return next;
            });
          })
          .subscribe();
      } catch (e) {
        console.warn("Realtime connection failed, falling back to polling:", e);
      }
    };

    connectRealtime();

    return () => {
      clearInterval(statusInterval);
      supabaseClient.removeAllChannels();
    };
  }, [fetchData, fetchStatus]);

  // ── engine config ──────────────────────────────────────────────────────────
  const saveConfig = useCallback(async (cfg: EngineConfig) => {
    const { data } = await supabaseClient
      .from("engine_config")
      .update({
        known_networks: cfg.knownNetworks,
        trusted_macs: cfg.trustedMacs,
        deauth_threshold: cfg.deauthThreshold,
        deauth_window_ms: cfg.deauthWindowMs,
        dedup_window_ms: cfg.dedupWindowMs,
        updated_at: new Date().toISOString(),
      })
      .eq("id", 1)
      .select()
      .maybeSingle();
    if (data) setEngineConfig(cfg);

    fetch("/api/config", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        knownNetworks: cfg.knownNetworks,
        trustedMacs: cfg.trustedMacs,
        deauthThreshold: cfg.deauthThreshold,
        deauthWindowMs: cfg.deauthWindowMs,
        dedupWindowMs: cfg.dedupWindowMs,
      }),
    }).catch(() => {});
  }, []);

  // ── device status ──────────────────────────────────────────────────────────
  const updateDeviceStatus = useCallback(async (mac: string, newStatus: Device["status"]) => {
    await supabaseClient
      .from("devices")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("mac", mac);
    fetch(`/api/devices/${encodeURIComponent(mac)}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    }).catch(() => {});
    setDevices((prev) => prev.map((d) => (d.mac === mac ? { ...d, status: newStatus } : d)));
  }, []);

  // ── alert management ───────────────────────────────────────────────────────
  const dismissAlert = useCallback(async (id: string) => {
    const alert = alerts.find((a) => a.id === id);
    await supabaseClient.from("alerts").update({ dismissed: true }).eq("id", id);
    if (alert) {
      const { data: stats } = await supabaseClient
        .from("detection_stats").select().eq("id", 1).maybeSingle();
      if (stats) {
        const fp = { ...(stats.false_positive_counts ?? {}) };
        fp[alert.type] = (fp[alert.type] ?? 0) + 1;
        await supabaseClient.from("detection_stats").update({ false_positive_counts: fp }).eq("id", 1);
      }
    }
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, [alerts]);

  const clearAllAlerts = useCallback(async () => {
    await supabaseClient.from("alerts").update({ dismissed: true }).eq("dismissed", false);
    setAlerts([]);
    setNewAlertCount(0);
  }, []);

  const clearAlertBadge = useCallback(() => setNewAlertCount(0), []);

  return {
    alerts,
    devices,
    status,
    analytics,
    chartData,
    engineConfig,
    newAlertCount,
    mlResults,
    isLoading,
    clearAlertBadge,
    updateDeviceStatus,
    dismissAlert,
    clearAllAlerts,
    saveConfig,
    refetch: fetchData,
  };
}