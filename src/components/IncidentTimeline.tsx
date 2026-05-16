import { Download, ShieldCheck } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { format } from "date-fns";
import { cn } from "../lib/utils";
import { ALERT_TYPE_META } from "../lib/alertMeta";
import type { Alert } from "../types";

interface IncidentTimelineProps {
  alerts: Alert[];
  onExport: () => void;
}

export function IncidentTimeline({ alerts, onExport }: IncidentTimelineProps) {
  return (
    <section className="hidden lg:flex lg:col-span-3 border-l border-slate-800 bg-slate-900/50 p-4 flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">
          Incident Timeline
        </h2>
        {alerts.length > 0 && (
          <button
            onClick={onExport}
            className="flex items-center gap-1 px-2 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[9px] font-bold text-slate-400 transition-colors"
            title="Export logs as CSV"
          >
            <Download className="w-3 h-3" /> Export
          </button>
        )}
      </div>

      <div className="flex-1 space-y-3 overflow-y-auto custom-scrollbar pr-1">
        <AnimatePresence initial={false}>
          {alerts.slice(0, 15).map((alert) => {
            const meta = ALERT_TYPE_META[alert.type];
            return (
              <motion.div
                key={alert.id}
                initial={{ opacity: 0, x: 20, height: 0 }}
                animate={{ opacity: 1, x: 0, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className={cn("p-3 rounded-lg border", meta.bg, meta.border)}
              >
                <div className="flex justify-between items-start mb-1">
                  <span className={cn("text-[10px] font-bold uppercase flex items-center gap-1", meta.color)}>
                    {meta.icon}
                    {alert.severity === "high" ? "Critical" : "Warning"}
                  </span>
                  <span className="text-[9px] text-slate-500 font-mono">
                    {format(alert.timestamp, "HH:mm:ss")}
                  </span>
                </div>
                <div className={cn("text-xs font-semibold", meta.color)}>{meta.label}</div>
                <div
                  className="text-[10px] mt-1 text-slate-400 truncate"
                  title={alert.targetMac}
                >
                  {alert.targetMac}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>

        {alerts.length === 0 && (
          <div className="text-center py-12 text-slate-600 italic text-xs flex flex-col items-center gap-2">
            <ShieldCheck className="w-8 h-8 text-emerald-800" />
            No active threats discovered.
          </div>
        )}
      </div>

      <div className="mt-4 pt-4 border-t border-slate-800 text-center shrink-0">
        <p className="text-[9px] text-slate-600">Designed for SMEs and Institutions</p>
        <p className="text-[9px] text-slate-500 uppercase tracking-tighter mt-1 font-bold italic">
          Lightweight • Affordable • Secure
        </p>
      </div>
    </section>
  );
}
