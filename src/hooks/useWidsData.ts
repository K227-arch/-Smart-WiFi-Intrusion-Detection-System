import { useCallback, useEffect, useRef, useState } from "react";
import type { Alert, Analytics, Device, SystemStatus, TrafficBucket } from "../types";

export function useWidsData() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [chartData, setChartData] = useState<TrafficBucket[]>([]);
  const [newAlertCount, setNewAlertCount] = useState(0);
  const prevAlertCount = useRef(0);

  const fetchData = useCallback(async () => {
    try {
      const [alertsRes, devicesRes, statusRes, analyticsRes, chartRes] = await Promise.all([
        fetch("/api/alerts"),
        fetch("/api/devices"),
        fetch("/api/status"),
        fetch("/api/analytics"),
        fetch("/api/traffic/chart"),
      ]);

      const newAlerts: Alert[] = await alertsRes.json();
      setAlerts(newAlerts);
      setDevices(await devicesRes.json());
      setStatus(await statusRes.json());
      setAnalytics(await analyticsRes.json());
      setChartData(await chartRes.json());

      if (newAlerts.length > prevAlertCount.current) {
        setNewAlertCount((n) => n + (newAlerts.length - prevAlertCount.current));
      }
      prevAlertCount.current = newAlerts.length;
    } catch (e) {
      console.error("WIDS fetch error:", e);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const updateDeviceStatus = useCallback(
    async (mac: string, newStatus: Device["status"]) => {
      try {
        await fetch(`/api/devices/${encodeURIComponent(mac)}/status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: newStatus }),
        });
        setDevices((prev) =>
          prev.map((d) => (d.mac === mac ? { ...d, status: newStatus } : d))
        );
      } catch (e) {
        console.error("Update device status error:", e);
      }
    },
    []
  );

  const clearAlertBadge = useCallback(() => setNewAlertCount(0), []);

  return {
    alerts,
    devices,
    status,
    analytics,
    chartData,
    newAlertCount,
    clearAlertBadge,
    updateDeviceStatus,
    refetch: fetchData,
  };
}
