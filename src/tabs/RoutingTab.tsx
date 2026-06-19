import { useCallback, useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowRightLeft, RefreshCw } from "lucide-react";
import { cn } from "../lib/utils";

interface Route { dest: string; gateway: string; iface: string; flags?: string }

export function RoutingTab() {
  const [routes, setRoutes] = useState<Route[]>([]);
  const [raw, setRaw] = useState("");
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"table" | "raw">("table");

  const fetchRoutes = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/routing/table").then(r => r.json());
      setRoutes(res.routes ?? []);
      setRaw(res.raw ?? "");
    } catch { }
    setLoading(false);
  }, []);

  useEffect(() => { fetchRoutes(); }, [fetchRoutes]);

  return (
    <motion.div key="routing-view" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
      className="flex flex-col gap-4 h-full overflow-y-auto custom-scrollbar">

      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <ArrowRightLeft className="w-4 h-4 text-amber-400" /> Routing Table
            </h3>
            <p className="text-[10px] text-slate-500 mt-1">
              Active kernel routing table — {routes.length} routes · Read from system
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setView(v => v === "table" ? "raw" : "table")}
              className="px-3 py-1.5 rounded text-[10px] font-bold uppercase bg-slate-800 text-slate-400 hover:text-slate-200 border border-slate-700 transition-colors">
              {view === "table" ? "Raw" : "Table"}
            </button>
            <button onClick={fetchRoutes} disabled={loading} className="p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-slate-400 hover:text-white transition-colors">
              <RefreshCw className={cn("w-3.5 h-3.5", loading && "animate-spin")} />
            </button>
          </div>
        </div>
      </div>

      {view === "raw" ? (
        <div className="bg-slate-950 border border-slate-800 rounded-xl p-4">
          <pre className="text-[11px] font-mono text-amber-300 whitespace-pre-wrap leading-relaxed overflow-x-auto">{raw || "No data."}</pre>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[600px]">
              <thead className="text-[10px] text-slate-600 uppercase border-b border-slate-800 bg-slate-950/30">
                <tr>
                  <th className="px-5 py-3">Destination</th>
                  <th className="px-5 py-3">Gateway</th>
                  <th className="px-5 py-3">Flags</th>
                  <th className="px-5 py-3">Interface</th>
                  <th className="px-5 py-3 text-center">Type</th>
                </tr>
              </thead>
              <tbody className="text-xs">
                {routes.length === 0 ? (
                  <tr><td colSpan={5} className="px-5 py-8 text-center text-slate-600 italic">No routes available.</td></tr>
                ) : routes.map((r, i) => {
                  const isDefault = r.dest === "default" || r.dest === "0.0.0.0" || r.dest === "0.0.0.0/0";
                  const isHost = r.flags?.includes("H");
                  return (
                    <tr key={i} className={cn("border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors", isDefault && "bg-amber-500/5")}>
                      <td className="px-5 py-3 font-mono">
                        <span className={cn("font-bold", isDefault ? "text-amber-400" : "text-slate-200")}>{r.dest}</span>
                        {isDefault && <span className="ml-2 text-[9px] text-amber-600 font-bold uppercase">default</span>}
                      </td>
                      <td className="px-5 py-3 font-mono text-slate-300">{r.gateway}</td>
                      <td className="px-5 py-3 font-mono text-slate-500 text-[10px]">{r.flags ?? "—"}</td>
                      <td className="px-5 py-3 font-mono text-emerald-400 text-[10px]">{r.iface}</td>
                      <td className="px-5 py-3 text-center">
                        <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                          isDefault ? "bg-amber-500/20 text-amber-400" :
                          isHost ? "bg-violet-500/20 text-violet-400" :
                          "bg-slate-700 text-slate-400")}>
                          {isDefault ? "Gateway" : isHost ? "Host" : "Network"}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Info panels */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 shrink-0">
        {[
          { label: "Default Routes", value: routes.filter(r => r.dest === "default" || r.dest === "0.0.0.0/0").length, color: "text-amber-400" },
          { label: "Host Routes", value: routes.filter(r => r.flags?.includes("H")).length, color: "text-violet-400" },
          { label: "Network Routes", value: routes.filter(r => !r.flags?.includes("H") && r.dest !== "default").length, color: "text-emerald-400" },
        ].map(s => (
          <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4 text-center">
            <div className={cn("text-3xl font-bold font-mono", s.color)}>{s.value}</div>
            <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mt-1">{s.label}</div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}
