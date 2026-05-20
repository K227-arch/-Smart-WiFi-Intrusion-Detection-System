import { Shield, Wifi, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { format } from "date-fns";
import { cn } from "../lib/utils";
import type { Device } from "../types";
import { DetailItem } from "./ui/DetailItem";

interface DeviceModalProps {
  device: Device | null;
  onClose: () => void;
  onUpdateStatus: (mac: string, status: Device["status"]) => void;
}

export function DeviceModal({ device, onClose, onUpdateStatus }: DeviceModalProps) {
  const handleTrustToggle = () => {
    if (!device) return;
    const next = device.status === "trusted" ? "unknown" : "trusted";
    onUpdateStatus(device.mac, next);
  };

  const handleBlockToggle = () => {
    if (!device) return;
    const next = device.status === "blocked" ? "unknown" : "blocked";
    onUpdateStatus(device.mac, next);
  };

  return (
    <AnimatePresence>
      {device && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.95, opacity: 0, y: 20 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl"
          >
            {/* Modal Header */}
            <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center">
              <h3 className="text-white font-bold uppercase tracking-widest flex items-center gap-2">
                <Shield className="w-4 h-4 text-amber-500" /> Identity Inspector
              </h3>
              <button
                onClick={onClose}
                className="p-1 hover:bg-slate-800 rounded-md transition-colors"
                aria-label="Close"
              >
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-6">
              {/* Device identity badge */}
              <div className="flex flex-col items-center justify-center py-4 bg-slate-950/50 rounded-xl border border-slate-800/50">
                <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mb-4 ring-1 ring-amber-500/20">
                  <Wifi className="w-8 h-8 text-amber-500" />
                </div>
                {/* Primary: IP address */}
                <div className="text-2xl font-mono font-bold text-amber-400 tracking-widest">
                  {device.ipAddress ?? "IP Unknown"}
                </div>
                {/* Hostname */}
                {device.hostname && (
                  <div className="text-sm text-slate-300 font-medium mt-1">{device.hostname}</div>
                )}
                <div
                  className={cn(
                    "mt-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest",
                    device.status === "trusted"
                      ? "bg-emerald-500/20 text-emerald-500"
                      : device.status === "blocked"
                      ? "bg-rose-500/20 text-rose-500"
                      : "bg-slate-500/20 text-slate-400"
                  )}
                >
                  {device.status} Identity
                </div>
              </div>

              {/* Details grid */}
              <div className="grid grid-cols-2 gap-4">
                <DetailItem
                  label="MAC Address"
                  value={device.mac}
                  color="text-slate-400"
                />
                <DetailItem
                  label="IP Address"
                  value={device.ipAddress ?? "Not resolved"}
                  color={device.ipAddress ? "text-amber-400" : "text-slate-500"}
                />
                <DetailItem
                  label="Hostname"
                  value={device.hostname ?? "Not resolved"}
                  color={device.hostname ? "text-emerald-400" : "text-slate-500"}
                />
                <DetailItem
                  label="Primary SSID"
                  value={device.ssid || "Hidden/Broadcast Proxy"}
                />
                <DetailItem
                  label="Signal Intensity"
                  value={`${device.avgSignal.toFixed(1)} dBm`}
                  color={device.avgSignal > -60 ? "text-emerald-500" : "text-amber-500"}
                />
                <DetailItem
                  label="First Observation"
                  value={format(device.firstSeen, "MMM dd, yyyy HH:mm:ss")}
                />
                <DetailItem
                  label="Last Active Signal"
                  value={format(device.lastSeen, "MMM dd, yyyy HH:mm:ss")}
                />
              </div>

              {/* Actions */}
              <div className="pt-4 border-t border-slate-800">
                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-3">
                  Security Actions
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={handleTrustToggle}
                    className={cn(
                      "flex-1 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all",
                      device.status === "trusted"
                        ? "bg-slate-800 text-slate-400"
                        : "bg-amber-500 text-white shadow-lg shadow-amber-500/20"
                    )}
                  >
                    {device.status === "trusted" ? "Revoke Trust" : "Trust Device"}
                  </button>
                  <button
                    onClick={handleBlockToggle}
                    className={cn(
                      "flex-1 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all",
                      device.status === "blocked"
                        ? "bg-rose-500 text-white shadow-lg shadow-rose-500/20"
                        : "bg-slate-800 text-slate-400"
                    )}
                  >
                    {device.status === "blocked" ? "Unblock" : "Block Device"}
                  </button>
                </div>
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-950/50 border-t border-slate-800 text-center">
              <p className="text-[9px] text-slate-500 uppercase font-bold tracking-tighter italic">
                Cognitive Analysis active for this node
              </p>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
