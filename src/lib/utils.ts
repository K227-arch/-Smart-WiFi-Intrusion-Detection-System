import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

export function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export const mockChartData = [
  { time: "10:00", data: 400, beacons: 240, deauth: 0, mgmt: 10 },
  { time: "10:05", data: 300, beacons: 139, deauth: 1, mgmt: 8 },
  { time: "10:10", data: 200, beacons: 980, deauth: 0, mgmt: 15 },
  { time: "10:15", data: 278, beacons: 390, deauth: 2, mgmt: 6 },
  { time: "10:20", data: 189, beacons: 480, deauth: 0, mgmt: 12 },
  { time: "10:25", data: 239, beacons: 380, deauth: 0, mgmt: 9 },
  { time: "10:30", data: 349, beacons: 430, deauth: 1, mgmt: 11 },
  { time: "10:35", data: 550, beacons: 400, deauth: 0, mgmt: 7 },
  { time: "10:40", data: 400, beacons: 700, deauth: 3, mgmt: 14 },
  { time: "10:45", data: 700, beacons: 300, deauth: 0, mgmt: 5 },
];
