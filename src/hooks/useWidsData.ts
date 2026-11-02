import { useCallback, useEffect, useRef, useState } from "react";
import type { Alert, Analytics, Device, EngineConfig, MLResult, SystemStatus, TrafficBucket } from "../types";

// ── helpers ──────────────────────────────────────────────────────────────────
function rowToAlert(r: any): Alert {
  return {
    id: r.id,
    timestamp: r.timestamp ?? r.timestamp,
    type: r.type,
    severity: r.severity,
    description: r.description,
    targetMac: r.targetMac ?? r.target_mac,
    targetIp: r.targetIp ?? r.target_ip ?? undefined,
    details: r.details ?? {},
    mlScore: r.mlScore ?? r.ml_score ?? undefined,
    detectionMethod: r.detectionMethod ?? r.detection_method ?? undefined,
  };
}

function rowToDevice(r: any): Device {
  return {
    mac: r.mac,
    firstSeen: r.firstSeen ?? r.first_seen ?? Date.now(),
    lastSeen: r.lastSeen ?? r.last_seen ?? Date.now(),
    status: r.status,
    ssid: r.ssid ?? undefined,
    avgSignal: Number(r.avgSignal ?? r.avg_signal ?? 0),
    ipAddress: r.ipAddress ?? r.ip_address ?? undefined,
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
  const sseRef = useRef<EventSource | null>(null);

  // ── fetch from local Express API (always available) ───────────────────────
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
    } catch { /* ignore */ }
  }, []);

  const fetchData = useCallback(async () => {
    if (!initialLoadDone.current) setIsLoading(true);
    try {
      // Use local Express API as primary source — always works even if Supabase is down
      const [alertsRes, devicesRes, configRes, mlRes] = await Promise.all([
        fetch("/api/alerts").then((r) => r.json()).catch(() => []),
        fetch("/api/devices").then((r) => r.json()).catch(() => []),
        fetch("/api/config").then((r) => r.json()).catch(() => null),
        fetch("/api/ml-results").then((r) => r.json()).catch(() => []),
      ]);

      if (Array.isArray(alertsRes)) setAlerts(alertsRes.map(rowToAlert));
      if (Array.isArray(devicesRes)) setDevices(devicesRes.map(rowToDevice));
      if (Array.isArray(mlRes)) setMlResults(mlRes);

      if (configRes && !configRes.error) {
        setEngineConfig({
          knownNetworks: configRes.knownNetworks ?? [],
          trustedMacs: configRes.trustedMacs ?? [],
          deauthThreshold: configRes.deauthThreshold ?? 5,
          deauthWindowMs: configRes.deauthWindowMs ?? 3000,
          dedupWindowMs: configRes.dedupWindowMs ?? 10000,
        });
      }

      // Build analytics from local data
      if (Array.isArray(alertsRes) && Array.isArray(devicesRes)) {
        const dc: Record<string, number> = {};
        for (const a of alertsRes) dc[a.type] = (dc[a.type] ?? 0) + 1;
        setAnalytics({
          detectionCounts: dc,
          falsePositiveCounts: {},
          accuracyByType: {},
          totalDetections: alertsRes.length,
          totalPacketsProcessed: 0,
          deviceBreakdown: {
            trusted: devicesRes.filter((d: any) => d.status === "trusted").length,
            unknown: devicesRes.filter((d: any) => d.status === "unknown").length,
            blocked: devicesRes.filter((d: any) => d.status === "blocked").length,
          },
          alertSeverityBreakdown: {
            high: alertsRes.filter((a: any) => a.severity === "high").length,
            medium: alertsRes.filter((a: any) => a.severity === "medium").length,
            low: alertsRes.filter((a: any) => a.severity === "low").length,
          },
        });
      }

      await fetchStatus();
    } finally {
      setIsLoading(false);
      initialLoadDone.current = true;
    }
  }, [fetchStatus]);

  // ── SSE realtime from local Express (replaces Supabase realtime) ──────────
  useEffect(() => {
    fetchData();
    const statusInterval = setInterval(fetchStatus, 30_000);

    // Connect to the SSE stream from our Express server
    const connectSSE = () => {
      try {
        const sse = new EventSource("/api/stream");
        sseRef.current = sse;

        sse.addEventListener("alert", (e) => {
          try {
            const alert = rowToAlert(JSON.parse(e.data));
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
          } catch { /* ignore parse errors */ }
        });

        sse.addEventListener("device", (e) => {
          try {
            const device = rowToDevice(JSON.parse(e.data));
            setDevices((prev) => {
              const idx = prev.findIndex((d) => d.mac === device.mac);
              if (idx === -1) return [...prev, device];
              const next = [...prev];
              next[idx] = { ...next[idx], ...device };
              return next;
            });
          } catch { /* ignore */ }
        });

        sse.onerror = () => {
          sse.close();
          // Reconnect after 5s
          setTimeout(connectSSE, 5000);
        };
      } catch { /* SSE not available */ }
    };

    connectSSE();

    return () => {
      clearInterval(statusInterval);
      sseRef.current?.close();
    };
  }, [fetchData, fetchStatus]);

  // ── engine config ──────────────────────────────────────────────────────────
  const saveConfig = useCallback(async (cfg: EngineConfig) => {
    await fetch("/api/config", {
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
    setEngineConfig(cfg);
  }, []);

  // ── device status ──────────────────────────────────────────────────────────
  const updateDeviceStatus = useCallback(async (mac: string, newStatus: Device["status"]) => {
    await fetch(`/api/devices/${encodeURIComponent(mac)}/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: newStatus }),
    }).catch(() => {});
    setDevices((prev) => prev.map((d) => (d.mac === mac ? { ...d, status: newStatus } : d)));
  }, []);

  // ── alert management ───────────────────────────────────────────────────────
  const dismissAlert = useCallback(async (id: string) => {
    await fetch(`/api/alerts/${id}/dismiss`, {
      method: "POST",
    }).catch(() => {});
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clearAllAlerts = useCallback(async () => {
    await fetch("/api/alerts/clear", { method: "POST" }).catch(() => {});
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
