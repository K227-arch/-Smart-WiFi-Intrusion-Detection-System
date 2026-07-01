/**
 * SALAMANDA WIDS — Network Analyzer
 * Processes captured packets and runs:
 *   - ARP spoofing detection
 *   - IP/MAC binding table
 *   - DNS monitoring (tunneling, exfiltration, suspicious queries)
 *   - TCP/UDP flow tracking (SYN flood, port scan, connection state)
 *   - Protocol anomaly detection
 */

import { EventEmitter } from "events";
import type { CapturedPacket } from "./packetCapture";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface ArpEntry {
  ip: string;
  mac: string;
  firstSeen: number;
  lastSeen: number;
  conflictCount: number;
}

export interface TcpFlow {
  key: string;           // srcIp:srcPort->dstIp:dstPort
  srcIp: string;
  dstIp: string;
  srcPort: number;
  dstPort: number;
  protocol: "tcp" | "udp";
  startTime: number;
  lastSeen: number;
  packetCount: number;
  byteCount: number;
  synCount: number;
  rstCount: number;
  finCount: number;
  state: "syn" | "established" | "closed" | "reset";
}

export interface DnsRecord {
  query: string;
  type: string;
  srcIp: string;
  timestamp: number;
  suspicious: boolean;
  reason?: string;
}

export interface NetworkAlert {
  type: "ARP_SPOOFING" | "SYN_FLOOD" | "PORT_SCAN_TCP" | "DNS_TUNNELING" | "DNS_EXFILTRATION"
      | "ICMP_FLOOD" | "TCP_ANOMALY" | "ARP_SCAN" | "PROTOCOL_ANOMALY";
  severity: "high" | "medium" | "low";
  srcIp?: string;
  srcMac?: string;
  dstIp?: string;
  description: string;
  details: Record<string, any>;
  timestamp: number;
  detectionMethod: "signature" | "anomaly";
}

// ── Constants ─────────────────────────────────────────────────────────────────
const SYN_FLOOD_THRESHOLD = 50;       // SYNs per window
const SYN_FLOOD_WINDOW_MS = 5000;
const PORT_SCAN_THRESHOLD = 15;       // unique dst ports per window
const PORT_SCAN_WINDOW_MS = 10000;
const DNS_LABEL_MAX = 63;             // RFC 1035
const DNS_QUERY_ENTROPY_THRESHOLD = 3.8; // bits — high entropy = tunneling
const DNS_SUBDOMAIN_MAX = 4;          // more than this = suspicious
const ARP_SCAN_THRESHOLD = 20;        // ARP requests per window
const ARP_SCAN_WINDOW_MS = 5000;
const FLOW_TIMEOUT_MS = 120_000;      // 2 min idle flow cleanup

// ── Trusted IP prefixes — never generate alerts for these ─────────────────────
// Includes the InsForge/AWS backend, CDNs, and local loopback.
// Add your own trusted server IPs here if needed.
const TRUSTED_IP_PREFIXES = [
  "127.",           // loopback
  "169.254.",       // link-local
  "::1",            // IPv6 loopback
  // InsForge backend (AWS us-east-2) — these are the app's own API calls
  "3.132.",
  "3.151.",
  "18.219.",
  "52.54.",
  "98.84.",
  "32.195.",
  "32.192.",
  "54.80.",
  "96.45.",
];

// Own machine IPs — populated at runtime by the server
const ownIps = new Set<string>();

export function addOwnIp(ip: string) { ownIps.add(ip); }

// Returns true if this IP should be excluded from alert generation.
// Own machine IPs and known backend/CDN prefixes are both filtered.
function isFilteredIp(ip?: string): boolean {
  if (!ip) return false;
  if (ownIps.has(ip)) return true;          // own machine — never alert on self
  return TRUSTED_IP_PREFIXES.some((prefix) => ip.startsWith(prefix));
}

// Port scan: skip if the scanner is a trusted backend IP or own machine
function isTrustedScanner(ip?: string): boolean {
  if (!ip) return false;
  if (ownIps.has(ip)) return true;
  return TRUSTED_IP_PREFIXES.some((prefix) => ip.startsWith(prefix));
}

// ── Entropy calculator ────────────────────────────────────────────────────────
function shannonEntropy(s: string): number {
  const freq: Record<string, number> = {};
  for (const c of s) freq[c] = (freq[c] ?? 0) + 1;
  const len = s.length;
  return -Object.values(freq).reduce((sum, f) => {
    const p = f / len;
    return sum + p * Math.log2(p);
  }, 0);
}

// ── Network Analyzer ──────────────────────────────────────────────────────────
export class NetworkAnalyzer extends EventEmitter {
  // ARP table: ip → entry
  private arpTable = new Map<string, ArpEntry>();

  // Flow table: flowKey → flow
  private flowTable = new Map<string, TcpFlow>();

  // SYN flood tracker: srcIp → { count, windowStart }
  private synTracker = new Map<string, { count: number; windowStart: number }>();

  // Port scan tracker: srcIp → { ports: Set, windowStart }
  private portScanTracker = new Map<string, { ports: Set<number>; windowStart: number }>();

  // ARP scan tracker: srcMac → { count, windowStart }
  private arpScanTracker = new Map<string, { count: number; windowStart: number }>();

  // DNS records (last 500)
  private dnsRecords: DnsRecord[] = [];

  // ICMP flood tracker
  private icmpTracker = new Map<string, { count: number; windowStart: number }>();

  // Stats
  public stats = {
    packetsAnalyzed: 0,
    arpEntries: 0,
    activeFlows: 0,
    dnsQueries: 0,
    alertsGenerated: 0,
  };

  processPacket(pkt: CapturedPacket) {
    this.stats.packetsAnalyzed++;

    // DNS: always record regardless of IP filter — we want full network visibility
    if (pkt.dnsQuery) this.analyzeDns(pkt);

    // Skip deeper analysis for filtered IPs (own machine, backend servers, CDNs)
    if (isFilteredIp(pkt.srcIp) || isFilteredIp(pkt.dstIp)) {
      // Still track flows for visibility but don't alert
      if (pkt.etherType === 0x0800 && pkt.protocol === 6) this.trackFlowOnly(pkt);
      return;
    }

    // Periodic flow cleanup
    if (this.stats.packetsAnalyzed % 1000 === 0) this.cleanupFlows();

    // Route to appropriate analyzer
    if (pkt.etherType === 0x0806) this.analyzeArp(pkt);
    if (pkt.etherType === 0x0800) {
      if (pkt.protocol === 6) this.analyzeTcp(pkt);
      if (pkt.protocol === 17) this.analyzeUdp(pkt);
      if (pkt.protocol === 1) this.analyzeIcmp(pkt);
    }
  }

  // ── ARP Analysis ─────────────────────────────────────────────────────────
  private analyzeArp(pkt: CapturedPacket) {
    const { arpSenderIp, arpSenderMac, arpOp, srcMac } = pkt;
    if (!arpSenderIp || !arpSenderMac) return;

    // ARP scan detection
    if (arpOp === 1) { // request
      const now = Date.now();
      const tracker = this.arpScanTracker.get(srcMac);
      if (!tracker || now - tracker.windowStart > ARP_SCAN_WINDOW_MS) {
        this.arpScanTracker.set(srcMac, { count: 1, windowStart: now });
      } else {
        tracker.count++;
        if (tracker.count === ARP_SCAN_THRESHOLD) {
          this.fireAlert({
            type: "ARP_SCAN",
            severity: "medium",
            srcMac,
            description: `ARP scan detected: ${srcMac} sent ${tracker.count} ARP requests in ${ARP_SCAN_WINDOW_MS / 1000}s — possible network reconnaissance.`,
            details: { srcMac, count: tracker.count, windowMs: ARP_SCAN_WINDOW_MS },
            detectionMethod: "signature",
          });
        }
      }
    }

    // ARP spoofing: IP already bound to a different MAC
    const existing = this.arpTable.get(arpSenderIp);
    if (existing && existing.mac !== arpSenderMac) {
      existing.conflictCount++;
      this.fireAlert({
        type: "ARP_SPOOFING",
        severity: "high",
        srcMac: arpSenderMac,
        srcIp: arpSenderIp,
        description: `ARP Spoofing detected: IP ${arpSenderIp} was bound to ${existing.mac}, now claimed by ${arpSenderMac}. Possible MITM attack.`,
        details: {
          ip: arpSenderIp,
          originalMac: existing.mac,
          spoofedMac: arpSenderMac,
          conflictCount: existing.conflictCount,
          arpOp: arpOp === 1 ? "request" : "reply",
        },
        detectionMethod: "signature",
      });
      existing.mac = arpSenderMac;
      existing.lastSeen = Date.now();
    } else if (!existing) {
      this.arpTable.set(arpSenderIp, {
        ip: arpSenderIp,
        mac: arpSenderMac,
        firstSeen: Date.now(),
        lastSeen: Date.now(),
        conflictCount: 0,
      });
      this.stats.arpEntries = this.arpTable.size;
    } else {
      existing.lastSeen = Date.now();
    }
  }

  // ── TCP Analysis ──────────────────────────────────────────────────────────
  private analyzeTcp(pkt: CapturedPacket) {
    if (!pkt.srcIp || !pkt.dstIp || !pkt.srcPort || !pkt.dstPort) return;
    const flags = pkt.tcpFlags ?? 0;
    const isSyn = (flags & 0x02) !== 0 && (flags & 0x10) === 0; // SYN without ACK
    const isRst = (flags & 0x04) !== 0;
    const isFin = (flags & 0x01) !== 0;

    // Flow tracking
    const key = `${pkt.srcIp}:${pkt.srcPort}->${pkt.dstIp}:${pkt.dstPort}`;
    let flow = this.flowTable.get(key);
    if (!flow) {
      flow = {
        key, srcIp: pkt.srcIp, dstIp: pkt.dstIp,
        srcPort: pkt.srcPort, dstPort: pkt.dstPort,
        protocol: "tcp", startTime: Date.now(), lastSeen: Date.now(),
        packetCount: 0, byteCount: 0, synCount: 0, rstCount: 0, finCount: 0,
        state: "syn",
      };
      this.flowTable.set(key, flow);
      this.stats.activeFlows = this.flowTable.size;
    }
    flow.packetCount++;
    flow.byteCount += pkt.length;
    flow.lastSeen = Date.now();
    if (isSyn) flow.synCount++;
    if (isRst) { flow.rstCount++; flow.state = "reset"; }
    if (isFin) { flow.finCount++; flow.state = "closed"; }
    if (!isSyn && !isRst && !isFin) flow.state = "established";

    // SYN flood detection
    if (isSyn) {
      const now = Date.now();
      const tracker = this.synTracker.get(pkt.srcIp);
      if (!tracker || now - tracker.windowStart > SYN_FLOOD_WINDOW_MS) {
        this.synTracker.set(pkt.srcIp, { count: 1, windowStart: now });
      } else {
        tracker.count++;
        if (tracker.count === SYN_FLOOD_THRESHOLD) {
          this.fireAlert({
            type: "SYN_FLOOD",
            severity: "high",
            srcIp: pkt.srcIp,
            dstIp: pkt.dstIp,
            description: `SYN Flood detected: ${pkt.srcIp} sent ${tracker.count} SYN packets in ${SYN_FLOOD_WINDOW_MS / 1000}s targeting ${pkt.dstIp}. DoS attack in progress.`,
            details: { srcIp: pkt.srcIp, dstIp: pkt.dstIp, synCount: tracker.count, windowMs: SYN_FLOOD_WINDOW_MS },
            detectionMethod: "signature",
          });
        }
      }
    }

    // TCP port scan: many unique dst ports from same src
    const now = Date.now();
    const psTracker = this.portScanTracker.get(pkt.srcIp);
    if (!isTrustedScanner(pkt.srcIp)) {
      if (!psTracker || now - psTracker.windowStart > PORT_SCAN_WINDOW_MS) {
        this.portScanTracker.set(pkt.srcIp, { ports: new Set([pkt.dstPort]), windowStart: now });
      } else {
        psTracker.ports.add(pkt.dstPort);
        if (psTracker.ports.size === PORT_SCAN_THRESHOLD) {
          this.fireAlert({
            type: "PORT_SCAN_TCP",
            severity: "medium",
            srcIp: pkt.srcIp,
            dstIp: pkt.dstIp,
            description: `TCP Port Scan: ${pkt.srcIp} probed ${psTracker.ports.size} unique ports on ${pkt.dstIp} in ${PORT_SCAN_WINDOW_MS / 1000}s.`,
            details: { srcIp: pkt.srcIp, dstIp: pkt.dstIp, portCount: psTracker.ports.size, samplePorts: [...psTracker.ports].slice(0, 10) },
            detectionMethod: "signature",
          });
        }
      }
    }

    // Protocol anomaly: RST storm
    if (isRst && flow.rstCount > 10) {
      this.fireAlert({
        type: "TCP_ANOMALY",
        severity: "low",
        srcIp: pkt.srcIp,
        description: `TCP RST storm from ${pkt.srcIp}: ${flow.rstCount} RST packets on flow ${key}.`,
        details: { flow: key, rstCount: flow.rstCount },
        detectionMethod: "anomaly",
      });
    }
  }

  // ── UDP Analysis ──────────────────────────────────────────────────────────
  private analyzeUdp(pkt: CapturedPacket) {
    if (!pkt.srcIp || !pkt.dstIp || !pkt.srcPort || !pkt.dstPort) return;
    const key = `${pkt.srcIp}:${pkt.srcPort}->${pkt.dstIp}:${pkt.dstPort}`;
    let flow = this.flowTable.get(key);
    if (!flow) {
      flow = {
        key, srcIp: pkt.srcIp, dstIp: pkt.dstIp,
        srcPort: pkt.srcPort, dstPort: pkt.dstPort,
        protocol: "udp", startTime: Date.now(), lastSeen: Date.now(),
        packetCount: 0, byteCount: 0, synCount: 0, rstCount: 0, finCount: 0,
        state: "established",
      };
      this.flowTable.set(key, flow);
    }
    flow.packetCount++;
    flow.byteCount += pkt.length;
    flow.lastSeen = Date.now();
  }

  // ── ICMP Analysis ─────────────────────────────────────────────────────────
  private analyzeIcmp(pkt: CapturedPacket) {
    if (!pkt.srcIp) return;
    const now = Date.now();
    const tracker = this.icmpTracker.get(pkt.srcIp);
    if (!tracker || now - tracker.windowStart > 5000) {
      this.icmpTracker.set(pkt.srcIp, { count: 1, windowStart: now });
    } else {
      tracker.count++;
      if (tracker.count === 100) {
        this.fireAlert({
          type: "ICMP_FLOOD",
          severity: "medium",
          srcIp: pkt.srcIp,
          description: `ICMP Flood: ${pkt.srcIp} sent ${tracker.count} ICMP packets in 5s. Possible ping flood or Smurf attack.`,
          details: { srcIp: pkt.srcIp, count: tracker.count },
          detectionMethod: "signature",
        });
      }
    }
  }

  // ── DNS Analysis ──────────────────────────────────────────────────────────
  private analyzeDns(pkt: CapturedPacket) {
    if (!pkt.dnsQuery || pkt.dnsQuery.length < 3) return;
    // Skip empty or link-local sources but ALWAYS record DNS for visibility
    if (!pkt.srcIp || pkt.srcIp.startsWith("169.254.") || pkt.srcIp.startsWith("127.")) return;
    this.stats.dnsQueries++;

    const query = pkt.dnsQuery.toLowerCase().replace(/\.$/, "");
    const labels = query.split(".");
    const subdomain = labels.slice(0, -2).join(".");
    let suspicious = false;
    let reason = "";

    // Only run threat checks on non-own-machine traffic to avoid noise
    const isOwn = isFilteredIp(pkt.srcIp);

    if (!isOwn) {
      // DNS tunneling: high entropy subdomain
      if (subdomain.length > 10) {
        const entropy = shannonEntropy(subdomain);
        if (entropy > DNS_QUERY_ENTROPY_THRESHOLD) {
          suspicious = true;
          reason = `High entropy subdomain (${entropy.toFixed(2)} bits) — possible DNS tunneling`;
          this.fireAlert({
            type: "DNS_TUNNELING",
            severity: "high",
            srcIp: pkt.srcIp,
            description: `DNS Tunneling suspected: ${pkt.srcIp} queried "${query}" with entropy ${entropy.toFixed(2)} bits. Data may be exfiltrated via DNS.`,
            details: { query, entropy: entropy.toFixed(2), srcIp: pkt.srcIp, threshold: DNS_QUERY_ENTROPY_THRESHOLD },
            detectionMethod: "anomaly",
          });
        }
      }

      // DNS exfiltration: excessive subdomain depth
      if (labels.length > DNS_SUBDOMAIN_MAX + 2) {
        suspicious = true;
        reason = `Excessive subdomain depth (${labels.length} labels)`;
        this.fireAlert({
          type: "DNS_EXFILTRATION",
          severity: "medium",
          srcIp: pkt.srcIp,
          description: `DNS Exfiltration suspected: ${pkt.srcIp} queried "${query}" with ${labels.length} subdomain labels — possible data exfiltration.`,
          details: { query, labelCount: labels.length, srcIp: pkt.srcIp },
          detectionMethod: "anomaly",
        });
      }

      // Very long label (> RFC max)
      const maxLabel = Math.max(...labels.map((l) => l.length));
      if (maxLabel > DNS_LABEL_MAX) {
        suspicious = true;
        reason = `Label exceeds RFC 1035 max (${maxLabel} chars)`;
      }
    }

    // Always record — every DNS query is visible in the Sites/DNS views
    const record: DnsRecord = {
      query,
      type: pkt.dnsType ?? "A",
      srcIp: pkt.srcIp ?? "unknown",
      timestamp: Date.now(),
      suspicious,
      reason: reason || undefined,
    };
    this.dnsRecords.unshift(record);
    if (this.dnsRecords.length > 2000) this.dnsRecords.pop();
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private fireAlert(data: Omit<NetworkAlert, "timestamp">) {
    this.stats.alertsGenerated++;
    const alert: NetworkAlert = { ...data, timestamp: Date.now() };
    this.emit("alert", alert);
  }

  // Track flow without alerting — used for trusted IPs
  private trackFlowOnly(pkt: CapturedPacket) {
    if (!pkt.srcIp || !pkt.dstIp || !pkt.srcPort || !pkt.dstPort) return;
    const key = `${pkt.srcIp}:${pkt.srcPort}->${pkt.dstIp}:${pkt.dstPort}`;
    let flow = this.flowTable.get(key);
    if (!flow) {
      flow = {
        key, srcIp: pkt.srcIp, dstIp: pkt.dstIp,
        srcPort: pkt.srcPort, dstPort: pkt.dstPort,
        protocol: "tcp", startTime: Date.now(), lastSeen: Date.now(),
        packetCount: 0, byteCount: 0, synCount: 0, rstCount: 0, finCount: 0,
        state: "established",
      };
      this.flowTable.set(key, flow);
    }
    flow.packetCount++;
    flow.byteCount += pkt.length;
    flow.lastSeen = Date.now();
  }

  private cleanupFlows() {
    const cutoff = Date.now() - FLOW_TIMEOUT_MS;
    for (const [key, flow] of this.flowTable) {
      if (flow.lastSeen < cutoff) this.flowTable.delete(key);
    }
    this.stats.activeFlows = this.flowTable.size;
  }

  // ── Public accessors ──────────────────────────────────────────────────────
  getArpTable(): ArpEntry[] { return [...this.arpTable.values()]; }
  getFlows(): TcpFlow[] { return [...this.flowTable.values()].sort((a, b) => b.lastSeen - a.lastSeen).slice(0, 100); }
  getDnsRecords(): DnsRecord[] { return this.dnsRecords.slice(0, 500); }
  getStats() { return { ...this.stats }; }
}
