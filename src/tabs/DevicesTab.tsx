import { Globe, Monitor, ScanLine, Wifi } from "lucide-react";
import { motion } from "motion/react";
import { format } from "date-fns";
import { useState, useCallback } from "react";
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
  const [search, setSearch] = useState("");

  const filtered = devices
    .filter((d) => filter === "all" || d.status === filter)
    .filter((d) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        d.mac.toLowerCase().includes(q) ||
        (d.ipAddress ?? "").toLowerCase().includes(q) ||
        (d.hostname ?? "").toLowerCase().includes(q) ||
        (d.ssid ?? "").toLowerCase().includes(q)
      );
    });

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
      <div className="px-6 py-4 border-b border-slate-800 flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
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
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    : "bg-slate-800 text-slate-500 hover:text-slate-300"
                )}
              >
                {f} ({filterCounts[f]})
              </button>
            ))}
          </div>
        </div>
        {/* Search */}
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by IP, hostname, MAC or SSID…"
          className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-xs font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none focus:border-amber-500 transition-colors"
        />
      </div>

      {/* Device cards */}
      <div className="p-4 md:p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-y-auto custom-scrollbar">
        {filtered.map((d) => (
          <div
            key={d.mac}
            onClick={() => onSelectDevice(d)}
            className="p-4 rounded-lg bg-slate-950 border border-slate-800 flex flex-col gap-2 cursor-pointer hover:border-amber-500/50 transition-colors group"
          >
            {/* Top row: IP / hostname + status badge */}
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                {/* Primary: IP address */}
                <div className="flex items-center gap-1.5">
                  <Globe className="w-3 h-3 text-amber-400 shrink-0" />
                  <span className="text-sm font-mono font-bold text-amber-400 truncate">
                    {d.ipAddress ?? "IP Unknown"}
                  </span>
                </div>
                {/* Secondary: hostname */}
                {d.hostname && (
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <Monitor className="w-3 h-3 text-slate-500 shrink-0" />
                    <span className="text-[11px] text-slate-300 font-medium truncate">
                      {d.hostname}
                    </span>
                  </div>
                )}
              </div>
              <span
                className={cn(
                  "px-1.5 py-0.5 rounded-[4px] text-[8px] font-bold uppercase shrink-0",
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

            {/* MAC address */}
            <div className="text-[10px] font-mono text-slate-500 truncate">
              MAC: {d.mac}
            </div>

            {/* SSID */}
            <div className="text-xs font-medium text-slate-300 truncate">
              {d.ssid || "No SSID / Probe"}
            </div>

            {/* Timestamps */}
            <div className="grid grid-cols-2 gap-2 mt-1 pt-2 border-t border-slate-800/50">
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

            {/* Signal */}
            <div className="flex justify-between text-[9px] text-slate-500 uppercase font-bold">
              <span className="flex items-center gap-1">
                <Wifi className="w-2.5 h-2.5" /> {d.avgSignal.toFixed(0)} dBm
              </span>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 mt-1">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onUpdateStatus(d.mac, d.status === "trusted" ? "unknown" : "trusted");
                }}
                className={cn(
                  "flex-1 text-[10px] font-bold py-1.5 rounded transition-colors uppercase tracking-wider",
                  d.status === "trusted"
                    ? "bg-slate-800 text-slate-400 hover:bg-slate-700"
                    : "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20"
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
            {search ? `No devices match "${search}"` : "No devices in this category."}
          </div>
        )}
      </div>
    </motion.div>
  );
}
