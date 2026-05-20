import React, { useCallback, useEffect, useRef, useState } from "react";
import { Activity, Pause, Play, Radio, RefreshCcw, Square, Trash2, WifiOff, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { format } from "date-fns";
import { cn } from "../lib/utils";
import type { WiFiPacket } from "../types";
import { TrafficStatBox } from "../components/ui/TrafficStatBox";

interface PacketStats {
  total: number;
  data: number;
  mgmt: number;
  beacons: number;
  deauth: number;
  totalSignal: number;
}

type CaptureState = "running" | "paused" | "stopped";

// ── Detect whether the SSE stream is available ────────────────────────────────
async function checkSseAvailable(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2000);
    const res = await fetch("/api/stream", { method: "GET", signal: controller.signal });
    clearTimeout(timer);
    return res.status !== 501;
  } catch {
    return false;
  }
}

export function LiveTrafficTab() {
  const [packets, setPackets] = useState<WiFiPacket[]>([]);
  const [expandedPacketId, setExpandedPacketId] = useState<string | null>(null);
  const [sseAvailable, setSseAvailable] = useState<boolean | null>(null);
  const [captureState, setCaptureState] = useState<CaptureState>("running");
  const [stats, setStats] = useState<PacketStats>({
    total: 0, data: 0, mgmt: 0, beacons: 0, deauth: 0, totalSignal: 0,
  });

  // Ref so the SSE handler can read the latest captureState without re-subscribing
  const captureStateRef = useRef<CaptureState>("running");
  captureStateRef.current = captureState;

  // ── Check SSE availability once on mount ─────────────────────────────────
  useEffect(() => {
    checkSseAvailable().then(setSseAvailable);
  }, []);

  // ── SSE connection — only open when sseAvailable and not stopped ──────────
  useEffect(() => {
    if (sseAvailable !== true) return;
    if (captureState === "stopped") return;

    const eventSource = new EventSource("/api/stream");

    const handlePacket = (event: MessageEvent) => {
      // Drop packets silently while paused — stream stays open
      if (captureStateRef.current !== "running") return;
      try {
        const packet: WiFiPacket = JSON.parse(event.data);
        setPackets((prev) => [packet, ...prev].slice(0, 200));
        setStats((prev) => ({
          total: prev.total + 1,
          data: packet.type === "data" ? prev.data + 1 : prev.data,
          mgmt: packet.type === "mgmt" ? prev.mgmt + 1 : prev.mgmt,
          beacons: packet.type === "beacons" ? prev.beacons + 1 : prev.beacons,
          deauth: packet.type === "deauth" ? prev.deauth + 1 : prev.deauth,
          totalSignal: prev.totalSignal + packet.signalStrength,
        }));
      } catch { /* malformed */ }
    };

    eventSource.addEventListener("packet", handlePacket);
    eventSource.onerror = () => eventSource.close();

    return () => {
      eventSource.removeEventListener("packet", handlePacket);
      eventSource.close();
    };
  }, [sseAvailable, captureState]);

  const handlePause = useCallback(() => setCaptureState("paused"), []);
  const handleResume = useCallback(() => setCaptureState("running"), []);
  const handleStop = useCallback(() => {
    setCaptureState("stopped");
    setExpandedPacketId(null);
  }, []);
  const handleClear = useCallback(() => {
    setPackets([]);
    setStats({ total: 0, data: 0, mgmt: 0, beacons: 0, deauth: 0, totalSignal: 0 });
  }, []);
  const handleRestart = useCallback(() => {
    setPackets([]);
    setStats({ total: 0, data: 0, mgmt: 0, beacons: 0, deauth: 0, totalSignal: 0 });
    setCaptureState("running");
  }, []);

  const avgSignal = stats.total > 0 ? stats.totalSignal / stats.total : 0;

  // ── Loading state ─────────────────────────────────────────────────────────
  if (sseAvailable === null) {
    return (
      <motion.div
        key="traffic-checking"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="bg-slate-900 border border-slate-800 rounded-xl flex items-center justify-center h-64"
      >
        <div className="flex flex-col items-center gap-3 text-slate-500">
          <RefreshCcw className="w-6 h-6 animate-spin" />
          <span className="text-xs font-mono uppercase tracking-widest">Connecting to stream…</span>
        </div>
      </motion.div>
    );
  }

  // ── Cloud / Vercel fallback ───────────────────────────────────────────────
  if (sseAvailable === false) {
    return (
      <motion.div
        key="traffic-cloud"
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-full overflow-hidden"
      >
        <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center shrink-0">
          <h2 className="text-lg font-bold text-white uppercase tracking-wider">Live Traffic Stream</h2>
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-amber-400" />
            <span className="text-[10px] text-amber-400 uppercase font-bold tracking-widest hidden sm:inline">Cloud Mode</span>
          </div>
        </div>
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8 text-center">
          <div className="w-20 h-20 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
            <Radio className="w-10 h-10 text-amber-400" />
          </div>
          <div className="max-w-md space-y-3">
            <h3 className="text-white font-bold text-lg">Live Packet Capture Unavailable</h3>
            <p className="text-slate-400 text-sm leading-relaxed">
              Real-time 802.11 packet interception requires direct hardware access and cannot run in a serverless cloud environment.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full max-w-2xl mt-2">
            {[
              { title: "Docker (Recommended)", desc: "Full packet capture, ONNX ML, and Snort engine", cmd: "docker compose up", color: "border-amber-500/30 bg-amber-500/5 text-amber-400" },
              { title: "Local Dev", desc: "Node.js development with hot reload", cmd: "npm run dev", color: "border-emerald-500/30 bg-emerald-500/5 text-emerald-400" },
              { title: "With sudo (Live Capture)", desc: "Enable real libpcap on your wireless interface", cmd: "sudo npm run dev", color: "border-violet-500/30 bg-violet-500/5 text-violet-400" },
            ].map((opt) => (
              <div key={opt.title} className={cn("p-4 rounded-xl border text-left", opt.color)}>
                <div className="text-[10px] font-bold uppercase tracking-widest mb-1">{opt.title}</div>
                <p className="text-[10px] text-slate-500 mb-3 leading-relaxed">{opt.desc}</p>
                <code className="text-[10px] font-mono bg-slate-950 px-2 py-1 rounded border border-slate-800 block">{opt.cmd}</code>
              </div>
            ))}
          </div>
          <p className="text-[10px] text-slate-600 font-mono mt-2">
            All other tabs (Alerts, Analytics, ML, Devices) work fully in cloud mode via Insforge realtime.
          </p>
        </div>
      </motion.div>
    );
  }

  // ── Full SSE live view ────────────────────────────────────────────────────
  return (
    <motion.div
      key="traffic-view"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-full overflow-hidden"
    >
      {/* ── Header with capture controls ── */}
      <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center shrink-0 gap-4">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-bold text-white uppercase tracking-wider">Live Traffic Stream</h2>
          {/* Status indicator */}
          <div className="flex items-center gap-1.5">
            {captureState === "running" && (
              <>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-[10px] text-emerald-500 font-bold uppercase tracking-widest hidden sm:inline">Capturing</span>
              </>
            )}
            {captureState === "paused" && (
              <>
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                <span className="text-[10px] text-amber-400 font-bold uppercase tracking-widest hidden sm:inline">Paused</span>
              </>
            )}
            {captureState === "stopped" && (
              <>
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                <span className="text-[10px] text-rose-400 font-bold uppercase tracking-widest hidden sm:inline">Stopped</span>
              </>
            )}
          </div>
        </div>

        {/* ── Control buttons ── */}
        <div className="flex items-center gap-2">
          {/* Pause / Resume */}
          {captureState === "running" ? (
            <button
              onClick={handlePause}
              title="Pause capture — stream stays open, new packets are dropped"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded text-[10px] font-bold text-amber-400 uppercase transition-colors"
            >
              <Pause className="w-3.5 h-3.5" /> Pause
            </button>
          ) : captureState === "paused" ? (
            <button
              onClick={handleResume}
              title="Resume capturing packets"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded text-[10px] font-bold text-emerald-400 uppercase transition-colors"
            >
              <Play className="w-3.5 h-3.5" /> Resume
            </button>
          ) : (
            /* Stopped — show Restart */
            <button
              onClick={handleRestart}
              title="Restart capture and clear buffer"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded text-[10px] font-bold text-amber-400 uppercase transition-colors"
            >
              <Play className="w-3.5 h-3.5" /> Restart
            </button>
          )}

          {/* Stop — only shown when running or paused */}
          {captureState !== "stopped" && (
            <button
              onClick={handleStop}
              title="Stop capture and close stream connection"
              className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 rounded text-[10px] font-bold text-rose-400 uppercase transition-colors"
            >
              <Square className="w-3.5 h-3.5" /> Stop
            </button>
          )}

          {/* Clear buffer */}
          <button
            onClick={handleClear}
            title="Clear packet buffer"
            className="p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-slate-400 hover:text-white transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* ── Paused / Stopped overlay banner ── */}
      <AnimatePresence>
        {captureState !== "running" && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className={cn(
              "px-6 py-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider shrink-0",
              captureState === "paused"
                ? "bg-amber-500/10 border-b border-amber-500/20 text-amber-400"
                : "bg-rose-500/10 border-b border-rose-500/20 text-rose-400"
            )}
          >
            {captureState === "paused" ? (
              <>
                <Pause className="w-3.5 h-3.5" />
                Capture paused — stream is open but new packets are not being recorded. Click Resume to continue.
              </>
            ) : (
              <>
                <Square className="w-3.5 h-3.5" />
                Capture stopped — stream connection closed. {packets.length} packets in buffer. Click Restart to begin a new session.
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-0 border-b border-slate-800 bg-slate-950/30 shrink-0">
        <TrafficStatBox label="Total Packets" value={stats.total} />
        <TrafficStatBox label="DATA" value={stats.data} color="text-amber-500" />
        <TrafficStatBox label="BEACONS" value={stats.beacons} color="text-emerald-500" />
        <TrafficStatBox label="MGMT" value={stats.mgmt} color="text-amber-500" />
        <TrafficStatBox label="DEAUTH" value={stats.deauth} color="text-rose-500" />
        <TrafficStatBox
          label="Avg Signal"
          value={`${avgSignal.toFixed(1)} dBm`}
          color={avgSignal > -60 ? "text-emerald-500" : "text-slate-400"}
        />
      </div>

      {/* ── Packet table ── */}
      <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar">
        <table className="w-full text-left min-w-[800px]">
          <thead className="text-[10px] text-slate-500 uppercase border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
            <tr>
              <th className="px-6 py-3 font-semibold">Time</th>
              <th className="px-6 py-3 font-semibold">Source MAC</th>
              <th className="px-6 py-3 font-semibold">Destination MAC</th>
              <th className="px-6 py-3 font-semibold text-center">Type</th>
              <th className="px-6 py-3 font-semibold">Signal</th>
              <th className="px-6 py-3 font-semibold text-right">Details</th>
            </tr>
          </thead>
          <tbody className="text-[11px] font-mono">
            <AnimatePresence initial={false}>
              {packets.map((p, i) => {
                const packetId = `${p.timestamp}-${p.sourceMac}-${i}`;
                const isExpanded = expandedPacketId === packetId;
                return (
                  <React.Fragment key={packetId}>
                    <motion.tr
                      initial={{ opacity: 0, backgroundColor: "rgba(14, 165, 233, 0.1)" }}
                      animate={{ opacity: 1, backgroundColor: isExpanded ? "rgba(30, 41, 59, 0.5)" : "transparent" }}
                      className={cn(
                        "border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors group cursor-pointer",
                        isExpanded && "border-amber-500/30 bg-slate-800/50"
                      )}
                      onClick={() => setExpandedPacketId(isExpanded ? null : packetId)}
                    >
                      <td className="px-6 py-3 text-slate-500">{format(p.timestamp, "HH:mm:ss.SSS")}</td>
                      <td className="px-6 py-3 text-amber-400 font-bold">{p.sourceMac}</td>
                      <td className="px-6 py-3 text-slate-400 truncate max-w-[150px]">
                        {p.destMac || (p.type === "beacons" ? "Broadcast" : "—")}
                      </td>
                      <td className="px-6 py-3 text-center">
                        <span className={cn(
                          "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                          p.type === "deauth" ? "bg-rose-500/20 text-rose-500" :
                          p.type === "mgmt" ? "bg-amber-500/20 text-amber-500" :
                          p.type === "beacons" ? "bg-emerald-500/20 text-emerald-500" :
                          "bg-amber-500/20 text-amber-500"
                        )}>
                          {p.type}
                        </span>
                      </td>
                      <td className={cn("px-6 py-3 font-bold", p.signalStrength > -60 ? "text-emerald-500" : "text-slate-500")}>
                        {p.signalStrength.toFixed(0)}
                      </td>
                      <td className="px-6 py-3 text-right">
                        <button className="p-1 hover:text-amber-400 text-slate-600 transition-colors">
                          {isExpanded ? <X className="w-3.5 h-3.5" /> : <Activity className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100" />}
                        </button>
                      </td>
                    </motion.tr>
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.tr
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="bg-slate-950/50 overflow-hidden"
                        >
                          <td colSpan={6} className="px-6 py-4 border-b border-amber-500/20">
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-6">
                              <div className="space-y-1">
                                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">BSSID</div>
                                <div className="text-xs text-amber-400 font-mono">{p.bssid}</div>
                              </div>
                              <div className="space-y-1">
                                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Channel</div>
                                <div className="text-xs text-slate-200 font-mono">{p.channel} ({p.channel >= 36 ? "5GHz" : "2.4GHz"})</div>
                              </div>
                              <div className="space-y-1">
                                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">SSID</div>
                                <div className="text-xs text-emerald-500 font-mono italic">{p.ssid || "Hidden/None"}</div>
                              </div>
                              <div className="space-y-1">
                                <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Packet Class</div>
                                <div className="text-xs text-slate-400 font-mono uppercase">{p.type} Frame</div>
                              </div>
                            </div>
                          </td>
                        </motion.tr>
                      )}
                    </AnimatePresence>
                  </React.Fragment>
                );
              })}
            </AnimatePresence>
          </tbody>
        </table>

        {packets.length === 0 && captureState === "running" && (
          <div className="flex flex-col items-center justify-center h-64 opacity-20">
            <RefreshCcw className="w-8 h-8 mb-2 animate-spin" />
            <p className="text-sm italic">Synchronizing with stream…</p>
          </div>
        )}

        {packets.length === 0 && captureState !== "running" && (
          <div className="flex flex-col items-center justify-center h-64 text-slate-600">
            <Square className="w-8 h-8 mb-2 opacity-30" />
            <p className="text-sm italic">No packets in buffer.</p>
          </div>
        )}
      </div>
    </motion.div>
  );
}
