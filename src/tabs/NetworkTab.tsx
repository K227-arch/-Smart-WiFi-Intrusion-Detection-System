import { useEffect, useState, useCallback } from "react";
import { motion } from "motion/react";
import { Activity, AlertTriangle, Database, Globe, Network, RefreshCw, Shield } from "lucide-react";
import { format } from "date-fns";
import { cn } from "../lib/utils";

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

type SubTab = "overview" | "arp" | "flows" | "dns";

export function NetworkTab() {
  const [subTab, setSubTab] = useState<SubTab>("overview");
  const [arpTable, setArpTable] = useState<ArpEntry[]>([]);
  const [flows, setFlows] = useState<TcpFlow[]>([]);
  const [dnsRecords, setDnsRecords] = useState<DnsRecord[]>([]);
  const [stats, setStats] = useState<NetworkStats | null>(null);
  const [loading, setLoading] = useState(false);

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
    const interval = setInterval(fetchAll, 30_000);
    return () => clearInterval(interval);
  }, [fetchAll]);

  const SUB_TABS: { id: SubTab; label: string; icon: React.ReactNode }[] = [
    { id: "overview", label: "Overview", icon: <Network className="w-3.5 h-3.5" /> },
    { id: "arp", label: `ARP Table (${arpTable.length})`, icon: <Shield className="w-3.5 h-3.5" /> },
    { id: "flows", label: `Flows (${flows.length})`, icon: <Activity className="w-3.5 h-3.5" /> },
    { id: "dns", label: `DNS (${dnsRecords.length})`, icon: <Globe className="w-3.5 h-3.5" /> },
  ];

  return (
    <motion.div
      key="network-view"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col gap-4 h-full overflow-y-auto custom-scrollbar"
    >
      {/* Sub-tab bar */}
      <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1 shrink-0">
        {SUB_TABS.map(t => (
          <button key={t.id} onClick={() => setSubTab(t.id)}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all",
              subTab === t.id ? "bg-amber-600 text-white" : "text-slate-400 hover:text-slate-200")}>
            {t.icon}{t.label}
          </button>
        ))}
        <button onClick={fetchAll} disabled={loading}
          className="ml-auto p-1.5 text-slate-500 hover:text-amber-400 transition-colors">
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
        </button>
      </div>

      {/* Overview */}
      {subTab === "overview" && stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 shrink-0">
          {/* Cloud mode notice */}
          {!stats.isLiveCapture && (
            <div className="sm:col-span-2 flex items-start gap-3 p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-bold text-amber-400 uppercase tracking-wider">Simulator / Cloud Mode</p>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  Live packet capture requires direct hardware access. ARP, Flow, and DNS tables populate only when running locally via Docker or <code className="font-mono bg-slate-800 px-1 rounded">sudo npm run dev</code>.
                </p>
              </div>
            </div>
          )}
          {/* Capture status */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Database className="w-3 h-3 text-amber-500" /> Capture Engine
            </h4>
            <div className="space-y-3">
              {[
                { label: "Mode", value: stats.isLiveCapture ? "Live (libpcap)" : "Simulator", color: stats.isLiveCapture ? "text-emerald-400" : "text-amber-400" },
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

          {/* Analyzer stats */}
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

          {/* ML Models */}
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

      {/* ARP Table */}
      {subTab === "arp" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">ARP Binding Table</h4>
            <p className="text-[10px] text-slate-500 mt-0.5">IP→MAC bindings learned from live traffic. Conflicts indicate ARP spoofing.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[600px]">
              <thead className="text-[10px] text-slate-600 uppercase border-b border-slate-800 bg-slate-950/30">
                <tr>
                  <th className="px-5 py-3">IP Address</th>
                  <th className="px-5 py-3">MAC Address</th>
                  <th className="px-5 py-3 text-center">Conflicts</th>
                  <th className="px-5 py-3">First Seen</th>
                  <th className="px-5 py-3">Last Seen</th>
                </tr>
              </thead>
              <tbody className="text-xs">
                {arpTable.length === 0 ? (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-600 italic">No ARP entries yet — waiting for live traffic.</td></tr>
                ) : arpTable.map(e => (
                  <tr key={e.ip} className={cn("border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors",
                    e.conflictCount > 0 && "bg-rose-500/5")}>
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

      {/* TCP/UDP Flows */}
      {subTab === "flows" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">TCP/UDP Flow Table</h4>
            <p className="text-[10px] text-slate-500 mt-0.5">Active and recent network flows. High SYN counts indicate flood attacks.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[800px]">
              <thead className="text-[10px] text-slate-600 uppercase border-b border-slate-800 bg-slate-950/30">
                <tr>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Destination</th>
                  <th className="px-4 py-3 text-center">Proto</th>
                  <th className="px-4 py-3 text-center">Pkts</th>
                  <th className="px-4 py-3 text-center">Bytes</th>
                  <th className="px-4 py-3 text-center">SYNs</th>
                  <th className="px-4 py-3 text-center">State</th>
                  <th className="px-4 py-3">Last Seen</th>
                </tr>
              </thead>
              <tbody className="text-xs">
                {flows.length === 0 ? (
                  <tr><td colSpan={8} className="px-5 py-8 text-center text-slate-600 italic">No flows yet — waiting for live traffic.</td></tr>
                ) : flows.map(f => (
                  <tr key={f.key} className={cn("border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors",
                    f.synCount > 20 && "bg-rose-500/5")}>
                    <td className="px-4 py-2 font-mono text-amber-400 text-[10px]">{f.srcIp}:{f.srcPort}</td>
                    <td className="px-4 py-2 font-mono text-slate-300 text-[10px]">{f.dstIp}:{f.dstPort}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                        f.protocol === "tcp" ? "bg-amber-500/20 text-amber-400" : "bg-amber-500/20 text-amber-400")}>
                        {f.protocol}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-center font-mono text-slate-300 text-[10px]">{f.packetCount}</td>
                    <td className="px-4 py-2 text-center font-mono text-slate-400 text-[10px]">{(f.byteCount / 1024).toFixed(1)}K</td>
                    <td className="px-4 py-2 text-center font-mono text-[10px]" style={{ color: f.synCount > 20 ? "#f43f5e" : "#64748b" }}>{f.synCount}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                        f.state === "established" ? "bg-emerald-500/20 text-emerald-400" :
                        f.state === "reset" ? "bg-rose-500/20 text-rose-400" :
                        f.state === "closed" ? "bg-slate-700 text-slate-400" : "bg-amber-500/20 text-amber-400")}>
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

      {/* DNS Records */}
      {subTab === "dns" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">DNS Query Log</h4>
            <p className="text-[10px] text-slate-500 mt-0.5">High-entropy queries may indicate DNS tunneling or data exfiltration.</p>
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
              <tbody className="text-xs">
                {dnsRecords.length === 0 ? (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-600 italic">No DNS queries yet — waiting for live traffic.</td></tr>
                ) : dnsRecords.map((d, i) => (
                  <tr key={i} className={cn("border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors",
                    d.suspicious && "bg-amber-500/5")}>
                    <td className="px-5 py-2 font-mono text-[10px] text-slate-300 max-w-[280px] truncate" title={d.query}>{d.query}</td>
                    <td className="px-5 py-2 text-center">
                      <span className="px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded text-[9px] font-mono">{d.type}</span>
                    </td>
                    <td className="px-5 py-2 font-mono text-amber-400 text-[10px]">{d.srcIp}</td>
                    <td className="px-5 py-2 text-center">
                      {d.suspicious
                        ? <span className="flex items-center justify-center gap-1 text-amber-400 text-[9px] font-bold">
                            <AlertTriangle className="w-3 h-3" /> {d.reason?.split("—")[0] ?? "Suspicious"}
                          </span>
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
    </motion.div>
  );
}
