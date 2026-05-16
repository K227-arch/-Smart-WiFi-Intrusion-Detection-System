import { Wifi } from "lucide-react";
import { motion } from "motion/react";
import { format } from "date-fns";
import { useState } from "react";
import { cn } from "../lib/utils";
import type { Device } from "../types";

type FilterStatus = "all" | Device["status"];

interface DevicesTabProps {
  devices: Device[];
  onSelectDevice: (device: Device) => void;
  onUpdateStatus: (mac: string, status: Device["status"]) => void;
}

export function DevicesTab({ devices, onSelectDevice, onUpdateStatus }: DevicesTabProps) {
  const [filter, setFilter] = useState<FilterStatus>("all");

  const filtered = filter === "all" ? devices : devices.filter((d) => d.status === filter);

  const filterCounts: Record<FilterStatus, number> = {
    all: devices.length,
    trusted: devices.filter((d) => d.status === "trusted").length,
    unknown: devices.filter((d) => d.status === "unknown").length,
    blocked: devices.filter((d) => d.status === "blocked").length,
  };

  return (
    <motion.div
      key="devices-view"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-full overflow-hidden"
    >
      {/* Header + filters */}
      <div className="px-6 py-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-white uppercase tracking-widest">
          Device Registry
        </h2>
        <div className="flex gap-2 flex-wrap">
          {(["all", "trusted", "unknown", "blocked"] as FilterStatus[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "px-2 py-1 rounded text-[10px] font-bold uppercase transition-colors",
                filter === f
                  ? "bg-sky-500/20 text-sky-400 border border-sky-500/30"
                  : "bg-slate-800 text-slate-500 hover:text-slate-300"
              )}
            >
              {f} ({filterCounts[f]})
            </button>
          ))}
        </div>
      </div>

      {/* Device cards */}
      <div className="p-4 md:p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-y-auto custom-scrollbar">
        {filtered.map((d) => (
          <div
            key={d.mac}
            onClick={() => onSelectDevice(d)}
            className="p-4 rounded-lg bg-slate-950 border border-slate-800 flex flex-col gap-2 cursor-pointer hover:border-sky-500/50 transition-colors group"
          >
            <div className="flex justify-between items-center">
              <span className="text-xs font-mono text-sky-400">{d.mac}</span>
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded-[4px] text-[8px] font-bold uppercase",
                  d.status === "trusted"
                    ? "bg-emerald-500/20 text-emerald-500"
                    : d.status === "blocked"
                    ? "bg-rose-500/20 text-rose-500"
                    : "bg-slate-800 text-slate-500"
                )}
              >
                {d.status}
              </span>
            </div>

            <div className="text-sm font-medium text-slate-200 truncate">
              {d.ssid || "Unconnected Node"}
            </div>

            <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-800/50">
              <div className="flex flex-col">
                <span className="text-[8px] text-slate-500 uppercase font-bold tracking-tighter">
                  First Seen
                </span>
                <span className="text-[10px] text-slate-300 font-mono">
                  {format(d.firstSeen, "MMM dd, HH:mm:ss")}
                </span>
              </div>
              <div className="flex flex-col text-right">
                <span className="text-[8px] text-slate-500 uppercase font-bold tracking-tighter">
                  Last Contact
                </span>
                <span className="text-[10px] text-emerald-500 font-mono">
                  {format(d.lastSeen, "HH:mm:ss")}
                </span>
              </div>
            </div>

            <div className="flex justify-between text-[9px] text-slate-500 uppercase font-bold mt-1">
              <span className="flex items-center gap-1">
                <Wifi className="w-2.5 h-2.5" /> {d.avgSignal.toFixed(0)} dBm
              </span>
            </div>

            <div className="flex gap-2 mt-2">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateStatus(d.mac, d.status === "trusted" ? "unknown" : "trusted");
                }}
                className={cn(
                  "flex-1 text-[10px] font-bold py-1.5 rounded transition-colors uppercase tracking-wider",
                  d.status === "trusted"
                    ? "bg-slate-800 text-slate-400 hover:bg-slate-700"
                    : "bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 border border-sky-500/20"
                )}
              >
                {d.status === "trusted" ? "Revoke Trust" : "Trust Device"}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateStatus(d.mac, d.status === "blocked" ? "unknown" : "blocked");
                }}
                className={cn(
                  "px-3 text-[10px] font-bold py-1.5 rounded transition-colors uppercase tracking-wider",
                  d.status === "blocked"
                    ? "bg-rose-500 text-white"
                    : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                )}
              >
                {d.status === "blocked" ? "Unblock" : "Block"}
              </button>
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div className="col-span-2 text-center py-16 text-slate-600 italic text-sm">
            No devices in this category.
          </div>
        )}
      </div>
    </motion.div>
  );
}
