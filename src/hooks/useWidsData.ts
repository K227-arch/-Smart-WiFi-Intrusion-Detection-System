import { useCallback, useEffect, useRef, useState } from "react";
import type { Alert, Analytics, Device, EngineConfig, SystemStatus, TrafficBucket } from "../types";

export function useWidsData() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [chartData, setChartData] = useState<TrafficBucket[]>([]);
  const [engineConfig, setEngineConfig] = useState<EngineConfig | null>(null);
  const [newAlertCount, setNewAlertCount] = useState(0);

  // ── Polling: devices, status, analytics, chart (not alerts — SSE handles those) ──
  const fetchData = useCallback(async () => {
    try {
      const [devicesRes, statusRes, analyticsRes, chartRes] = await Promise.all([
        fetch("/api/devices"),
        fetch("/api/status"),
        fetch("/api/analytics"),
        fetch("/api/traffic/chart"),
      ]);
      setDevices(await devicesRes.json());
      setStatus(await statusRes.json());
      setAnalytics(await analyticsRes.json());
      setChartData(await chartRes.json());
    } catch (e) {
      console.error("WIDS fetch error:", e);
    }
  }, []);

  // ── Initial full alert load ──
  const fetchAlerts = useCallback(async () => {
    try {
      const res = await fetch("/api/alerts");
      const data: Alert[] = await res.json();
      setAlerts(data);
    } catch (e) {
      console.error("WIDS alerts fetch error:", e);
    }
  }, []);

  // ── SSE: only listen for alert events — packets go to LiveTrafficTab directly ──
  useEffect(() => {
    const es = new EventSource("/api/stream");

    // Use named event listener — browser filters at protocol level,
    // packet events never reach this handler at all
    const handleAlert = (event: MessageEvent) => {
      try {
        const incoming: Alert = JSON.parse(event.data);
        setAlerts((prev) => {
          if (prev.some((a) => a.id === incoming.id)) return prev;
          return [incoming, ...prev].slice(0, 200);
        });
        setNewAlertCount((n) => n + 1);
      } catch {
        // malformed — ignore
      }
    };

    es.addEventListener("alert", handleAlert);
    es.onerror = () => es.close();
    return () => {
      es.removeEventListener("alert", handleAlert);
      es.close();
    };
  }, []);

  useEffect(() => {
    fetchAlerts();
    fetchData();
    // Poll every 30 minutes — SSE handles real-time alerts,
    // this just syncs devices, status, analytics, and chart data.
    const THIRTY_MINUTES = 30 * 60 * 1000;
    const interval = setInterval(fetchData, THIRTY_MINUTES);
    return () => clearInterval(interval);
  }, [fetchAlerts, fetchData]);

  // ── Engine config ──
  const fetchConfig = useCallback(async () => {
    try {
      const res = await fetch("/api/config");
      setEngineConfig(await res.json());
    } catch (e) {
      console.error("Config fetch error:", e);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  const saveConfig = useCallback(async (cfg: EngineConfig) => {
    try {
      const res = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      const { config } = await res.json();
      setEngineConfig(config);
    } catch (e) {
      console.error("Config save error:", e);
    }
  }, []);

  // ── Device status ──
  const updateDeviceStatus = useCallback(async (mac: string, newStatus: Device["status"]) => {
    try {
      await fetch(`/api/devices/${encodeURIComponent(mac)}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      setDevices((prev) => prev.map((d) => (d.mac === mac ? { ...d, status: newStatus } : d)));
    } catch (e) {
      console.error("Update device status error:", e);
    }
  }, []);

  // ── Alert management ──
  const dismissAlert = useCallback(async (id: string) => {
    try {
      await fetch(`/api/alerts/${id}`, { method: "DELETE" });
      setAlerts((prev) => prev.filter((a) => a.id !== id));
    } catch (e) {
      console.error("Dismiss alert error:", e);
    }
  }, []);

  const clearAllAlerts = useCallback(async () => {
    try {
      await fetch("/api/alerts", { method: "DELETE" });
      setAlerts([]);
      setNewAlertCount(0);
    } catch (e) {
      console.error("Clear alerts error:", e);
    }
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
    clearAlertBadge,
    updateDeviceStatus,
    dismissAlert,
    clearAllAlerts,
    saveConfig,
    refetch: fetchData,
  };
}
