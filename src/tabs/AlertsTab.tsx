import { ChevronDown, ChevronRight, Download, ShieldCheck, Trash2, X } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { format } from "date-fns";
import { useState } from "react";
import { cn } from "../lib/utils";
import { ALERT_TYPE_META } from "../lib/alertMeta";
import type { Alert } from "../types";

interface AlertsTabProps {
  alerts: Alert[];
  onExport: () => void;
  onDismiss: (id: string) => void;
  onClearAll: () => void;
}

type TypeFilter = "ALL" | Alert["type"];
type SeverityFilter = "ALL" | Alert["severity"];

export function AlertsTab({ alerts, onExport, onDismiss, onClearAll }: AlertsTabProps) {
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("ALL");
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>("ALL");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const filtered = alerts.filter(
    (a) =>
      (typeFilter === "ALL" || a.type === typeFilter) &&
      (severityFilter === "ALL" || a.severity === severityFilter)
  );

  return (
    <motion.div
      key="alerts-view"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-full overflow-hidden"
    >
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-white uppercase tracking-wider">Forensic Logs</h2>
        <div className="flex flex-wrap gap-2 items-center">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as TypeFilter)}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-300 font-mono focus:outline-none focus:border-sky-500"
          >
            <option value="ALL">All Types</option>
            <option value="ROGUE_AP">Rogue AP</option>
            <option value="DEAUTH_ATTACK">Deauth Attack</option>
            <option value="MAC_SPOOFING">MAC Spoofing</option>
            <option value="UNAUTHORIZED_DEVICE">Unauthorized Device</option>
            <option value="CHANNEL_ANOMALY">Channel Anomaly</option>
            <option value="PORT_SCAN">Port Scan</option>
            <option value="BRUTE_FORCE">Brute Force</option>
            <option value="ANOMALY">ML Anomaly</option>
          </select>
          <select
            value={severityFilter}
            onChange={(e) => setSeverityFilter(e.target.value as SeverityFilter)}
            className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-[10px] text-slate-300 font-mono focus:outline-none focus:border-sky-500"
          >
            <option value="ALL">All Severity</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
          <button
            onClick={onExport}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 rounded text-[10px] font-bold text-sky-400 transition-colors"
          >
            <Download className="w-3 h-3" /> Export CSV
          </button>
          {alerts.length > 0 && (
            <button
              onClick={onClearAll}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded text-[10px] font-bold text-rose-400 transition-colors"
            >
              <Trash2 className="w-3 h-3" /> Clear All
            </button>
          )}
        </div>
      </div>

      {/* Stats bar */}
      <div className="px-6 py-2 border-b border-slate-800 bg-slate-950/30 flex gap-4 text-[10px] text-slate-500 font-mono shrink-0">
        <span>Total: <span className="text-white font-bold">{alerts.length}</span></span>
        <span>Filtered: <span className="text-sky-400 font-bold">{filtered.length}</span></span>
        <span>High: <span className="text-rose-400 font-bold">{alerts.filter((a) => a.severity === "high").length}</span></span>
        <span>Medium: <span className="text-amber-400 font-bold">{alerts.filter((a) => a.severity === "medium").length}</span></span>
        <span>Low: <span className="text-slate-400 font-bold">{alerts.filter((a) => a.severity === "low").length}</span></span>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar">
        <table className="w-full text-left min-w-[700px]">
          <thead className="text-[10px] text-slate-600 uppercase border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
            <tr>
              <th className="px-4 py-3 w-6" />
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Description</th>
              <th className="px-4 py-3 text-center">Severity</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3 text-center">Action</th>
            </tr>
          </thead>
          <tbody className="text-xs text-slate-400">
            <AnimatePresence initial={false}>
              {filtered.map((a) => {
                const meta = ALERT_TYPE_META[a.type];
                const isExpanded = expandedId === a.id;
                const hasDetails = a.details && Object.keys(a.details).length > 0;

                return (
                  <>
                    <motion.tr
                      key={a.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0, height: 0 }}
                      className={cn(
                        "border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors",
                        isExpanded && "bg-slate-800/30"
                      )}
                    >
                      {/* Expand toggle */}
                      <td className="px-4 py-3">
                        {hasDetails && (
                          <button
                            onClick={() => setExpandedId(isExpanded ? null : a.id)}
                            className="text-slate-600 hover:text-sky-400 transition-colors"
                          >
                            {isExpanded
                              ? <ChevronDown className="w-3.5 h-3.5" />
                              : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={cn("flex items-center gap-1.5 font-bold text-[11px]", meta.color)}>
                          {meta.icon} {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 max-w-[240px]">
                        <div className="text-[10px] text-slate-400 leading-relaxed">{a.description}</div>
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={cn(
                          "px-2 py-1 rounded text-[9px] font-bold uppercase",
                          a.severity === "high" ? "bg-rose-500/20 text-rose-500 border border-rose-500/30" :
                          a.severity === "medium" ? "bg-amber-500/20 text-amber-500 border border-amber-500/30" :
                          "bg-slate-700 text-slate-400 border border-slate-600"
                        )}>
                          {a.severity}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-[10px] text-sky-400 max-w-[130px] truncate" title={a.targetMac}>
                        {a.targetMac}
                      </td>
                      <td className="px-4 py-3 font-mono text-slate-500 text-[10px] whitespace-nowrap">
                        {format(a.timestamp, "MMM dd HH:mm:ss")}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => onDismiss(a.id)}
                          title="Dismiss as false positive"
                          className="p-1 text-slate-600 hover:text-rose-400 transition-colors"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </motion.tr>

                    {/* Expandable details row */}
                    <AnimatePresence>
                      {isExpanded && hasDetails && (
                        <motion.tr
                          key={`${a.id}-details`}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0 }}
                          className="bg-slate-950/60"
                        >
                          <td colSpan={7} className="px-8 py-4 border-b border-slate-800/50">
                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                              Alert Details
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              {Object.entries(a.details).map(([key, val]) => (
                                <div key={key} className="space-y-0.5">
                                  <div className="text-[9px] text-slate-600 uppercase font-bold tracking-widest">
                                    {key.replace(/([A-Z])/g, " $1").trim()}
                                  </div>
                                  <div className="text-[10px] font-mono text-slate-300 break-all">
                                    {Array.isArray(val) ? val.join(", ") : String(val)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </td>
                        </motion.tr>
                      )}
                    </AnimatePresence>
                  </>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center h-48 text-slate-600 italic text-sm gap-2">
            <ShieldCheck className="w-8 h-8 text-emerald-800" />
            {alerts.length === 0 ? "No alerts recorded yet." : "No alerts match the current filters."}
          </div>
        )}
      </div>
    </motion.div>
  );
}
