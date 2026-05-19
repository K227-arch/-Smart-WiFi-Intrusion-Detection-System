import { useCallback, useEffect, useRef, useState } from "react";
import { insforge } from "../lib/insforge";
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
  const startTime = useRef(Date.now());

  // ── initial data load ──────────────────────────────────────────────────────
  const fetchData = useCallback(async () => {
    const [alertsRes, devicesRes, statsRes, configRes, chartRes] = await Promise.all([
      insforge.database.from("alerts").select().eq("dismissed", false).order("timestamp", { ascending: false }).limit(200),
      insforge.database.from("devices").select().order("last_seen", { ascending: false }),
      insforge.database.from("detection_stats").select().eq("id", 1).maybeSingle(),
      insforge.database.from("engine_config").select().eq("id", 1).maybeSingle(),
      insforge.database.from("traffic_buckets").select().order("created_at", { ascending: false }).limit(12),
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

    // Build analytics from stats + alerts + devices
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

    // Fetch ML results from local API
    fetch("/api/ml-results").then((r) => r.json()).then((data) => {
      if (Array.isArray(data)) setMlResults(data);
    }).catch(() => {});

    // Build status
    setStatus({
      activeAlerts: alertsRes.data?.length ?? 0,
      totalDevices: devicesRes.data?.length ?? 0,
      uptime: (Date.now() - startTime.current) / 1000,
      monitoring: true,
      totalPacketsProcessed: statsRes.data?.total_packets_processed ?? 0,
      detectionCounts: statsRes.data?.detection_counts ?? {},
      trustedDevices: devicesRes.data?.filter((d: any) => d.status === "trusted").length ?? 0,
    });
  }, []);

  // ── realtime subscriptions ─────────────────────────────────────────────────
  useEffect(() => {
    fetchData();

    let connected = false;

    const connectRealtime = async () => {
      try {
        await insforge.realtime.connect();
        connected = true;

        await insforge.realtime.subscribe("wids:alerts");
        await insforge.realtime.subscribe("wids:devices");

        insforge.realtime.on("new_alert", (payload: any) => {
          const alert = rowToAlert({
            id: payload.id,
            timestamp: payload.timestamp,
            type: payload.type,
            severity: payload.severity,
            description: payload.description,
            target_mac: payload.target_mac,
            details: payload.details,
          });
          setAlerts((prev) => {
            if (prev.some((a) => a.id === alert.id)) return prev;
            return [alert, ...prev].slice(0, 200);
          });
          setNewAlertCount((n) => n + 1);
          // Refresh analytics/status counts
          fetchData();
        });

        insforge.realtime.on("device_update", (payload: any) => {
          const device = rowToDevice({
            mac: payload.mac,
            status: payload.status,
            ssid: payload.ssid,
            last_seen: payload.last_seen,
            avg_signal: payload.avg_signal,
            first_seen: payload.last_seen,
          });
          setDevices((prev) => {
            const idx = prev.findIndex((d) => d.mac === device.mac);
            if (idx === -1) return [...prev, device];
            const next = [...prev];
            next[idx] = { ...next[idx], ...device };
            return next;
          });
        });
      } catch (e) {
        console.warn("Realtime connection failed, falling back to polling:", e);
        // Fallback: poll every 30s
        const interval = setInterval(fetchData, 30_000);
        return () => clearInterval(interval);
      }
    };

    connectRealtime();

    return () => {
      if (connected) {
        insforge.realtime.unsubscribe("wids:alerts");
        insforge.realtime.unsubscribe("wids:devices");
        insforge.realtime.disconnect();
      }
    };
  }, [fetchData]);

  // ── engine config ──────────────────────────────────────────────────────────
  const saveConfig = useCallback(async (cfg: EngineConfig) => {
    const { data } = await insforge.database
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
  }, []);

  // ── device status ──────────────────────────────────────────────────────────
  const updateDeviceStatus = useCallback(async (mac: string, newStatus: Device["status"]) => {
    await insforge.database
      .from("devices")
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq("mac", mac);
    setDevices((prev) => prev.map((d) => (d.mac === mac ? { ...d, status: newStatus } : d)));
  }, []);

  // ── alert management ───────────────────────────────────────────────────────
  const dismissAlert = useCallback(async (id: string) => {
    // Mark dismissed and increment false positive count
    const alert = alerts.find((a) => a.id === id);
    await insforge.database.from("alerts").update({ dismissed: true }).eq("id", id);
    if (alert) {
      // Increment false positive in detection_stats
      const { data: stats } = await insforge.database
        .from("detection_stats").select().eq("id", 1).maybeSingle();
      if (stats) {
        const fp = { ...(stats.false_positive_counts ?? {}) };
        fp[alert.type] = (fp[alert.type] ?? 0) + 1;
        await insforge.database.from("detection_stats").update({ false_positive_counts: fp }).eq("id", 1);
      }
    }
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, [alerts]);

  const clearAllAlerts = useCallback(async () => {
    await insforge.database.from("alerts").update({ dismissed: true }).eq("dismissed", false);
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
    clearAlertBadge,
    updateDeviceStatus,
    dismissAlert,
    clearAllAlerts,
    saveConfig,
    refetch: fetchData,
  };
}
