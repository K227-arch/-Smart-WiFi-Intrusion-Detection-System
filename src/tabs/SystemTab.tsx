import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { Clock, Cpu, HardDrive, RefreshCw, Server } from "lucide-react";
import { cn } from "../lib/utils";
import { format } from "date-fns";

interface Resources {
  uptime: number; osUptime: number; platform: string; arch: string;
  nodeVersion: string; cpuModel: string; cpuCount: number;
  loadAvg1m: number; loadAvg5m: number; loadAvg15m: number;
  totalMemMB: number; usedMemMB: number; freeMemMB: number;
  memUsedPct: number; processMemMB: number;
}
interface ClockInfo { iso: string; unix: number; timezone: string; utcOffset: number; local: string }

type SubTab = "resources" | "clock";

function fmtUptime(s: number): string {
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${Math.floor(s % 60)}s`;
}

export function SystemTab() {
  const [sub, setSub] = useState<SubTab>("resources");
  const [resources, setResources] = useState<Resources | null>(null);
  const [clock, setClock] = useState<ClockInfo | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [rRes, cRes] = await Promise.all([
        fetch("/api/system/resources").then(r => r.json()),
        fetch("/api/system/clock").then(r => r.json()),
      ]);
      setResources(rRes);
      setClock(cRes);
    } catch { }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchAll();
    const t = setInterval(fetchAll, 10000);
    return () => clearInterval(t);
  }, [fetchAll]);

  const TABS = [
    { id: "resources" as SubTab, label: "Resources", icon: <Cpu className="w-3.5 h-3.5" /> },
    { id: "clock" as SubTab, label: "Clock / NTP", icon: <Clock className="w-3.5 h-3.5" /> },
  ];

  return (
    <motion.div key="system-view" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
      className="flex flex-col gap-4 h-full overflow-y-auto custom-scrollbar">

      {/* Sub-tab bar */}
      <div className="flex items-center gap-1 bg-slate-900 border border-slate-800 rounded-xl p-1.5 shrink-0">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setSub(t.id)}
            className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all",
              sub === t.id ? "bg-amber-600 text-white" : "text-slate-400 hover:text-slate-200")}>
            {t.icon} {t.label}
          </button>
        ))}
        <button onClick={fetchAll} disabled={loading} className="ml-auto p-1.5 text-slate-500 hover:text-amber-400 transition-colors">
          <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
        </button>
      </div>

      {/* Resources */}
      {sub === "resources" && resources && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {/* CPU */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Cpu className="w-3 h-3 text-amber-500" /> CPU
            </h4>
            <div className="space-y-3">
              {[
                { label: "Model", value: resources.cpuModel.split("@")[0].trim(), color: "text-slate-200" },
                { label: "Cores", value: String(resources.cpuCount), color: "text-amber-400" },
                { label: "Load avg (1m)", value: resources.loadAvg1m.toFixed(2), color: resources.loadAvg1m > resources.cpuCount * 0.8 ? "text-rose-400" : "text-emerald-400" },
                { label: "Load avg (5m)", value: resources.loadAvg5m.toFixed(2), color: "text-slate-300" },
                { label: "Load avg (15m)", value: resources.loadAvg15m.toFixed(2), color: "text-slate-300" },
                { label: "Architecture", value: resources.arch, color: "text-slate-400" },
              ].map(r => (
                <div key={r.label} className="flex justify-between items-center">
                  <span className="text-[11px] text-slate-500">{r.label}</span>
                  <span className={cn("text-[11px] font-mono font-bold truncate max-w-[180px] text-right", r.color)}>{r.value}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Memory */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <HardDrive className="w-3 h-3 text-violet-500" /> Memory
            </h4>
            <div className="space-y-3">
              {[
                { label: "Total RAM", value: `${resources.totalMemMB} MB`, color: "text-slate-200" },
                { label: "Used", value: `${resources.usedMemMB} MB`, color: resources.memUsedPct > 85 ? "text-rose-400" : "text-amber-400" },
                { label: "Free", value: `${resources.freeMemMB} MB`, color: "text-emerald-400" },
                { label: "Usage", value: `${resources.memUsedPct}%`, color: resources.memUsedPct > 85 ? "text-rose-400" : "text-slate-300" },
                { label: "SALAMANDA Process", value: `${resources.processMemMB} MB`, color: "text-violet-400" },
              ].map(r => (
                <div key={r.label} className="flex justify-between items-center">
                  <span className="text-[11px] text-slate-500">{r.label}</span>
                  <span className={cn("text-[11px] font-mono font-bold", r.color)}>{r.value}</span>
                </div>
              ))}
            </div>
            {/* Memory bar */}
            <div className="mt-4">
              <div className="w-full h-2 bg-slate-800 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${resources.memUsedPct}%` }}
                  transition={{ duration: 0.8 }}
                  className={cn("h-full rounded-full", resources.memUsedPct > 85 ? "bg-rose-500" : resources.memUsedPct > 65 ? "bg-amber-500" : "bg-emerald-500")}
                />
              </div>
              <p className="text-[9px] text-slate-600 mt-1 text-right">{resources.memUsedPct}% used</p>
            </div>
          </div>

          {/* System info */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 sm:col-span-2">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 flex items-center gap-2">
              <Server className="w-3 h-3 text-emerald-500" /> System
            </h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
              {[
                { label: "Platform", value: resources.platform },
                { label: "Node.js", value: resources.nodeVersion },
                { label: "App Uptime", value: fmtUptime(resources.uptime) },
                { label: "OS Uptime", value: fmtUptime(resources.osUptime) },
              ].map(r => (
                <div key={r.label}>
                  <div className="text-[9px] text-slate-600 uppercase font-bold tracking-widest mb-1">{r.label}</div>
                  <div className="text-sm font-mono font-bold text-amber-400">{r.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Clock */}
      {sub === "clock" && clock && (
        <div className="flex flex-col gap-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-center">
            <div className="text-5xl font-mono font-black text-amber-400 tracking-wider mb-2">
              {format(new Date(clock.iso), "HH:mm:ss")}
            </div>
            <div className="text-slate-300 text-lg font-semibold">
              {format(new Date(clock.iso), "EEEE, MMMM d, yyyy")}
            </div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4">Time Details</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Timezone", value: clock.timezone },
                { label: "UTC Offset", value: `${clock.utcOffset >= 0 ? "+" : ""}${clock.utcOffset} min` },
                { label: "Unix Timestamp", value: String(clock.unix) },
                { label: "ISO 8601", value: new Date(clock.iso).toISOString().slice(0, 19) + "Z" },
              ].map(r => (
                <div key={r.label} className="bg-slate-950 border border-slate-800 rounded-lg p-3">
                  <div className="text-[9px] text-slate-600 uppercase font-bold tracking-widest mb-1">{r.label}</div>
                  <div className="text-xs font-mono text-slate-200 break-all">{r.value}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}
