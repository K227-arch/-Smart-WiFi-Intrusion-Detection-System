import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { format } from "date-fns";
import { Globe, Network, RefreshCw, Route, Server, Shield, Wifi } from "lucide-react";
import { cn } from "../lib/utils";

interface Address { iface: string; family: string; address: string; netmask: string; mac: string; internal: boolean }
interface Route { dest: string; gateway: string; iface: string; flags?: string }
interface DhcpLease { mac: string; ip: string; hostname: string; firstSeen: number; lastSeen: number; status: string }
interface DnsInfo { servers: string[]; recentQueries: any[] }
interface FirewallFlow { key: string; srcIp: string; dstIp: string; srcPort: number; dstPort: number; protocol: string; packetCount: number; byteCount: number; state: string; lastSeen: number; synCount: number }

type SubTab = "addresses" | "dhcp" | "routes" | "dns" | "firewall";

export function IPTab() {
  const [sub, setSub] = useState<SubTab>("addresses");
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [routes, setRoutes] = useState<Route[]>([]);
  const [dhcp, setDhcp] = useState<DhcpLease[]>([]);
  const [dns, setDns] = useState<DnsInfo | null>(null);
  const [firewall, setFirewall] = useState<FirewallFlow[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [aRes, rRes, dRes, dnsRes, fwRes] = await Promise.all([
        fetch("/api/ip/addresses").then(r => r.json()),
        fetch("/api/ip/routes").then(r => r.json()),
        fetch("/api/ip/dhcp").then(r => r.json()),
        fetch("/api/ip/dns").then(r => r.json()),
        fetch("/api/ip/firewall").then(r => r.json()),
      ]);
      setAddresses(aRes);
      setRoutes(rRes.routes ?? []);
      setDhcp(dRes);
      setDns(dnsRes);
      setFirewall(fwRes);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const TABS: { id: SubTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { id: "addresses", label: "Addresses", icon: <Wifi className="w-3.5 h-3.5" />, count: addresses.filter(a => !a.internal).length },
    { id: "dhcp", label: "DHCP Leases", icon: <Server className="w-3.5 h-3.5" />, count: dhcp.length },
    { id: "routes", label: "Routes", icon: <Route className="w-3.5 h-3.5" />, count: routes.length },
    { id: "dns", label: "DNS", icon: <Globe className="w-3.5 h-3.5" /> },
    { id: "firewall", label: "Connections", icon: <Shield className="w-3.5 h-3.5" />, count: firewall.length },
  ];

  return (
    <motion.div key="ip-view" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
      className="flex flex-col gap-4 h-full overflow-y-auto custom-scrollbar">

      {/* Sub-tab bar */}
      <div className="flex flex-wrap items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1.5 shrink-0">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setSub(t.id)}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all whitespace-nowrap",
              sub === t.id ? "bg-amber-600 text-white" : "text-slate-400 hover:text-slate-200")}>
            {t.icon}
            {t.label}
            {t.count !== undefined && <span className="ml-1 text-[9px] opacity-70">({t.count})</span>}
          </button>
        ))}
        <button onClick={fetchAll} disabled={loading} className="ml-auto p-1.5 text-slate-500 hover:text-amber-400 transition-colors">
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
        </button>
      </div>

      {/* Addresses */}
      {sub === "addresses" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Network className="w-4 h-4 text-amber-400" /> Interface Addresses
            </h4>
            <p className="text-[10px] text-slate-500 mt-0.5">All network interfaces and their IP bindings on this machine.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[700px]">
              <thead className="text-[10px] text-slate-600 uppercase border-b border-slate-800 bg-slate-950/30">
                <tr>
                  <th className="px-5 py-3">Interface</th>
                  <th className="px-5 py-3">Family</th>
                  <th className="px-5 py-3">IP Address</th>
                  <th className="px-5 py-3">Netmask</th>
                  <th className="px-5 py-3">MAC Address</th>
                  <th className="px-5 py-3 text-center">Type</th>
                </tr>
              </thead>
              <tbody className="text-xs">
                {addresses.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-600 italic">No interfaces found.</td></tr>
                ) : addresses.map((a, i) => (
                  <tr key={i} className={cn("border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors", a.internal && "opacity-40")}>
                    <td className="px-5 py-3 font-mono text-amber-400 font-bold">{a.iface}</td>
                    <td className="px-5 py-3">
                      <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                        a.family === "IPv4" ? "bg-amber-500/20 text-amber-400" : "bg-violet-500/20 text-violet-400")}>
                        {a.family}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-slate-200">{a.address}</td>
                    <td className="px-5 py-3 font-mono text-slate-500 text-[10px]">{a.netmask}</td>
                    <td className="px-5 py-3 font-mono text-slate-400 text-[10px]">{a.mac}</td>
                    <td className="px-5 py-3 text-center">
                      <span className={cn("text-[9px] font-bold uppercase", a.internal ? "text-slate-600" : "text-emerald-500")}>
                        {a.internal ? "Loopback" : "Active"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DHCP Leases */}
      {sub === "dhcp" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">DHCP Lease Table</h4>
            <p className="text-[10px] text-slate-500 mt-0.5">IP→MAC bindings discovered from live traffic and ARP. Reflects real device assignments.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[700px]">
              <thead className="text-[10px] text-slate-600 uppercase border-b border-slate-800 bg-slate-950/30">
                <tr>
                  <th className="px-5 py-3">IP Address</th>
                  <th className="px-5 py-3">MAC Address</th>
                  <th className="px-5 py-3">Hostname</th>
                  <th className="px-5 py-3 text-center">Status</th>
                  <th className="px-5 py-3">First Seen</th>
                  <th className="px-5 py-3">Last Active</th>
                </tr>
              </thead>
              <tbody className="text-xs">
                {dhcp.length === 0 ? (
                  <tr><td colSpan={6} className="px-5 py-8 text-center text-slate-600 italic">No leases discovered yet — waiting for live traffic.</td></tr>
                ) : dhcp.map((l, i) => (
                  <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                    <td className="px-5 py-3 font-mono text-amber-400 font-bold">{l.ip}</td>
                    <td className="px-5 py-3 font-mono text-slate-300 text-[10px]">{l.mac}</td>
                    <td className="px-5 py-3 text-slate-200">{l.hostname || "—"}</td>
                    <td className="px-5 py-3 text-center">
                      <span className={cn("px-2 py-0.5 rounded text-[9px] font-bold uppercase",
                        l.status === "trusted" ? "bg-emerald-500/20 text-emerald-400" :
                        l.status === "blocked" ? "bg-rose-500/20 text-rose-400" :
                        "bg-slate-700 text-slate-400")}>
                        {l.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 font-mono text-slate-500 text-[10px]">{format(l.firstSeen, "MMM dd HH:mm")}</td>
                    <td className="px-5 py-3 font-mono text-emerald-500 text-[10px]">{format(l.lastSeen, "HH:mm:ss")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Routes */}
      {sub === "routes" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Routing Table</h4>
            <p className="text-[10px] text-slate-500 mt-0.5">Active kernel routing table from this system.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[600px]">
              <thead className="text-[10px] text-slate-600 uppercase border-b border-slate-800 bg-slate-950/30">
                <tr>
                  <th className="px-5 py-3">Destination</th>
                  <th className="px-5 py-3">Gateway</th>
                  <th className="px-5 py-3">Flags</th>
                  <th className="px-5 py-3">Interface</th>
                </tr>
              </thead>
              <tbody className="text-xs">
                {routes.length === 0 ? (
                  <tr><td colSpan={4} className="px-5 py-8 text-center text-slate-600 italic">No routes parsed.</td></tr>
                ) : routes.map((r, i) => (
                  <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                    <td className="px-5 py-3 font-mono text-amber-400">{r.dest}</td>
                    <td className="px-5 py-3 font-mono text-slate-300">{r.gateway}</td>
                    <td className="px-5 py-3 font-mono text-slate-500 text-[10px]">{r.flags ?? "—"}</td>
                    <td className="px-5 py-3 font-mono text-emerald-400 text-[10px]">{r.iface}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* DNS */}
      {sub === "dns" && dns && (
        <div className="flex flex-col gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">DNS Resolvers</h4>
            <div className="flex flex-wrap gap-2">
              {dns.servers.length === 0
                ? <span className="text-slate-600 text-xs italic">No resolvers detected.</span>
                : dns.servers.map((s, i) => (
                  <span key={i} className="px-3 py-1 bg-slate-800 border border-slate-700 rounded-lg font-mono text-sm text-amber-400">{s}</span>
                ))}
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-5 py-3 border-b border-slate-800">
              <h4 className="text-sm font-bold text-white uppercase tracking-wider">Recent DNS Queries</h4>
              <p className="text-[10px] text-slate-500 mt-0.5">Captured from live network traffic via packet analysis.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left min-w-[500px]">
                <thead className="text-[10px] text-slate-600 uppercase border-b border-slate-800 bg-slate-950/30">
                  <tr>
                    <th className="px-5 py-3">Query</th>
                    <th className="px-5 py-3 text-center">Type</th>
                    <th className="px-5 py-3">Source</th>
                    <th className="px-5 py-3 text-center">Status</th>
                    <th className="px-5 py-3">Time</th>
                  </tr>
                </thead>
                <tbody className="text-xs">
                  {(dns.recentQueries ?? []).length === 0 ? (
                    <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-600 italic">No queries captured yet.</td></tr>
                  ) : dns.recentQueries.map((q: any, i: number) => (
                    <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                      <td className="px-5 py-2 font-mono text-[10px] text-slate-300 max-w-[280px] truncate">{q.query}</td>
                      <td className="px-5 py-2 text-center"><span className="px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded text-[9px] font-mono">{q.type}</span></td>
                      <td className="px-5 py-2 font-mono text-amber-400 text-[10px]">{q.srcIp}</td>
                      <td className="px-5 py-2 text-center">
                        <span className={cn("text-[9px] font-bold", q.suspicious ? "text-amber-400" : "text-emerald-500")}>
                          {q.suspicious ? "Suspicious" : "Normal"}
                        </span>
                      </td>
                      <td className="px-5 py-2 font-mono text-slate-500 text-[10px]">{format(q.timestamp, "HH:mm:ss")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Firewall / Connections */}
      {sub === "firewall" && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-slate-800">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">Active Connections</h4>
            <p className="text-[10px] text-slate-500 mt-0.5">Live TCP/UDP flows tracked by the packet capture engine. High SYN counts flag flood attacks.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[900px]">
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
                {firewall.length === 0 ? (
                  <tr><td colSpan={8} className="px-5 py-8 text-center text-slate-600 italic">No active connections — waiting for live traffic.</td></tr>
                ) : firewall.map((f: any) => (
                  <tr key={f.key} className={cn("border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors", f.synCount > 20 && "bg-rose-500/5")}>
                    <td className="px-4 py-2 font-mono text-amber-400 text-[10px]">{f.srcIp}:{f.srcPort}</td>
                    <td className="px-4 py-2 font-mono text-slate-300 text-[10px]">{f.dstIp}:{f.dstPort}</td>
                    <td className="px-4 py-2 text-center">
                      <span className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-amber-500/20 text-amber-400">{f.protocol}</span>
                    </td>
                    <td className="px-4 py-2 text-center font-mono text-slate-300 text-[10px]">{f.packetCount}</td>
                    <td className="px-4 py-2 text-center font-mono text-slate-400 text-[10px]">{(f.byteCount / 1024).toFixed(1)}K</td>
                    <td className="px-4 py-2 text-center font-mono text-[10px]" style={{ color: f.synCount > 20 ? "#f43f5e" : "#64748b" }}>{f.synCount}</td>
                    <td className="px-4 py-2 text-center">
                      <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                        f.state === "established" ? "bg-emerald-500/20 text-emerald-400" :
                        f.state === "reset" ? "bg-rose-500/20 text-rose-400" :
                        "bg-slate-700 text-slate-400")}>
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
    </motion.div>
  );
}
