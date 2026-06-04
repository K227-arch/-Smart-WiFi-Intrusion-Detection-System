import type { ReactNode } from "react";

export interface Alert {
  id: string;
  timestamp: number;
  type: "ROGUE_AP" | "DEAUTH_ATTACK" | "MAC_SPOOFING" | "UNAUTHORIZED_DEVICE" | "CHANNEL_ANOMALY" | "PORT_SCAN" | "BRUTE_FORCE" | "ANOMALY";
  severity: "high" | "medium" | "low";
  description: string;
  targetMac: string;
  targetIp?: string;       // IP address of the attacking/flagged host (preferred display)
  details: any;
  mlScore?: number;
  detectionMethod?: "signature" | "anomaly" | "ml";
}

export interface Device {
  mac: string;
  lastSeen: number;
  status: "trusted" | "unknown" | "blocked";
  firstSeen: number;
  ssid?: string;
  avgSignal: number;
  ipAddress?: string;
  hostname?: string;
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
  // Layer-4 port info (populated when real Ethernet/IP capture is active)
  srcPort?: number;
  dstPort?: number;
  protocol?: "tcp" | "udp" | "icmp";
  srcIp?: string;
  dstIp?: string;
}

export interface SystemStatus {
  activeAlerts: number;
  totalDevices: number;
  uptime: number;
  monitoring: boolean;
  totalPacketsProcessed: number;
  detectionCounts: Record<string, number>;
  trustedDevices: number;
  activeInterface?: string;
  captureMode?: "live" | "simulator";
}

export interface Analytics {
  detectionCounts: Record<string, number>;
  falsePositiveCounts: Record<string, number>;
  accuracyByType: Record<string, number>;
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

export interface KnownNetwork {
  ssid: string;
  bssid: string;
  channel: number;
}

export interface NetworkInterface {
  name: string;
  type: "wifi" | "ethernet" | "loopback" | "virtual" | "unknown";
  ip: string;
  mac: string;
  isActive: boolean;
  isCapturing: boolean;
}

export interface EngineConfig {
  knownNetworks: KnownNetwork[];
  trustedMacs: string[];
  deauthThreshold: number;
  deauthWindowMs: number;
  dedupWindowMs: number;
  portScanThreshold?: number;
  portScanWindowMs?: number;
  bruteForceThreshold?: number;
  bruteForceWindowMs?: number;
  snortRules?: SnortRule[];
  mlEnabled?: boolean;
  anomalyEnabled?: boolean;
}

export interface SnortRule {
  id: string;
  enabled: boolean;
  action: "alert" | "log" | "drop";
  protocol: "tcp" | "udp" | "icmp" | "any";
  srcIp: string;
  srcPort: string;
  dstIp: string;
  dstPort: string;
  msg: string;
  sid: number;
}

export interface MLResult {
  mac: string;
  timestamp: number;
  score: number;           // 0–1 anomaly score
  classification: "normal" | "suspicious" | "malicious";
  features: {
    packetRate: number;
    avgSignal: number;
    uniqueChannels: number;
    deauthRatio: number;
    beaconRatio: number;
  };
}

export interface AnomalyBaseline {
  avgPacketRate: number;
  stdPacketRate: number;
  avgDeauthRatio: number;
  avgBeaconRatio: number;
  sampleCount: number;
  lastUpdated: number;
}

export type AlertTypeMeta = {
  label: string;
  icon: ReactNode;
  color: string;
  bg: string;
  border: string;
};
