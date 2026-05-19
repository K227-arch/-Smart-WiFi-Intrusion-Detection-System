/**
 * SALAMANDA WIDS — Real Packet Capture Engine
 * Uses the `cap` module (libpcap bindings) to capture live traffic from
 * any network interface (wired or wireless).
 *
 * Falls back gracefully to the simulator if libpcap is unavailable or
 * the process lacks capture privileges.
 */

import { EventEmitter } from "events";
import * as path from "path";
import * as fs from "fs";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface CapturedPacket {
  timestamp: number;
  // Layer 2
  srcMac: string;
  dstMac: string;
  etherType: number;       // 0x0800=IPv4, 0x0806=ARP, 0x86DD=IPv6
  // Layer 3 (if present)
  srcIp?: string;
  dstIp?: string;
  protocol?: number;       // 6=TCP, 17=UDP, 1=ICMP
  ttl?: number;
  // Layer 4 (if present)
  srcPort?: number;
  dstPort?: number;
  tcpFlags?: number;       // bitmask: SYN=0x02, ACK=0x10, FIN=0x01, RST=0x04
  payloadLength?: number;
  // ARP fields
  arpOp?: number;          // 1=request, 2=reply
  arpSenderIp?: string;
  arpTargetIp?: string;
  arpSenderMac?: string;
  // DNS (parsed from UDP port 53)
  dnsQuery?: string;
  dnsType?: string;
  // 802.11 wireless (if available)
  ssid?: string;
  bssid?: string;
  channel?: number;
  signalStrength?: number;
  frameType?: "data" | "mgmt" | "beacons" | "deauth" | "probe";
  // Meta
  interface: string;
  length: number;
  rawHex?: string;
}

export interface CaptureStats {
  packetsReceived: number;
  packetsDropped: number;
  interface: string;
  filter: string;
  startTime: number;
  isLive: boolean;
}

// ── Packet Parser ─────────────────────────────────────────────────────────────
function macToString(buf: Buffer, offset: number): string {
  return Array.from({ length: 6 }, (_, i) =>
    buf[offset + i].toString(16).padStart(2, "0").toUpperCase()
  ).join(":");
}

function ipToString(buf: Buffer, offset: number): string {
  return `${buf[offset]}.${buf[offset + 1]}.${buf[offset + 2]}.${buf[offset + 3]}`;
}

function parseDnsQuery(buf: Buffer, offset: number): string {
  const labels: string[] = [];
  let pos = offset;
  let safety = 0;
  while (pos < buf.length && buf[pos] !== 0 && safety++ < 20) {
    const len = buf[pos++];
    if (len > 63 || pos + len > buf.length) break;
    labels.push(buf.slice(pos, pos + len).toString("ascii"));
    pos += len;
  }
  return labels.join(".");
}

export function parseEthernetFrame(buf: Buffer, iface: string): CapturedPacket | null {
  if (buf.length < 14) return null;

  const packet: CapturedPacket = {
    timestamp: Date.now(),
    srcMac: macToString(buf, 6),
    dstMac: macToString(buf, 0),
    etherType: buf.readUInt16BE(12),
    interface: iface,
    length: buf.length,
  };

  // ── ARP ──────────────────────────────────────────────────────────────────
  if (packet.etherType === 0x0806 && buf.length >= 42) {
    packet.arpOp = buf.readUInt16BE(20);
    packet.arpSenderMac = macToString(buf, 22);
    packet.arpSenderIp = ipToString(buf, 28);
    packet.arpTargetIp = ipToString(buf, 38);
    return packet;
  }

  // ── IPv4 ─────────────────────────────────────────────────────────────────
  if (packet.etherType === 0x0800 && buf.length >= 34) {
    const ihl = (buf[14] & 0x0f) * 4;
    packet.srcIp = ipToString(buf, 26);
    packet.dstIp = ipToString(buf, 30);
    packet.protocol = buf[23];
    packet.ttl = buf[22];

    const l4Offset = 14 + ihl;

    // TCP
    if (packet.protocol === 6 && buf.length >= l4Offset + 20) {
      packet.srcPort = buf.readUInt16BE(l4Offset);
      packet.dstPort = buf.readUInt16BE(l4Offset + 2);
      packet.tcpFlags = buf[l4Offset + 13];
      packet.payloadLength = buf.length - l4Offset - ((buf[l4Offset + 12] >> 4) * 4);
    }

    // UDP
    if (packet.protocol === 17 && buf.length >= l4Offset + 8) {
      packet.srcPort = buf.readUInt16BE(l4Offset);
      packet.dstPort = buf.readUInt16BE(l4Offset + 2);
      packet.payloadLength = buf.readUInt16BE(l4Offset + 4) - 8;

      // DNS (port 53)
      if ((packet.srcPort === 53 || packet.dstPort === 53) && buf.length > l4Offset + 20) {
        try {
          const dnsOffset = l4Offset + 8;
          const qdCount = buf.readUInt16BE(dnsOffset + 4);
          if (qdCount > 0) {
            packet.dnsQuery = parseDnsQuery(buf, dnsOffset + 12);
            const qTypeOffset = dnsOffset + 12 + packet.dnsQuery.split(".").reduce((a, l) => a + l.length + 1, 0) + 1;
            const qType = buf.readUInt16BE(qTypeOffset);
            packet.dnsType = qType === 1 ? "A" : qType === 28 ? "AAAA" : qType === 5 ? "CNAME" : qType === 15 ? "MX" : String(qType);
          }
        } catch { /* malformed DNS */ }
      }
    }
  }

  return packet;
}

// ── Capture Engine ────────────────────────────────────────────────────────────
export class PacketCaptureEngine extends EventEmitter {
  private cap: any = null;
  private buffer: Buffer = Buffer.alloc(65535);
  private stats: CaptureStats;
  private active = false;
  private pcapAvailable = false;

  constructor(private iface: string = "en0", private filter: string = "") {
    super();
    this.stats = {
      packetsReceived: 0,
      packetsDropped: 0,
      interface: iface,
      filter,
      startTime: Date.now(),
      isLive: false,
    };
  }

  async start(): Promise<boolean> {
    try {
      // Dynamic import — cap is optional
      const { Cap, decoders } = await import("cap");
      const c = new Cap();
      const device = Cap.findDevice(this.iface) ?? this.iface;
      const linkType = c.open(device, this.filter || "ip or arp", 65535, this.buffer);

      this.cap = c;
      this.active = true;
      this.pcapAvailable = true;
      this.stats.isLive = true;

      c.on("packet", (nbytes: number, trunc: boolean) => {
        if (!this.active) return;
        this.stats.packetsReceived++;
        try {
          const raw = this.buffer.slice(0, nbytes);
          const parsed = parseEthernetFrame(raw, this.iface);
          if (parsed) {
            parsed.rawHex = raw.slice(0, 32).toString("hex");
            this.emit("packet", parsed);
          }
        } catch { /* malformed */ }
      });

      console.log(`✓ Live capture started on ${this.iface} (${linkType}) filter="${this.filter}"`);
      return true;
    } catch (e: any) {
      console.warn(`⚠ Live capture unavailable (${e.message}). Using simulator.`);
      this.pcapAvailable = false;
      return false;
    }
  }

  stop() {
    this.active = false;
    if (this.cap) {
      try { this.cap.close(); } catch { /* ignore */ }
      this.cap = null;
    }
  }

  getStats(): CaptureStats { return { ...this.stats }; }
  isLive(): boolean { return this.pcapAvailable && this.active; }

  // ── PCAP file replay ──────────────────────────────────────────────────────
  async replayPcap(filePath: string, speedMultiplier = 1): Promise<void> {
    if (!fs.existsSync(filePath)) throw new Error(`PCAP file not found: ${filePath}`);

    const buf = fs.readFileSync(filePath);
    if (buf.length < 24) throw new Error("Invalid PCAP file");

    // Parse global header
    const magic = buf.readUInt32LE(0);
    const isLE = magic === 0xa1b2c3d4 || magic === 0xa1b23c4d;
    const read32 = (o: number) => isLE ? buf.readUInt32LE(o) : buf.readUInt32BE(o);
    const read16 = (o: number) => isLE ? buf.readUInt16LE(o) : buf.readUInt16BE(o);

    let offset = 24;
    let firstTs: number | null = null;
    let packetCount = 0;

    console.log(`▶ Replaying PCAP: ${path.basename(filePath)}`);

    while (offset + 16 <= buf.length) {
      const tsSec = read32(offset);
      const tsUsec = read32(offset + 4);
      const inclLen = read32(offset + 8);
      offset += 16;

      if (offset + inclLen > buf.length) break;

      const ts = tsSec * 1000 + Math.floor(tsUsec / 1000);
      if (firstTs === null) firstTs = ts;

      const delay = Math.max(0, (ts - firstTs) / speedMultiplier);
      await new Promise((r) => setTimeout(r, delay));

      const raw = buf.slice(offset, offset + inclLen);
      const parsed = parseEthernetFrame(raw, `pcap:${path.basename(filePath)}`);
      if (parsed) {
        parsed.timestamp = Date.now();
        this.emit("packet", parsed);
        packetCount++;
      }

      offset += inclLen;
      firstTs = ts;
    }

    console.log(`✓ PCAP replay complete: ${packetCount} packets`);
    this.emit("replay-complete", { file: filePath, packets: packetCount });
  }
}
