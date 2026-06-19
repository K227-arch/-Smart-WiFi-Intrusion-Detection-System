import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import { Activity, AlertTriangle, CheckCircle2, Loader2, Radio, RefreshCw, Search, Terminal, Wifi, XCircle, Zap } from "lucide-react";
import { cn } from "../lib/utils";

type SubTab = "ping" | "traceroute" | "ipscan" | "netwatch" | "bandwidth";

interface NetwatchEntry { host: string; interval: number; lastUp?: number; lastDown?: number; up: boolean }

export function ToolsTab() {
  const [sub, setSub] = useState<SubTab>("ping");

  // Ping
  const [pingHost, setPingHost] = useState("");
  const [pingCount, setPingCount] = useState(4);
  const [pingOutput, setPingOutput] = useState<string | null>(null);
  const [pingLoading, setPingLoading] = useState(false);

  // Traceroute
  const [traceHost, setTraceHost] = useState("");
  const [traceOutput, setTraceOutput] = useState<string | null>(null);
  const [traceLoading, setTraceLoading] = useState(false);

  // IP Scan
  const [scanRange, setScanRange] = useState("192.168.1.0/24");
  const [scanResults, setScanResults] = useState<any[]>([]);
  const [scanLoading, setScanLoading] = useState(false);

  // Netwatch
  const [netwatchHosts, setNetwatchHosts] = useState("8.8.8.8\n1.1.1.1");
  const [netwatchResults, setNetwatchResults] = useState<any[]>([]);
  const [netwatchRunning, setNetwatchRunning] = useState(false);
  const netwatchInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  // Bandwidth
  const [bwData, setBwData] = useState<any>(null);

  const runPing = useCallback(async () => {
    if (!pingHost.trim()) return;
    setPingLoading(true); setPingOutput(null);
    try {
      const res = await fetch("/api/tools/ping", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ host: pingHost.trim(), count: pingCount }) });
      const data = await res.json();
      setPingOutput(data.output);
    } catch (e: any) { setPingOutput(e.message); }
    setPingLoading(false);
  }, [pingHost, pingCount]);

  const runTrace = useCallback(async () => {
    if (!traceHost.trim()) return;
    setTraceLoading(true); setTraceOutput(null);
    try {
      const res = await fetch("/api/tools/traceroute", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ host: traceHost.trim() }) });
      const data = await res.json();
      setTraceOutput(data.output);
    } catch (e: any) { setTraceOutput(e.message); }
    setTraceLoading(false);
  }, [traceHost]);

  const runScan = useCallback(async () => {
    setScanLoading(true); setScanResults([]);
    try {
      const res = await fetch("/api/tools/ipscan", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ range: scanRange }) });
      const data = await res.json();
      setScanResults(data.results ?? []);
    } catch { }
    setScanLoading(false);
  }, [scanRange]);

  const runNetwatch = useCallback(async () => {
    const hosts = netwatchHosts.split("\n").map(h => h.trim()).filter(Boolean);
    if (!hosts.length) return;
    try {
      const res = await fetch("/api/tools/netwatch", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ hosts }) });
      const data = await res.json();
      setNetwatchResults(data.results ?? []);
    } catch { }
  }, [netwatchHosts]);

  const toggleNetwatch = useCallback(() => {
    if (netwatchRunning) {
      if (netwatchInterval.current) clearInterval(netwatchInterval.current);
      setNetwatchRunning(false);
    } else {
      runNetwatch();
      netwatchInterval.current = setInterval(runNetwatch, 10000);
      setNetwatchRunning(true);
    }
  }, [netwatchRunning, runNetwatch]);

  useEffect(() => () => { if (netwatchInterval.current) clearInterval(netwatchInterval.current); }, []);

  useEffect(() => {
    if (sub === "bandwidth") {
      const fetchBw = () => fetch("/api/tools/bandwidth").then(r => r.json()).then(setBwData).catch(() => {});
      fetchBw();
      const t = setInterval(fetchBw, 5000);
      return () => clearInterval(t);
    }
  }, [sub]);

  const TABS: { id: SubTab; label: string; icon: React.ReactNode }[] = [
    { id: "ping", label: "Ping", icon: <Radio className="w-3.5 h-3.5" /> },
    { id: "traceroute", label: "Traceroute", icon: <Activity className="w-3.5 h-3.5" /> },
    { id: "ipscan", label: "IP Scan", icon: <Search className="w-3.5 h-3.5" /> },
    { id: "netwatch", label: "Netwatch", icon: <Wifi className="w-3.5 h-3.5" /> },
    { id: "bandwidth", label: "Bandwidth", icon: <Zap className="w-3.5 h-3.5" /> },
  ];

  return (
    <motion.div key="tools-view" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
      className="flex flex-col gap-4 h-full overflow-y-auto custom-scrollbar">

      {/* Sub-tab bar */}
      <div className="flex flex-wrap items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1.5 shrink-0">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setSub(t.id)}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all",
              sub === t.id ? "bg-amber-600 text-white" : "text-slate-400 hover:text-slate-200")}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Ping */}
      {sub === "ping" && (
        <div className="flex flex-col gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <Radio className="w-4 h-4 text-amber-400" /> Ping
            </h4>
            <div className="flex gap-3 flex-wrap">
              <input value={pingHost} onChange={e => setPingHost(e.target.value)}
                onKeyDown={e => e.key === "Enter" && runPing()}
                placeholder="Host or IP (e.g. 8.8.8.8)"
                className="flex-1 min-w-[200px] bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors" />
              <input type="number" value={pingCount} onChange={e => setPingCount(Number(e.target.value))} min={1} max={20}
                className="w-20 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-slate-200 focus:outline-none focus:border-amber-500 transition-colors" />
              <button onClick={runPing} disabled={pingLoading || !pingHost.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold text-sm rounded-lg transition-colors">
                {pingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radio className="w-4 h-4" />}
                {pingLoading ? "Running…" : "Ping"}
              </button>
            </div>
          </div>
          {pingOutput && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
              <pre className="text-[11px] font-mono text-emerald-400 whitespace-pre-wrap leading-relaxed overflow-x-auto">{pingOutput}</pre>
            </div>
          )}
        </div>
      )}

      {/* Traceroute */}
      {sub === "traceroute" && (
        <div className="flex flex-col gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <Activity className="w-4 h-4 text-amber-400" /> Traceroute
            </h4>
            <div className="flex gap-3 flex-wrap">
              <input value={traceHost} onChange={e => setTraceHost(e.target.value)}
                onKeyDown={e => e.key === "Enter" && runTrace()}
                placeholder="Host or IP (e.g. google.com)"
                className="flex-1 min-w-[200px] bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors" />
              <button onClick={runTrace} disabled={traceLoading || !traceHost.trim()}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold text-sm rounded-lg transition-colors">
                {traceLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4" />}
                {traceLoading ? "Tracing…" : "Trace"}
              </button>
            </div>
          </div>
          {traceOutput && (
            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
              <pre className="text-[11px] font-mono text-amber-300 whitespace-pre-wrap leading-relaxed overflow-x-auto">{traceOutput}</pre>
            </div>
          )}
        </div>
      )}

      {/* IP Scan */}
      {sub === "ipscan" && (
        <div className="flex flex-col gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <Search className="w-4 h-4 text-amber-400" /> IP Scan
            </h4>
            <p className="text-[10px] text-slate-500 mb-4">Discovers live hosts using ARP table and device registry. Results are from real captured traffic.</p>
            <div className="flex gap-3 flex-wrap">
              <input value={scanRange} onChange={e => setScanRange(e.target.value)}
                placeholder="e.g. 192.168.1.0/24"
                className="flex-1 min-w-[200px] bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors" />
              <button onClick={runScan} disabled={scanLoading}
                className="flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-bold text-sm rounded-lg transition-colors">
                {scanLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                {scanLoading ? "Scanning…" : "Scan"}
              </button>
            </div>
          </div>
          {scanResults.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-800">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">{scanResults.length} hosts discovered</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[400px]">
                  <thead className="text-[10px] text-slate-600 uppercase border-b border-slate-800 bg-slate-950/30">
                    <tr>
                      <th className="px-5 py-3">IP Address</th>
                      <th className="px-5 py-3">MAC Address</th>
                      <th className="px-5 py-3">Hostname</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs">
                    {scanResults.map((r, i) => (
                      <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                        <td className="px-5 py-3 font-mono text-amber-400">{r.ip}</td>
                        <td className="px-5 py-3 font-mono text-slate-300 text-[10px]">{r.mac}</td>
                        <td className="px-5 py-3 text-slate-400">{r.hostname || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Netwatch */}
      {sub === "netwatch" && (
        <div className="flex flex-col gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2">
              <Wifi className="w-4 h-4 text-amber-400" /> Netwatch
              <span className="text-[9px] text-slate-500 font-normal normal-case">Polls every 10s</span>
            </h4>
            <div className="flex gap-3 flex-wrap items-start">
              <textarea value={netwatchHosts} onChange={e => setNetwatchHosts(e.target.value)}
                placeholder="One host per line&#10;8.8.8.8&#10;192.168.1.1"
                rows={4}
                className="flex-1 min-w-[200px] bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 transition-colors resize-none" />
              <button onClick={toggleNetwatch}
                className={cn("flex items-center gap-2 px-4 py-2 font-bold text-sm rounded-lg transition-colors",
                  netwatchRunning ? "bg-rose-600 hover:bg-rose-500 text-white" : "bg-emerald-600 hover:bg-emerald-500 text-white")}>
                {netwatchRunning ? <><XCircle className="w-4 h-4" /> Stop</> : <><Wifi className="w-4 h-4" /> Start</>}
              </button>
            </div>
          </div>
          {netwatchResults.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {netwatchResults.map((r, i) => (
                <div key={i} className={cn("flex items-center gap-4 p-4 rounded-xl border",
                  r.up ? "border-emerald-500/30 bg-emerald-500/5" : "border-rose-500/30 bg-rose-500/5")}>
                  {r.up
                    ? <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                    : <XCircle className="w-5 h-5 text-rose-500 shrink-0" />}
                  <div>
                    <div className="font-mono font-bold text-sm text-white">{r.host}</div>
                    <div className={cn("text-[10px] font-bold uppercase", r.up ? "text-emerald-400" : "text-rose-400")}>
                      {r.up ? `UP — ${r.rtt}ms` : "DOWN"}
                    </div>
                  </div>
                  {netwatchRunning && <RefreshCw className="w-3 h-3 text-slate-600 animate-spin ml-auto" />}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bandwidth */}
      {sub === "bandwidth" && (
        <div className="flex flex-col gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-5 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" /> Bandwidth Monitor
              <span className="text-[9px] text-slate-500 font-normal normal-case ml-1">Live from capture engine · updates every 5s</span>
            </h4>
            {bwData ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {[
                  { label: "Packets / sec", value: bwData.packetsPerSec ?? 0, color: "text-amber-400" },
                  { label: "Traffic Buckets", value: (bwData.buckets ?? []).length, color: "text-emerald-400" },
                  { label: "Capture Mode", value: "Live", color: "text-emerald-400" },
                ].map(s => (
                  <div key={s.label} className="bg-slate-950 border border-slate-800 rounded-xl p-4 text-center">
                    <div className={cn("text-3xl font-bold font-mono", s.color)}>{s.value}</div>
                    <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-1">{s.label}</div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-2 text-slate-500 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" /> Loading bandwidth data…
              </div>
            )}
          </div>
          {bwData?.buckets?.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-800">
                <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Traffic Buckets (30s each)</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left min-w-[500px]">
                  <thead className="text-[10px] text-slate-600 uppercase border-b border-slate-800 bg-slate-950/30">
                    <tr>
                      <th className="px-5 py-3">Time</th>
                      <th className="px-5 py-3 text-center">Data</th>
                      <th className="px-5 py-3 text-center">Beacons</th>
                      <th className="px-5 py-3 text-center">Mgmt</th>
                      <th className="px-5 py-3 text-center text-rose-400">Deauth</th>
                    </tr>
                  </thead>
                  <tbody className="text-xs">
                    {bwData.buckets.slice(-10).reverse().map((b: any, i: number) => (
                      <tr key={i} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                        <td className="px-5 py-2 font-mono text-slate-400">{b.time}</td>
                        <td className="px-5 py-2 text-center font-mono text-amber-400">{b.data}</td>
                        <td className="px-5 py-2 text-center font-mono text-emerald-400">{b.beacons}</td>
                        <td className="px-5 py-2 text-center font-mono text-slate-400">{b.mgmt}</td>
                        <td className="px-5 py-2 text-center font-mono text-rose-400">{b.deauth}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}
