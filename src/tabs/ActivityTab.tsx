/**
 * SALAMANDA WIDS — Network Activity Tab
 * Displays all websites and applications observed per device on the network,
 * detected via HTTP Host headers, TLS SNI, DNS queries, and port classification.
 */

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Globe, Wifi, RefreshCcw, Search, ChevronDown, ChevronRight,
  Monitor, Shield, ShieldAlert, Clock, Database, Activity,
  ExternalLink, Filter
} from "lucide-react";

// ── Types ─────────────────────────────────────────────────────────────────────
interface AppConnection {
  srcIp: string;
  dstIp: string;
  dstPort: number;
  hostname: string;
  protocol: string;
  appName: string;
  appCategory: string;
  firstSeen: number;
  lastSeen: number;
  byteCount: number;
  requestCount: number;
  detectionMethod: "sni" | "http-host" | "dns" | "port" | "rdns";
}

interface DeviceActivity {
  ip: string;
  mac?: string;
  hostname?: string;
  status?: "trusted" | "unknown" | "blocked";
  connections: AppConnection[];
}

// ── Category colour map ───────────────────────────────────────────────────────
const CATEGORY_COLORS: Record<string, string> = {
  "Social Media":        "bg-pink-500/20 text-pink-400 border-pink-500/30",
  "Messaging":           "bg-purple-500/20 text-purple-400 border-purple-500/30",
  "Streaming":           "bg-red-500/20 text-red-400 border-red-500/30",
  "Web Browsing":        "bg-blue-500/20 text-blue-400 border-blue-500/30",
  "Email":               "bg-cyan-500/20 text-cyan-400 border-cyan-500/30",
  "Cloud Storage":       "bg-sky-500/20 text-sky-400 border-sky-500/30",
  "Video Call":          "bg-teal-500/20 text-teal-400 border-teal-500/30",
  "Gaming":              "bg-green-500/20 text-green-400 border-green-500/30",
  "Development":         "bg-amber-500/20 text-amber-400 border-amber-500/30",
  "Search/Productivity": "bg-orange-500/20 text-orange-400 border-orange-500/30",
  "Finance":             "bg-emerald-500/20 text-emerald-400 border-emerald-500/30",
  "VPN":                 "bg-violet-500/20 text-violet-400 border-violet-500/30",
  "Anonymizer":          "bg-rose-500/20 text-rose-400 border-rose-500/30",
  "Suspicious":          "bg-rose-600/30 text-rose-300 border-rose-500/50",
  "Network":             "bg-slate-500/20 text-slate-400 border-slate-500/30",
  "Remote Access":       "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
  "File Transfer":       "bg-indigo-500/20 text-indigo-400 border-indigo-500/30",
  "Adult Content":       "bg-rose-700/40 text-rose-300 border-rose-600/60",
  "News":                "bg-blue-600/20 text-blue-300 border-blue-600/30",
  "Shopping":            "bg-lime-500/20 text-lime-400 border-lime-500/30",
  "Food & Delivery":     "bg-orange-600/20 text-orange-300 border-orange-600/30",
  "Transport":           "bg-yellow-600/20 text-yellow-300 border-yellow-600/30",
  // High-threat categories — bold red/orange
  "Dark Web":            "bg-red-900/50 text-red-300 border-red-700/70 font-bold",
  "Hacking Tool":        "bg-orange-900/50 text-orange-300 border-orange-700/70 font-bold",
  "Weapons":             "bg-red-800/50 text-red-200 border-red-600/70 font-bold",
  "Extremism":           "bg-red-900/60 text-red-200 border-red-700/80 font-bold",
  "Dark Market":         "bg-purple-900/50 text-purple-200 border-purple-700/70 font-bold",
  "Gambling":            "bg-yellow-700/30 text-yellow-300 border-yellow-600/50",
  "Other":               "bg-slate-600/20 text-slate-500 border-slate-600/30",
};

// Categories that are high-risk and should be visually flagged
const HIGH_THREAT_CATEGORIES = new Set([
  "Dark Web", "Hacking Tool", "Weapons", "Extremism", "Dark Market",
]);

function categoryBadge(cat: string) {
  const cls = CATEGORY_COLORS[cat] ?? CATEGORY_COLORS["Other"];
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${cls}`}>
      {cat}
    </span>
  );
}

function methodBadge(method: AppConnection["detectionMethod"]) {
  const map: Record<string, string> = {
    sni: "TLS SNI",
    "http-host": "HTTP",
    dns: "DNS",
    port: "Port",
    rdns: "rDNS",
  };
  const colors: Record<string, string> = {
    sni: "text-emerald-400",
    "http-host": "text-blue-400",
    dns: "text-amber-400",
    port: "text-slate-400",
    rdns: "text-purple-400",
  };
  return (
    <span className={`text-[9px] font-mono ${colors[method] ?? "text-slate-400"}`}>
      {map[method] ?? method}
    </span>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1_048_576) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1_048_576).toFixed(1)}MB`;
}

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  return `${Math.floor(s / 3600)}h ago`;
}

function statusColor(status?: string) {
  if (status === "trusted") return "text-emerald-400";
  if (status === "blocked") return "text-rose-400";
  return "text-amber-400";
}

// ── Main component ────────────────────────────────────────────────────────────
export function ActivityTab() {
  const [data, setData] = useState<Record<string, DeviceActivity>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/activity");
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      setData(json);
      setLastRefresh(new Date());
      setError(null);
      // Auto-expand devices with connections
      setExpanded(new Set(Object.keys(json)));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 10_000); // refresh every 10s
    return () => clearInterval(interval);
  }, [fetchData]);

  // ── Derived data ────────────────────────────────────────────────────────
  const allCategories = ["all", ...Array.from(
    new Set(Object.values(data).flatMap((d) => d.connections.map((c) => c.appCategory)))
  ).sort()];

  const filteredDevices = Object.values(data).filter((device) => {
    if (!device.connections.length) return false;
    const searchLower = search.toLowerCase();
    const matchesSearch = !search ||
      device.ip.includes(searchLower) ||
      (device.hostname ?? "").toLowerCase().includes(searchLower) ||
      (device.mac ?? "").toLowerCase().includes(searchLower) ||
      device.connections.some(
        (c) => c.hostname.toLowerCase().includes(searchLower) ||
               c.appName.toLowerCase().includes(searchLower)
      );
    const matchesCategory = categoryFilter === "all" ||
      device.connections.some((c) => c.appCategory === categoryFilter);
    return matchesSearch && matchesCategory;
  }).sort((a, b) => {
    // Sort by most recent activity
    const aLast = Math.max(...a.connections.map((c) => c.lastSeen), 0);
    const bLast = Math.max(...b.connections.map((c) => c.lastSeen), 0);
    return bLast - aLast;
  });

  const totalConnections = Object.values(data).reduce((s, d) => s + d.connections.length, 0);
  const suspiciousCount = Object.values(data).reduce(
    (s, d) => s + d.connections.filter((c) => c.appCategory === "Suspicious" || c.appCategory === "Anonymizer").length, 0
  );
  const threatCount = Object.values(data).reduce(
    (s, d) => s + d.connections.filter((c) => HIGH_THREAT_CATEGORIES.has(c.appCategory)).length, 0
  );
  const adultCount = Object.values(data).reduce(
    (s, d) => s + d.connections.filter((c) => c.appCategory === "Adult Content").length, 0
  );

  const toggleExpand = (ip: string) =>
    setExpanded((prev) => { const next = new Set(prev); next.has(ip) ? next.delete(ip) : next.add(ip); return next; });

  // ── Loading ─────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <RefreshCcw className="w-6 h-6 animate-spin" />
          <span className="text-xs font-mono uppercase tracking-widest">Loading activity…</span>
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col h-full gap-4 overflow-hidden"
    >
      {/* ── Header ── */}
      <div className="flex flex-wrap items-center justify-between gap-3 shrink-0">
        <div>
          <h2 className="text-lg font-bold text-white uppercase tracking-wider">Network Activity</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Websites and applications observed on the network via live packet inspection
          </p>
        </div>
        <button
          onClick={fetchData}
          className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg text-xs text-slate-300 transition-colors"
        >
          <RefreshCcw className="w-3.5 h-3.5" />
          Refresh
        </button>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 shrink-0">
        {[
          { label: "Active Devices", value: filteredDevices.length, icon: Monitor, color: "text-blue-400" },
          { label: "Total Connections", value: totalConnections, icon: Globe, color: "text-emerald-400" },
          { label: "High Threats", value: threatCount, icon: ShieldAlert, color: threatCount > 0 ? "text-red-400" : "text-slate-500" },
          { label: "Adult Content", value: adultCount, icon: Shield, color: adultCount > 0 ? "text-rose-400" : "text-slate-500" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center gap-3">
            <Icon className={`w-5 h-5 ${color} shrink-0`} />
            <div>
              <div className={`text-lg font-bold font-mono ${color}`}>{value}</div>
              <div className="text-[10px] text-slate-500 uppercase tracking-wider">{label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Filters ── */}
      <div className="flex flex-wrap gap-2 shrink-0">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
          <input
            type="text"
            placeholder="Search IP, hostname, app…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-300 placeholder-slate-600 focus:outline-none focus:border-amber-500/50"
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5 text-slate-500" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-slate-900 border border-slate-700 rounded-lg text-xs text-slate-300 px-2 py-1.5 focus:outline-none focus:border-amber-500/50"
          >
            {allCategories.map((cat) => (
              <option key={cat} value={cat}>{cat === "all" ? "All Categories" : cat}</option>
            ))}
          </select>
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3 text-xs text-rose-400">
          Failed to load activity data: {error}
        </div>
      )}

      {/* ── No data ── */}
      {!error && filteredDevices.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-slate-600">
            <Activity className="w-12 h-12" />
            <p className="text-sm">No activity detected yet.</p>
            <p className="text-xs">Activity populates as devices browse the web or use apps.</p>
          </div>
        </div>
      )}

      {/* ── Device list ── */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 custom-scrollbar">
        <AnimatePresence initial={false}>
          {filteredDevices.map((device) => {
            const isOpen = expanded.has(device.ip);
            const filteredConns = device.connections.filter(
              (c) => categoryFilter === "all" || c.appCategory === categoryFilter
            ).filter(
              (c) => !search ||
                c.hostname.toLowerCase().includes(search.toLowerCase()) ||
                c.appName.toLowerCase().includes(search.toLowerCase())
            );
            const lastActive = Math.max(...device.connections.map((c) => c.lastSeen), 0);

            return (
              <motion.div
                key={device.ip}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden"
              >
                {/* Device header */}
                <button
                  onClick={() => toggleExpand(device.ip)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-800/50 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <Monitor className={`w-4 h-4 ${statusColor(device.status)}`} />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-mono font-bold text-white">{device.ip}</span>
                        {device.hostname && (
                          <span className="text-xs text-slate-400">({device.hostname})</span>
                        )}
                        {device.status && (
                          <span className={`text-[9px] font-bold uppercase ${statusColor(device.status)}`}>
                            {device.status}
                          </span>
                        )}
                      </div>
                      {device.mac && (
                        <div className="text-[10px] text-slate-600 font-mono">{device.mac}</div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right hidden sm:block">
                      <div className="text-xs text-slate-400">{filteredConns.length} connection{filteredConns.length !== 1 ? "s" : ""}</div>
                      <div className="text-[10px] text-slate-600">{lastActive ? timeAgo(lastActive) : ""}</div>
                    </div>
                    {isOpen ? <ChevronDown className="w-4 h-4 text-slate-500" /> : <ChevronRight className="w-4 h-4 text-slate-500" />}
                  </div>
                </button>

                {/* Connection list */}
                <AnimatePresence initial={false}>
                  {isOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden border-t border-slate-800"
                    >
                      {filteredConns.length === 0 ? (
                        <div className="px-4 py-3 text-xs text-slate-600">No connections match the current filter.</div>
                      ) : (
                        <div className="divide-y divide-slate-800/60">
                          {filteredConns.map((conn, i) => (
                            <div key={i} className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                              HIGH_THREAT_CATEGORIES.has(conn.appCategory)
                                ? "bg-red-950/30 hover:bg-red-950/50 border-l-2 border-red-600"
                                : conn.appCategory === "Adult Content"
                                ? "bg-rose-950/20 hover:bg-rose-950/40 border-l-2 border-rose-700"
                                : "hover:bg-slate-800/30"
                            }`}>
                              {/* App icon / threat indicator */}
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                                HIGH_THREAT_CATEGORIES.has(conn.appCategory) ? "bg-red-900/50" :
                                conn.appCategory === "Adult Content" ? "bg-rose-900/30" : "bg-slate-800"
                              }`}>
                                {HIGH_THREAT_CATEGORIES.has(conn.appCategory)
                                  ? <ShieldAlert className="w-3.5 h-3.5 text-red-400" />
                                  : conn.appCategory === "Adult Content"
                                  ? <ShieldAlert className="w-3.5 h-3.5 text-rose-400" />
                                  : <Globe className="w-3.5 h-3.5 text-slate-500" />
                                }
                              </div>

                              {/* Main info */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium text-white truncate max-w-[200px]">
                                    {conn.appName !== conn.hostname ? conn.appName : conn.hostname}
                                  </span>
                                  {conn.appName !== conn.hostname && (
                                    <span className="text-xs text-slate-500 font-mono truncate max-w-[180px]">{conn.hostname}</span>
                                  )}
                                  {categoryBadge(conn.appCategory)}
                                </div>
                                <div className="flex items-center gap-3 mt-0.5">
                                  <span className="text-[10px] text-slate-500 font-mono">{conn.protocol}:{conn.dstPort}</span>
                                  {methodBadge(conn.detectionMethod)}
                                  <span className="text-[10px] text-slate-600">{timeAgo(conn.lastSeen)}</span>
                                </div>
                              </div>

                              {/* Stats */}
                              <div className="text-right shrink-0 hidden sm:block">
                                <div className="text-xs text-slate-400 font-mono">{formatBytes(conn.byteCount)}</div>
                                <div className="text-[10px] text-slate-600">{conn.requestCount} req</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* ── Footer legend ── */}
      <div className="shrink-0 flex items-center gap-4 pt-2 border-t border-slate-800 text-[10px] text-slate-600">
        <span className="flex items-center gap-1"><span className="text-emerald-400 font-mono">TLS SNI</span> — from HTTPS handshake</span>
        <span className="flex items-center gap-1"><span className="text-blue-400 font-mono">HTTP</span> — from Host header</span>
        <span className="flex items-center gap-1"><span className="text-amber-400 font-mono">DNS</span> — from DNS query</span>
        <span className="flex items-center gap-1"><span className="text-slate-400 font-mono">Port</span> — port-based guess</span>
      </div>
    </motion.div>
  );
}
