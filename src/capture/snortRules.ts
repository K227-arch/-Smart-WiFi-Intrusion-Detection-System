/**
 * SALAMANDA WIDS — Snort Rule Engine
 * Parses real Snort rule syntax and matches against captured packets.
 *
 * Supports:
 *   alert tcp/udp/icmp/ip any any -> any any (msg:"..."; sid:N; ...)
 *   Options: msg, sid, content, nocase, flags, threshold, detection_filter
 */

import * as fs from "fs";
import * as path from "path";
import type { CapturedPacket } from "./packetCapture";

// ── Types ─────────────────────────────────────────────────────────────────────
export interface SnortRuleParsed {
  raw: string;
  action: "alert" | "log" | "drop" | "pass";
  protocol: "tcp" | "udp" | "icmp" | "ip" | "any";
  srcIp: string;
  srcPort: string;
  direction: "->" | "<>";
  dstIp: string;
  dstPort: string;
  // Options
  msg: string;
  sid: number;
  rev: number;
  content?: string[];
  nocase: boolean;
  flags?: string;        // TCP flags e.g. "S" = SYN
  threshold?: { type: string; track: string; count: number; seconds: number };
  classtype?: string;
  priority?: number;
  enabled: boolean;
}

export interface SnortMatch {
  rule: SnortRuleParsed;
  packet: CapturedPacket;
  timestamp: number;
}

// ── Parser ────────────────────────────────────────────────────────────────────
function parsePort(portStr: string): { min: number; max: number } | null {
  if (portStr === "any") return null;
  if (portStr.includes(":")) {
    const [a, b] = portStr.split(":").map(Number);
    return { min: a || 0, max: b || 65535 };
  }
  const n = parseInt(portStr, 10);
  return isNaN(n) ? null : { min: n, max: n };
}

function matchPort(portStr: string, port: number | undefined): boolean {
  if (portStr === "any") return true;
  if (!port) return false;
  const range = parsePort(portStr);
  if (!range) return false;
  return port >= range.min && port <= range.max;
}

function matchIp(ipStr: string, ip: string | undefined): boolean {
  if (ipStr === "any" || ipStr === "$HOME_NET" || ipStr === "$EXTERNAL_NET") return true;
  if (!ip) return false;
  if (ipStr.startsWith("!")) return ip !== ipStr.slice(1);
  if (ipStr.includes("/")) {
    // CIDR match
    const [network, bits] = ipStr.split("/");
    const mask = ~((1 << (32 - parseInt(bits, 10))) - 1) >>> 0;
    const ipNum = ip.split(".").reduce((acc, o) => (acc << 8) | parseInt(o, 10), 0) >>> 0;
    const netNum = network.split(".").reduce((acc, o) => (acc << 8) | parseInt(o, 10), 0) >>> 0;
    return (ipNum & mask) === (netNum & mask);
  }
  return ip === ipStr;
}

export function parseSnortRule(line: string): SnortRuleParsed | null {
  line = line.trim();
  if (!line || line.startsWith("#")) return null;

  // action proto src_ip src_port direction dst_ip dst_port (options)
  const headerMatch = line.match(
    /^(alert|log|drop|pass)\s+(tcp|udp|icmp|ip|any)\s+(\S+)\s+(\S+)\s+(->|<>)\s+(\S+)\s+(\S+)\s*\((.+)\)$/s
  );
  if (!headerMatch) return null;

  const [, action, protocol, srcIp, srcPort, direction, dstIp, dstPort, optStr] = headerMatch;

  // Parse options
  const opts: Record<string, string> = {};
  const contentList: string[] = [];

  // Split options by semicolon, respecting quoted strings
  const optParts = optStr.match(/(?:[^;"']|"[^"]*"|'[^']*')+/g) ?? [];
  for (const part of optParts) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx === -1) {
      opts[trimmed] = "true";
    } else {
      const key = trimmed.slice(0, colonIdx).trim();
      const val = trimmed.slice(colonIdx + 1).trim().replace(/^"|"$/g, "");
      if (key === "content") contentList.push(val);
      else opts[key] = val;
    }
  }

  const sid = parseInt(opts.sid ?? "0", 10);
  if (!sid) return null;

  let threshold: SnortRuleParsed["threshold"];
  if (opts.threshold || opts.detection_filter) {
    const tStr = opts.threshold ?? opts.detection_filter;
    const tMatch = tStr.match(/type\s+(\w+).*track\s+(\w+).*count\s+(\d+).*seconds\s+(\d+)/);
    if (tMatch) {
      threshold = { type: tMatch[1], track: tMatch[2], count: parseInt(tMatch[3], 10), seconds: parseInt(tMatch[4], 10) };
    }
  }

  return {
    raw: line,
    action: action as SnortRuleParsed["action"],
    protocol: protocol as SnortRuleParsed["protocol"],
    srcIp, srcPort, direction: direction as "->",
    dstIp, dstPort,
    msg: opts.msg ?? "Unknown",
    sid,
    rev: parseInt(opts.rev ?? "1", 10),
    content: contentList.length > 0 ? contentList : undefined,
    nocase: "nocase" in opts,
    flags: opts.flags,
    threshold,
    classtype: opts.classtype,
    priority: opts.priority ? parseInt(opts.priority, 10) : undefined,
    enabled: true,
  };
}

export function loadSnortRules(filePath: string): SnortRuleParsed[] {
  if (!fs.existsSync(filePath)) return [];
  const lines = fs.readFileSync(filePath, "utf-8").split("\n");
  const rules: SnortRuleParsed[] = [];
  for (const line of lines) {
    const rule = parseSnortRule(line);
    if (rule) rules.push(rule);
  }
  console.log(`✓ Loaded ${rules.length} Snort rules from ${filePath}`);
  return rules;
}

// ── Matcher ───────────────────────────────────────────────────────────────────
export function matchSnortRule(rule: SnortRuleParsed, pkt: CapturedPacket): boolean {
  if (!rule.enabled) return false;

  // Protocol check
  if (rule.protocol !== "any" && rule.protocol !== "ip") {
    if (rule.protocol === "tcp" && pkt.protocol !== 6) return false;
    if (rule.protocol === "udp" && pkt.protocol !== 17) return false;
    if (rule.protocol === "icmp" && pkt.protocol !== 1) return false;
  }

  // IP checks
  if (!matchIp(rule.srcIp, pkt.srcIp) && !matchIp(rule.srcIp, pkt.srcMac)) return false;
  if (!matchIp(rule.dstIp, pkt.dstIp) && !matchIp(rule.dstIp, pkt.dstMac)) return false;

  // Port checks
  if (!matchPort(rule.srcPort, pkt.srcPort)) return false;
  if (!matchPort(rule.dstPort, pkt.dstPort)) return false;

  // TCP flags
  if (rule.flags && pkt.tcpFlags !== undefined) {
    const flagMap: Record<string, number> = { S: 0x02, A: 0x10, F: 0x01, R: 0x04, P: 0x08, U: 0x20 };
    for (const f of rule.flags.toUpperCase()) {
      if (flagMap[f] && !(pkt.tcpFlags & flagMap[f])) return false;
    }
  }

  return true;
}

// ── Default WIDS Snort Rules ──────────────────────────────────────────────────
export const DEFAULT_SNORT_RULES_CONTENT = `# SALAMANDA WIDS — Default Snort Rules
# Generated automatically — edit to customise

alert tcp any any -> any 80 (msg:"Possible HTTP attack"; content:"GET"; sid:1000001; rev:1;)
alert tcp any any -> any any (msg:"TCP SYN Flood"; flags:S; threshold:type both,track by_src,count 50,seconds 5; sid:1000002; rev:1;)
alert icmp any any -> any any (msg:"ICMP Ping Detected"; sid:1000003; rev:1;)
alert tcp any any -> any 22 (msg:"SSH Brute Force Attempt"; flags:S; threshold:type both,track by_src,count 10,seconds 60; sid:1000004; rev:1;)
alert tcp any any -> any 3389 (msg:"RDP Scan Detected"; flags:S; sid:1000005; rev:1;)
alert udp any any -> any 53 (msg:"DNS Query Flood"; threshold:type both,track by_src,count 100,seconds 10; sid:1000006; rev:1;)
alert tcp any any -> any 445 (msg:"SMB Scan - Possible WannaCry"; flags:S; sid:1000007; rev:1;)
alert tcp any any -> any 23 (msg:"Telnet Connection Attempt"; sid:1000008; rev:1;)
alert tcp any any -> any 21 (msg:"FTP Connection Attempt"; sid:1000009; rev:1;)
alert udp any any -> any 161 (msg:"SNMP Scan Detected"; sid:1000010; rev:1;)
`;

export function ensureDefaultRulesFile(filePath: string) {
  if (!fs.existsSync(filePath)) {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, DEFAULT_SNORT_RULES_CONTENT);
    console.log(`✓ Default Snort rules written to ${filePath}`);
  }
}
