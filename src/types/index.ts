import type { ReactNode } from "react";

export interface Alert {
  id: string;
  timestamp: number;
  type: "ROGUE_AP" | "DEAUTH_ATTACK" | "MAC_SPOOFING" | "UNAUTHORIZED_DEVICE";
  severity: "high" | "medium" | "low";
  description: string;
  targetMac: string;
  details: any;
}

export interface Device {
  mac: string;
  lastSeen: number;
  status: "trusted" | "unknown" | "blocked";
  firstSeen: number;
  ssid?: string;
  avgSignal: number;
}

export interface WiFiPacket {
  timestamp: number;
  ssid?: string;
  bssid: string;
  sourceMac: string;
  destMac?: string;
  type: "data" | "mgmt" | "beacons" | "deauth";
  signalStrength: number;
  channel: number;
}

export interface SystemStatus {
  activeAlerts: number;
  totalDevices: number;
  uptime: number;
  monitoring: boolean;
  totalPacketsProcessed: number;
  detectionCounts: Record<string, number>;
  trustedDevices: number;
}

export interface Analytics {
  detectionCounts: Record<string, number>;
  totalDetections: number;
  totalPacketsProcessed: number;
  deviceBreakdown: { trusted: number; unknown: number; blocked: number };
  alertSeverityBreakdown: { high: number; medium: number; low: number };
}

export interface TrafficBucket {
  time: string;
  data: number;
  beacons: number;
  deauth: number;
  mgmt: number;
}

export type AlertTypeMeta = {
  label: string;
  icon: ReactNode;
  color: string;
  bg: string;
  border: string;
};
