import { useEffect, useState, useCallback, useMemo } from "react";
import { motion } from "motion/react";
import { Activity, AlertTriangle, Database, Globe, Network, RefreshCw, Shield, ScanLine, BarChart2, Wifi } from "lucide-react";
import { format } from "date-fns";
import { cn } from "../lib/utils";
import { identifyApp, CATEGORY_META, type AppCategory } from "../lib/appIntelligence";

interface ArpEntry {
  ip: string; mac: string; firstSeen: number; lastSeen: number; conflictCount: number;
}
interface TcpFlow {
  key: string; srcIp: string; dstIp: string; srcPort: number; dstPort: number;
  protocol: string; packetCount: number; byteCount: number; state: string; lastSeen: number;
  synCount: number; rstCount: number;
}
interface DnsRecord {
  query: string; type: string; srcIp: string; timestamp: number; suspicious: boolean; reason?: string;
}
interface NetworkStats {
  capture: { packetsReceived: number; packetsDropped: number; interface: string; isLive: boolean };
  analyzer: { packetsAnalyzed: number; arpEntries: number; activeFlows: number; dnsQueries: number; alertsGenerated: number };
  isLiveCapture: boolean;
  snortRulesLoaded: number;
  modelsLoaded: { v1_wireless: boolean; v2_nslkdd: boolean; nb_fallback: boolean };
}

// Aggregate DNS queries into per-domain site records
interface SiteRecord {
  domain: string;
  queryCount: number;
  devices: Set<string>;
  lastSeen: number;
  suspicious: boolean;
  subdomains: string[];
}

// Aggregate flows into per-destination bandwidth record
interface BandwidthRecord {
  dstIp: string;
  dstPort: number;
  proto: string;
  totalBytes: number;
  totalPackets: number;
  srcIps: Set<string>;
  lastSeen: number;
}

function apexDomain(query: string): string {
  const parts = query.toLowerCase().replace(/\.$/, "").split(".");
  if (parts.length <= 2) return parts.join(".");
  // handle .co.uk, .com.au etc (2-part TLD)
  const twoPartTLDs = ["co.uk","com.au","com.br","co.nz","co.za","org.uk","net.au"];
  const last2 = parts.slice(-2).join(".");
  if (twoPartTLDs.includes(last2)) return parts.slice(-3).join(".");
  return parts.slice(-2).join(".");
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

type SubTab = "overview" | "arp" | "flows" | "dns" | "sites" | "bandwidth";

export function NetworkTab() {
  const [subTab, setSubTab] = useState<SubTab>("sites");
  const [arpTable, setArpTable] = useState<ArpEntry[]>([]);
  const [flows, setFlows] = useState<TcpFlow[]>([]);
  const [dnsRecords, setDnsRecords] = useState<DnsRecord[]>([]);
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<{ found: number; subnet: string } | null>(null);
  const [siteSearch, setSiteSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<AppCategory | "all" | "unknown">("all");

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [arpRes, flowsRes, dnsRes, statsRes] = await Promise.all([
        fetch("/api/network/arp").then(r => r.json()),
        fetch("/api/network/flows").then(r => r.json()),
        fetch("/api/network/dns").then(r => r.json()),
        fetch("/api/network/stats").then(r => r.json()),
      ]);
      setArpTable(arpRes);
      setFlows(flowsRes);
      setDnsRecords(dnsRes);
      setStats(statsRes);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 15_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const handleScan = useCallback(async () => {
    setScanning(true);
    setScanResult(null);
    try {
      const res = await fetch("/api/network/scan");
      const data = await res.json();
      setScanResult({ found: data.found?.length ?? 0, subnet: data.subnet ?? "" });
      await fetchAll();
    } catch { /* ignore */ }
    setScanning(false);
  }, [fetchAll]);

  // ── Aggregate DNS → Sites ─────────────────────────────────────────────────
  const sites = useMemo<SiteRecord[]>(() => {
    const map = new Map<string, SiteRecord>();
    for (const rec of dnsRecords) {
      const domain = apexDomain(rec.query);
      if (!domain) continue;
      let site = map.get(domain);
      if (!site) {
        site = { domain, queryCount: 0, devices: new Set(), lastSeen: 0, suspicious: false, subdomains: [] };
        map.set(domain, site);
      }
      site.queryCount++;
      site.devices.add(rec.srcIp);
      if (rec.timestamp > site.lastSeen) site.lastSeen = rec.timestamp;
      if (rec.suspicious) site.suspicious = true;
      const sub = rec.query.replace(`.${domain}`, "");
      if (sub && sub !== domain && !site.subdomains.includes(sub)) site.subdomains.push(sub);
    }
    return [...map.values()].sort((a, b) => b.queryCount - a.queryCount);
  }, [dnsRecords]);

  // ── Aggregate Flows → Bandwidth ───────────────────────────────────────────
  const bandwidth = useMemo<BandwidthRecord[]>(() => {
    const map = new Map<string, BandwidthRecord>();
    for (const f of flows) {
      const key = `${f.dstIp}:${f.dstPort}`;
      let rec = map.get(key);
      if (!rec) {
        rec = { dstIp: f.dstIp, dstPort: f.dstPort, proto: f.protocol, totalBytes: 0, totalPackets: 0, srcIps: new Set(), lastSeen: 0 };
        map.set(key, rec);
      }
      rec.totalBytes += f.byteCount;
      rec.totalPackets += f.packetCount;
      rec.srcIps.add(f.srcIp);
      if (f.lastSeen > rec.lastSeen) rec.lastSeen = f.lastSeen;
    }
    return [...map.values()].sort((a, b) => b.totalBytes - a.totalBytes);
  }, [flows]);

  const maxBytes = bandwidth[0]?.totalBytes ?? 1;

  const filteredSites = useMemo(() => {
    if (!siteSearch && categoryFilter === "all") return sites;
    const q = siteSearch.toLowerCase();
    return sites.filter(s => {
      if (q && !s.domain.includes(q)) return false;
      if (categoryFilter === "all") return true;
      const app = identifyApp(s.domain);
      if (categoryFilter === "unknown") return !app;
      return app?.category === categoryFilter;
    });
  }, [sites, siteSearch, categoryFilter]);

  const SUB_TABS: { id: SubTab; label: string; icon: React.ReactNode }[] = [
    { id: "sites",     label: `Sites (${sites.length})`,          icon: <Globe className="w-3.5 h-3.5" /> },
    { id: "bandwidth", label: "Bandwidth",                          icon: <BarChart2 className="w-3.5 h-3.5" /> },
    { id: "dns",       label: `DNS Log (${dnsRecords.length})`,    icon: <Wifi className="w-3.5 h-3.5" /> },
    { id: "flows",     label: `Flows (${flows.length})`,           icon: <Activity className="w-3.5 h-3.5" /> },
    { id: "arp",       label: `ARP (${arpTable.length})`,          icon: <Shield className="w-3.5 h-3.5" /> },
    { id: "overview",  label: "Engine",                             icon: <Database className="w-3.5 h-3.5" /> },
  ];

  return (
    <motion.div key="network-view" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
      className="flex flex-col gap-4 h-full overflow-y-auto custom-scrollbar">

      {/* Sub-tab bar */}
      <div className="flex flex-wrap items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 shrink-0">
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all",
              subTab === t.id ? "bg-amber-600 text-white" : "text-slate-400 hover:text-slate-200")}>
            {t.icon}{t.label}
          </button>
        ))}
        <button onClick={fetchAll} disabled={loading} title="Refresh"
          className="ml-auto p-1.5 text-slate-500 hover:text-amber-400 transition-colors">
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
        </button>
        <button onClick={handleScan} disabled={scanning}
          title="Ping-sweep subnet to discover live hosts"
          className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase transition-all border",
            scanning ? "border-amber-500/40 bg-amber-500/10 text-amber-400 cursor-wait"
                     : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20")}>
          <ScanLine className={cn("w-3.5 h-3.5", scanning && "animate-pulse")} />
          {scanning ? "Scanning…" : "Scan Network"}
        </button>
      </div>

      {scanResult && (
        <div className="flex items-center gap-2 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-[11px] text-emerald-400 font-mono shrink-0">
          <ScanLine className="w-3.5 h-3.5 shrink-0" />
          Scan complete — <span className="font-bold">{scanResult.found}</span> live hosts on <span className="font-bold">{scanResult.subnet}</span>
          <button onClick={() => setScanResult(null)} className="ml-auto text-slate-500 hover:text-slate-300">✕</button>
        </div>
      )}

      {/* ── SITES TAB ─────────────────────────────────────────────────────── */}
      {subTab === "sites" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-3 border-b border-slate-800 flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              <div>
                <h4 className="text-sm font-bold text-white uppercase tracking-wider">Active Applications on Network</h4>
                <p className="text-[10px] text-slate-500 mt-0.5">Apps and sites identified from live DNS traffic. Updates every 15s.</p>
              </div>
              <input value={siteSearch} onChange={e => setSiteSearch(e.target.value)}
                placeholder="Search domain or app…"
                className="sm:ml-auto bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-[11px] text-white placeholder-slate-500 focus:outline-none focus:border-amber-500 w-full sm:w-44" />
            </div>
            {/* Category filter pills */}
            <div className="flex flex-wrap gap-1.5">
              {(["all", "vpn", "social", "video", "messaging", "gaming", "streaming", "finance", "adult", "cloud", "security", "adtech", "unknown"] as const).map(cat => {
                const meta = cat !== "all" && cat !== "unknown" ? CATEGORY_META[cat as AppCategory] : null;
                const isActive = categoryFilter === cat;
                const count = cat === "all" ? sites.length
                  : cat === "unknown" ? sites.filter(s => !identifyApp(s.domain)).length
                  : sites.filter(s => identifyApp(s.domain)?.category === cat).length;
                if (cat !== "all" && cat !== "unknown" && count === 0) return null;
                return (
                  <button key={cat} onClick={() => setCategoryFilter(cat)}
                    className={cn(
                      "px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all",
                      isActive
                        ? cat === "vpn" || cat === "adult"
                          ? "bg-rose-500/30 border-rose-500/60 text-rose-300"
                          : "bg-amber-500/20 border-amber-500/40 text-amber-300"
                        : meta
                          ? cn(meta.bg, meta.color, "opacity-60 hover:opacity-100")
                          : "bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200"
                    )}>
                    {cat === "all" ? `All (${count})` : cat === "unknown" ? `Unknown (${count})` : `${meta?.label} (${count})`}
                  </button>
                );
              })}
            </div>
          </div>
          {filteredSites.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-600 gap-2">
              <Globe className="w-8 h-8 opacity-30" />
              <p className="text-sm italic">
                {sites.length === 0
                  ? "No DNS traffic captured yet — app activity will appear as devices browse."
                  : "No apps match the current filter."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[700px]">
                <thead className="text-[10px] text-slate-600 uppercase border-b border-slate-800 bg-slate-950/30 sticky top-0">
                  <tr>
                    <th className="px-5 py-3">Application / Domain</th>
                    <th className="px-5 py-3">Category</th>
                    <th className="px-5 py-3 text-center">Queries</th>
                    <th className="px-5 py-3">Device IPs</th>
                    <th className="px-5 py-3 text-center">Risk</th>
                    <th className="px-5 py-3">Last Seen</th>
                  </tr>
                </thead>
                <tbody className="text-xs divide-y divide-slate-800/50">
                  {filteredSites.map(s => {
                    const app = identifyApp(s.domain);
                    const catMeta = app ? CATEGORY_META[app.category] : null;
                    const riskColor = app?.risk === "high" ? "text-rose-400" : app?.risk === "medium" ? "text-amber-400" : "text-emerald-500";
                    const rowBg = s.suspicious ? "bg-rose-500/5" : app?.risk === "high" ? "bg-rose-500/3" : app?.category === "vpn" ? "bg-rose-500/5" : "";
                    return (
                    <tr key={s.domain} className={cn("hover:bg-slate-800/20 transition-colors", rowBg)}>
                      {/* App / Domain */}
                      <td className="px-5 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="text-base shrink-0">{app?.icon ?? "🌐"}</span>
                          <div className="min-w-0">
                            {app ? (
                              <div className="font-semibold text-white text-[11px]">{app.name}</div>
                            ) : null}
                            <div className={cn("font-mono text-[10px]", app ? "text-slate-500" : "text-slate-300 font-semibold")}>
                              {s.domain}
                            </div>
                            {app?.note && (
                              <div className="text-[9px] text-amber-400/80 italic">{app.note}</div>
                            )}
                            {s.subdomains.length > 0 && !app && (
                              <div className="text-[9px] text-slate-600 font-mono truncate max-w-[220px]">
                                {s.subdomains.slice(0, 2).map(sub => `${sub}.${s.domain}`).join(", ")}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      {/* Category badge */}
                      <td className="px-5 py-2.5">
                        {catMeta ? (
                          <span className={cn("px-2 py-0.5 rounded-full text-[9px] font-bold border", catMeta.bg, catMeta.color)}>
                            {catMeta.label}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-full text-[9px] font-bold border bg-slate-800 border-slate-700 text-slate-500">Unknown</span>
                        )}
                      </td>
                      {/* Query count */}
                      <td className="px-5 py-2.5 text-center">
                        <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 rounded font-mono text-[10px] font-bold">{s.queryCount}</span>
                      </td>
                      {/* Device IPs */}
                      <td className="px-5 py-2.5">
                        <div className="flex flex-wrap gap-1">
                          {[...s.devices].slice(0, 4).map(ip => (
                            <span key={ip} className="px-1.5 py-0.5 bg-slate-800 rounded text-[9px] font-mono text-amber-300/80">{ip}</span>
                          ))}
                          {s.devices.size > 4 && <span className="text-[9px] text-slate-600">+{s.devices.size - 4}</span>}
                        </div>
                      </td>
                      {/* Risk */}
                      <td className="px-5 py-2.5 text-center">
                        {s.suspicious ? (
                          <span className="flex items-center justify-center gap-1 text-rose-400 text-[9px] font-bold">
                            <AlertTriangle className="w-3 h-3" />Suspicious
                          </span>
                        ) : app?.risk ? (
                          <span className={cn("text-[9px] font-bold uppercase", riskColor)}>
                            {app.risk === "high" ? "⚠ High" : app.risk === "medium" ? "• Medium" : "✓ Low"}
                          </span>
                        ) : (
                          <span className="text-slate-600 text-[9px]">—</span>
                        )}
                      </td>
                      {/* Time */}
                      <td className="px-5 py-2.5 font-mono text-slate-500 text-[10px]">{format(s.lastSeen, "HH:mm:ss")}</td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── BANDWIDTH TAB ─────────────────────────────────────────────────── */}
      {subTab === "bandwidth" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col">
          <div className="px-5 py-3 border-b border-slate-800">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Network Bandwidth Usage</h4>
            <p className="text-[10px] text-slate-500 mt-0.5">Traffic volume by destination — ranked by bytes transferred from live TCP/UDP flows.</p>
          </div>
          {bandwidth.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-600 gap-2">
              <BarChart2 className="w-8 h-8 opacity-30" />
              <p className="text-sm italic">No flow data yet — bandwidth usage will appear as devices transfer data.</p>
            </div>
          ) : (
            <div className="p-4 space-y-2 overflow-y-auto">
              {/* Summary strip */}
              <div className="grid grid-cols-3 gap-3 mb-4">
                {[
                  { label: "Total Flows", value: flows.length.toLocaleString(), color: "text-amber-400" },
                  { label: "Total Traffic", value: formatBytes(bandwidth.reduce((a, b) => a + b.totalBytes, 0)), color: "text-emerald-400" },
                  { label: "Active Endpoints", value: bandwidth.length.toLocaleString(), color: "text-violet-400" },
                ].map(s => (
                  <div key={s.label} className="bg-slate-800/50 border border-slate-700 rounded-lg px-4 py-3">
                    <div className="text-[10px] text-slate-500 uppercase tracking-widest">{s.label}</div>
                    <div className={cn("text-lg font-black font-mono mt-1", s.color)}>{s.value}</div>
                  </div>
                ))}
              </div>
              {/* Per-destination bars */}
              {bandwidth.slice(0, 50).map((b, i) => {
                const pct = Math.max(2, (b.totalBytes / maxBytes) * 100);
                const portLabel: Record<number, string> = { 80: "HTTP", 443: "HTTPS", 53: "DNS", 22: "SSH", 3389: "RDP", 8080: "HTTP-ALT", 21: "FTP" };
                const svcLabel = portLabel[b.dstPort] ?? `port ${b.dstPort}`;
                const isHighRisk = [22, 3389, 21].includes(b.dstPort);
                return (
                  <div key={`${b.dstIp}:${b.dstPort}`} className="group">
                    <div className="flex items-center justify-between mb-1 gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-[10px] text-slate-600 font-mono w-5 shrink-0">#{i + 1}</span>
                        <span className="font-mono text-[11px] text-amber-400 truncate">{b.dstIp}</span>
                        <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0",
                          isHighRisk ? "bg-rose-500/20 text-rose-400" : b.dstPort === 443 ? "bg-emerald-500/20 text-emerald-400" : "bg-slate-700 text-slate-400")}>
                          {svcLabel}
                        </span>
                        <span className="text-[9px] text-slate-600 uppercase shrink-0">{b.proto}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 text-[10px] font-mono">
                        <span className="text-slate-400">{b.totalPackets.toLocaleString()} pkts</span>
                        <span className="text-white font-bold">{formatBytes(b.totalBytes)}</span>
                        <span className="text-slate-600">{b.srcIps.size} src</span>
                      </div>
                    </div>
                    <div className="h-2 bg-slate-800 rounded-full overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all duration-500",
                        isHighRisk ? "bg-rose-500" : b.dstPort === 443 ? "bg-emerald-500" : b.dstPort === 80 ? "bg-amber-500" : "bg-amber-600")}
                        style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── DNS LOG TAB ───────────────────────────────────────────────────── */}
      {subTab === "dns" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Raw DNS Query Log</h4>
            <p className="text-[10px] text-slate-500 mt-0.5">Every DNS request captured. High-entropy subdomains flagged as potential tunneling.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[600px]">
              <thead className="text-[10px] text-slate-600 uppercase border-b border-slate-800 bg-slate-950/30">
                <tr>
                  <th className="px-5 py-3">Query</th>
                  <th className="px-5 py-3 text-center">Type</th>
                  <th className="px-5 py-3">Source IP</th>
                  <th className="px-5 py-3 text-center">Status</th>
                  <th className="px-5 py-3">Time</th>
                </tr>
              </thead>
              <tbody className="text-xs divide-y divide-slate-800/40">
                {dnsRecords.length === 0
                  ? <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-600 italic">No DNS queries captured yet.</td></tr>
                  : dnsRecords.map((d, i) => (
                    <tr key={i} className={cn("hover:bg-slate-800/20", d.suspicious && "bg-amber-500/5")}>
                      <td className="px-5 py-2 font-mono text-[10px] text-slate-300 max-w-[280px] truncate" title={d.query}>{d.query}</td>
                      <td className="px-5 py-2 text-center"><span className="px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded text-[9px] font-mono">{d.type}</span></td>
                      <td className="px-5 py-2 font-mono text-amber-400 text-[10px]">{d.srcIp}</td>
                      <td className="px-5 py-2 text-center">
                        {d.suspicious
                          ? <span className="flex items-center justify-center gap-1 text-amber-400 text-[9px] font-bold"><AlertTriangle className="w-3 h-3" />{d.reason?.split("—")[0] ?? "Suspicious"}</span>
                          : <span className="text-emerald-500 text-[9px] font-bold">Normal</span>}
                      </td>
                      <td className="px-5 py-2 font-mono text-slate-500 text-[10px]">{format(d.timestamp, "HH:mm:ss")}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── FLOWS TAB ─────────────────────────────────────────────────────── */}
      {subTab === "flows" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">TCP/UDP Flow Table</h4>
            <p className="text-[10px] text-slate-500 mt-0.5">Active and recent flows. High SYN counts indicate flood attacks.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[800px]">
              <thead className="text-[10px] text-slate-600 uppercase border-b border-slate-800 bg-slate-950/30">
                <tr>
                  <th className="px-4 py-3">Source</th><th className="px-4 py-3">Destination</th>
                  <th className="px-4 py-3 text-center">Proto</th><th className="px-4 py-3 text-center">Pkts</th>
                  <th className="px-4 py-3 text-center">Bytes</th><th className="px-4 py-3 text-center">SYNs</th>
                  <th className="px-4 py-3 text-center">State</th><th className="px-4 py-3">Last Seen</th>
                </tr>
              </thead>
              <tbody className="text-xs divide-y divide-slate-800/40">
                {flows.length === 0
                  ? <tr><td colSpan={8} className="px-5 py-8 text-center text-slate-600 italic">No flows yet.</td></tr>
                  : flows.map(f => (
                    <tr key={f.key} className={cn("hover:bg-slate-800/20", f.synCount > 20 && "bg-rose-500/5")}>
                      <td className="px-4 py-2 font-mono text-amber-400 text-[10px]">{f.srcIp}:{f.srcPort}</td>
                      <td className="px-4 py-2 font-mono text-slate-300 text-[10px]">{f.dstIp}:{f.dstPort}</td>
                      <td className="px-4 py-2 text-center"><span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded text-[9px] font-bold uppercase">{f.protocol}</span></td>
                      <td className="px-4 py-2 text-center font-mono text-slate-300 text-[10px]">{f.packetCount}</td>
                      <td className="px-4 py-2 text-center font-mono text-slate-400 text-[10px]">{formatBytes(f.byteCount)}</td>
                      <td className="px-4 py-2 text-center font-mono text-[10px]" style={{ color: f.synCount > 20 ? "#f43f5e" : "#64748b" }}>{f.synCount}</td>
                      <td className="px-4 py-2 text-center">
                        <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                          f.state === "established" ? "bg-emerald-500/20 text-emerald-400" :
                          f.state === "reset" ? "bg-rose-500/20 text-rose-400" : "bg-slate-700 text-slate-400")}>
                          {f.state}
                        </span>
                      </td>
                      <td className="px-4 py-2 font-mono text-slate-500 text-[10px]">{format(f.lastSeen, "HH:mm:ss")}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ARP TAB ───────────────────────────────────────────────────────── */}
      {subTab === "arp" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">ARP Binding Table</h4>
            <p className="text-[10px] text-slate-500 mt-0.5">IP→MAC bindings. Conflicts indicate ARP spoofing.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[600px]">
              <thead className="text-[10px] text-slate-600 uppercase border-b border-slate-800 bg-slate-950/30">
                <tr>
                  <th className="px-5 py-3">IP Address</th><th className="px-5 py-3">MAC Address</th>
                  <th className="px-5 py-3 text-center">Conflicts</th>
                  <th className="px-5 py-3">First Seen</th><th className="px-5 py-3">Last Seen</th>
                </tr>
              </thead>
              <tbody className="text-xs divide-y divide-slate-800/40">
                {arpTable.length === 0
                  ? <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-600 italic">No ARP entries yet.</td></tr>
                  : arpTable.map(e => (
                    <tr key={e.ip} className={cn("hover:bg-slate-800/20", e.conflictCount > 0 && "bg-rose-500/5")}>
                      <td className="px-5 py-3 font-mono text-amber-400">{e.ip}</td>
                      <td className="px-5 py-3 font-mono text-slate-300">{e.mac}</td>
                      <td className="px-5 py-3 text-center">
                        {e.conflictCount > 0
                          ? <span className="px-2 py-0.5 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded text-[9px] font-bold">{e.conflictCount} CONFLICT</span>
                          : <span className="text-slate-600 text-[9px]">—</span>}
                      </td>
                      <td className="px-5 py-3 font-mono text-slate-500 text-[10px]">{format(e.firstSeen, "HH:mm:ss")}</td>
                      <td className="px-5 py-3 font-mono text-slate-500 text-[10px]">{format(e.lastSeen, "HH:mm:ss")}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── ENGINE OVERVIEW TAB ───────────────────────────────────────────── */}
      {subTab === "overview" && stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 shrink-0">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Database className="w-3 h-3 text-amber-500" /> Capture Engine
            </h4>
            <div className="space-y-3">
              {[
                { label: "Mode", value: stats.isLiveCapture ? "Live (libpcap)" : "Offline", color: stats.isLiveCapture ? "text-emerald-400" : "text-rose-400" },
                { label: "Interface", value: stats.capture.interface, color: "text-amber-400" },
                { label: "Packets Received", value: stats.capture.packetsReceived.toLocaleString(), color: "text-white" },
                { label: "Packets Analyzed", value: stats.analyzer.packetsAnalyzed.toLocaleString(), color: "text-white" },
                { label: "Packets Dropped", value: stats.capture.packetsDropped.toLocaleString(), color: stats.capture.packetsDropped > 0 ? "text-rose-400" : "text-slate-500" },
              ].map(r => (
                <div key={r.label} className="flex justify-between items-center">
                  <span className="text-[11px] text-slate-500">{r.label}</span>
                  <span className={cn("text-[11px] font-mono font-bold", r.color)}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Activity className="w-3 h-3 text-violet-500" /> Analyzer Stats
            </h4>
            <div className="space-y-3">
              {[
                { label: "ARP Entries", value: stats.analyzer.arpEntries, color: "text-emerald-400" },
                { label: "Active Flows", value: stats.analyzer.activeFlows, color: "text-amber-400" },
                { label: "DNS Queries", value: stats.analyzer.dnsQueries, color: "text-amber-400" },
                { label: "Network Alerts", value: stats.analyzer.alertsGenerated, color: stats.analyzer.alertsGenerated > 0 ? "text-rose-400" : "text-slate-500" },
                { label: "Snort Rules", value: stats.snortRulesLoaded, color: "text-violet-400" },
              ].map(r => (
                <div key={r.label} className="flex justify-between items-center">
                  <span className="text-[11px] text-slate-500">{r.label}</span>
                  <span className={cn("text-[11px] font-mono font-bold", r.color)}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 sm:col-span-2">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">ML Models Loaded</h4>
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Wireless RF (v1)", key: "v1_wireless", desc: "5-feature 802.11 scorer" },
                { label: "NSL-KDD RF (v2)", key: "v2_nslkdd", desc: "10-feature network classifier" },
                { label: "Naive Bayes (NB)", key: "nb_fallback", desc: "Lightweight fallback" },
              ].map(m => (
                <div key={m.key} className={cn("p-3 rounded-lg border",
                  stats.modelsLoaded[m.key as keyof typeof stats.modelsLoaded]
                    ? "border-emerald-500/30 bg-emerald-500/5" : "border-slate-700 bg-slate-800/30")}>
                  <div className={cn("text-[10px] font-bold uppercase mb-1",
                    stats.modelsLoaded[m.key as keyof typeof stats.modelsLoaded] ? "text-emerald-400" : "text-slate-500")}>
                    {stats.modelsLoaded[m.key as keyof typeof stats.modelsLoaded] ? "✓" : "✗"} {m.label}
                  </div>
                  <div className="text-[9px] text-slate-500">{m.desc}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
