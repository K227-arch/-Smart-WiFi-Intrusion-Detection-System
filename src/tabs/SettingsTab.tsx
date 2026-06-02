import {
  Activity,
  CheckCircle2,
  Cpu,
  Network,
  Plus,
  RefreshCw,
  Save,
  Shield,
  Trash2,
  Wifi,
} from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "../lib/utils";
import type { EngineConfig, KnownNetwork, NetworkInterface } from "../types";

interface SettingsTabProps {
  engineConfig: EngineConfig | null;
  onSaveConfig: (cfg: EngineConfig) => void;
}

const DETECTION_RULES = [
  { title: "Rogue AP (Evil Twin)", rule: "IF SSID matches known network AND BSSID is different â†’ FLAG as Rogue AP", color: "border-rose-500/30 bg-rose-500/5" },
  { title: "Deauth Flood Attack", rule: "IF Deauth packets â‰¥ threshold within window from same source â†’ FLAG as DoS", color: "border-orange-500/30 bg-orange-500/5" },
  { title: "MAC Spoofing", rule: "IF known SSID is broadcast from a new/unknown BSSID â†’ FLAG as MAC Spoofing", color: "border-purple-500/30 bg-purple-500/5" },
  { title: "Channel Anomaly", rule: "IF known BSSID suddenly broadcasts on a different channel â†’ FLAG as anomaly", color: "border-amber-500/30 bg-amber-500/5" },
  { title: "Unauthorized Device", rule: "IF MAC address not in trusted whitelist AND first time seen â†’ FLAG device", color: "border-amber-500/30 bg-amber-500/5" },
];

function InterfaceTypeIcon({ type }: { type: NetworkInterface["type"] }) {
  if (type === "wifi") return <Wifi className="w-3.5 h-3.5 text-amber-400" />;
  if (type === "ethernet") return <Network className="w-3.5 h-3.5 text-emerald-400" />;
  return <Cpu className="w-3.5 h-3.5 text-slate-500" />;
}

function InterfaceTypeBadge({ type }: { type: NetworkInterface["type"] }) {
  const styles: Record<NetworkInterface["type"], string> = {
    wifi:     "bg-amber-500/15 text-amber-400 border-amber-500/30",
    ethernet: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    loopback: "bg-slate-700 text-slate-500 border-slate-600",
    virtual:  "bg-slate-700 text-slate-500 border-slate-600",
    unknown:  "bg-slate-700 text-slate-400 border-slate-600",
  };
  return (
    <span className={cn("px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase", styles[type])}>
      {type}
    </span>
  );
}

export function SettingsTab({ engineConfig, onSaveConfig }: SettingsTabProps) {
  const [networks, setNetworks] = useState<KnownNetwork[]>([]);
  const [trustedMacs, setTrustedMacs] = useState<string[]>([]);
  const [deauthThreshold, setDeauthThreshold] = useState(5);
  const [deauthWindowMs, setDeauthWindowMs] = useState(3000);
  const [dedupWindowMs, setDedupWindowMs] = useState(10000);
  const [newMac, setNewMac] = useState("");
  const [newNetwork, setNewNetwork] = useState<KnownNetwork>({ ssid: "", bssid: "", channel: 6 });
  const [saved, setSaved] = useState(false);

  // â”€â”€ Network interface state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
  const [activeCapture, setActiveCapture] = useState<string>("");
  const [captureMode, setCaptureMode] = useState<string>("");
  const [ifaceLoading, setIfaceLoading] = useState(false);
  const [ifaceMsg, setIfaceMsg] = useState<string | null>(null);

  const fetchInterfaces = useCallback(async () => {
    setIfaceLoading(true);
    try {
      const res = await fetch("/api/network/interfaces");
      const data = await res.json();
      setInterfaces(data.interfaces ?? []);
      setActiveCapture(data.activeCapture ?? "");
      setCaptureMode(data.captureMode ?? "");
    } catch { /* ignore */ }
    setIfaceLoading(false);
  }, []);

  useEffect(() => { fetchInterfaces(); }, [fetchInterfaces]);

  const selectInterface = async (name: string) => {
    try {
      const res = await fetch("/api/network/interfaces/select", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      setIfaceMsg(data.message ?? "Interface saved â€” restart to apply.");
      setTimeout(() => setIfaceMsg(null), 5000);
    } catch {
      setIfaceMsg("Failed to save interface preference.");
    }
  };

  useEffect(() => {
    if (!engineConfig) return;
    setNetworks(engineConfig.knownNetworks);
    setTrustedMacs(engineConfig.trustedMacs);
    setDeauthThreshold(engineConfig.deauthThreshold);
    setDeauthWindowMs(engineConfig.deauthWindowMs);
    setDedupWindowMs(engineConfig.dedupWindowMs);
  }, [engineConfig]);

  const handleSave = () => {
    onSaveConfig({ knownNetworks: networks, trustedMacs, deauthThreshold, deauthWindowMs, dedupWindowMs });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const addNetwork = () => {
    if (!newNetwork.ssid || !newNetwork.bssid) return;
    const bssidRegex = /^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/;
    if (!bssidRegex.test(newNetwork.bssid)) return;
    setNetworks((prev) => [...prev, { ...newNetwork }]);
    setNewNetwork({ ssid: "", bssid: "", channel: 6 });
  };

  const removeNetwork = (i: number) => setNetworks((prev) => prev.filter((_, idx) => idx !== i));

  const addTrustedMac = () => {
    const mac = newMac.trim().toUpperCase();
    if (!mac || trustedMacs.includes(mac)) return;
    setTrustedMacs((prev) => [...prev, mac]);
    setNewMac("");
  };

  const removeTrustedMac = (mac: string) => setTrustedMacs((prev) => prev.filter((m) => m !== mac));

  return (
    <motion.div
      key="settings-view"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-full overflow-hidden"
    >
      <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white uppercase tracking-wider">System Configuration</h2>
          <p className="text-[10px] text-slate-500 mt-0.5">Network rules and detection thresholds</p>
        </div>
        <button
          onClick={handleSave}
          className={cn(
            "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all",
            saved
              ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
              : "bg-amber-500 text-white hover:bg-amber-400 shadow-lg shadow-amber-500/20"
          )}
        >
          <Save className="w-3.5 h-3.5" />
          {saved ? "Saved!" : "Save Changes"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">

        {/* â”€â”€ Capture Interface â”€â”€ */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Network className="w-4 h-4 text-violet-400" />
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-widest">Capture Interface</h3>
            </div>
            <button
              onClick={fetchInterfaces}
              disabled={ifaceLoading}
              className="p-1.5 text-slate-500 hover:text-violet-400 transition-colors"
              title="Refresh interface list"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", ifaceLoading && "animate-spin")} />
            </button>
          </div>

          <p className="text-[10px] text-slate-500 leading-relaxed">
            Select the network interface SALAMANDA monitors. Detected interfaces on this machine are listed below.
            Changes take effect on the next server restart.
          </p>

          {/* Current capture status */}
          <div className="flex items-center gap-3 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg">
            <div className={cn("w-2 h-2 rounded-full shrink-0", captureMode === "live" ? "bg-emerald-500 animate-pulse" : "bg-amber-400 animate-pulse")} />
            <span className="text-[10px] text-slate-400 font-mono">
              Active: <span className="text-white font-bold">{activeCapture || "â€”"}</span>
            </span>
            <span className={cn(
              "ml-auto px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase",
              captureMode === "live"
                ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                : "bg-amber-500/15 text-amber-400 border-amber-500/30"
            )}>
              {captureMode === "live" ? "Live Capture" : "Simulator"}
            </span>
          </div>

          {/* Interface list */}
          <div className="space-y-2">
            {interfaces.length === 0 && !ifaceLoading && (
              <p className="text-[10px] text-slate-600 italic px-1">No network interfaces detected.</p>
            )}
            {interfaces.map((iface) => (
              <div
                key={iface.name}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border transition-colors",
                  iface.isCapturing
                    ? "bg-violet-500/10 border-violet-500/40"
                    : "bg-slate-950 border-slate-800 hover:border-slate-700"
                )}
              >
                <InterfaceTypeIcon type={iface.type} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[11px] font-mono font-bold text-white">{iface.name}</span>
                    <InterfaceTypeBadge type={iface.type} />
                    {iface.isCapturing && (
                      <span className="flex items-center gap-1 text-[9px] font-bold text-violet-400">
                        <CheckCircle2 className="w-3 h-3" /> Capturing
                      </span>
                    )}
                  </div>
                  <div className="flex gap-3 mt-0.5">
                    <span className="text-[10px] text-slate-400 font-mono">{iface.ip}</span>
                    <span className="text-[10px] text-slate-600 font-mono">{iface.mac}</span>
                  </div>
                </div>
                {!iface.isCapturing && (
                  <button
                    onClick={() => selectInterface(iface.name)}
                    className="shrink-0 px-2 py-1 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 rounded text-[9px] font-bold text-violet-400 transition-colors"
                  >
                    Use This
                  </button>
                )}
              </div>
            ))}
          </div>

          {ifaceMsg && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-lg text-[10px] text-amber-400"
            >
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
              {ifaceMsg}
            </motion.div>
          )}
        </section>

        {/* â”€â”€ Known Networks â”€â”€ */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Wifi className="w-4 h-4 text-amber-500" />
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-widest">Known Networks</h3>
          </div>
          <p className="text-[10px] text-slate-500">
            Legitimate SSIDs and their expected BSSIDs. Any beacon from a different BSSID triggers a Rogue AP or MAC Spoofing alert.
          </p>
          <div className="space-y-2">
            {networks.map((n, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-slate-950 border border-slate-800 rounded-lg">
                <div className="flex-1 grid grid-cols-3 gap-3 text-[11px] font-mono">
                  <span className="text-emerald-400">{n.ssid}</span>
                  <span className="text-amber-400">{n.bssid}</span>
                  <span className="text-slate-400">Ch {n.channel}</span>
                </div>
                <button onClick={() => removeNetwork(i)} className="p-1 text-slate-600 hover:text-rose-400 transition-colors">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            <input
              value={newNetwork.ssid}
              onChange={(e) => setNewNetwork((p) => ({ ...p, ssid: e.target.value }))}
              placeholder="SSID"
              className="bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500 placeholder:text-slate-600"
            />
            <input
              value={newNetwork.bssid}
              onChange={(e) => setNewNetwork((p) => ({ ...p, bssid: e.target.value.toUpperCase() }))}
              placeholder="BSSID (AA:BB:CC:DD:EE:FF)"
              className={cn(
                "bg-slate-950 border rounded px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none placeholder:text-slate-600",
                newNetwork.bssid && !/^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$/.test(newNetwork.bssid)
                  ? "border-rose-500/60 focus:border-rose-500"
                  : "border-slate-700 focus:border-amber-500"
              )}
            />
            <div className="flex gap-2">
              <input
                type="number"
                value={newNetwork.channel}
                onChange={(e) => setNewNetwork((p) => ({ ...p, channel: Number(e.target.value) }))}
                min={1} max={14}
                placeholder="Ch"
                className="w-20 bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500"
              />
              <button
                onClick={addNetwork}
                className="flex-1 flex items-center justify-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded text-[10px] font-bold text-amber-400 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
          </div>
        </section>

        {/* â”€â”€ Trusted MAC Whitelist â”€â”€ */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-widest">Trusted MAC Whitelist</h3>
          </div>
          <p className="text-[10px] text-slate-500">
            Devices on this list will not trigger Unauthorized Device alerts. Persisted across restarts.
          </p>
          <div className="flex flex-wrap gap-2">
            {trustedMacs.map((mac) => (
              <div key={mac} className="flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 border border-emerald-500/20 rounded text-[10px] font-mono text-emerald-400">
                {mac}
                <button onClick={() => removeTrustedMac(mac)} className="hover:text-rose-400 transition-colors ml-1">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
            {trustedMacs.length === 0 && (
              <span className="text-[10px] text-slate-600 italic">No trusted MACs configured.</span>
            )}
          </div>
          <div className="flex gap-2">
            <input
              value={newMac}
              onChange={(e) => setNewMac(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addTrustedMac()}
              placeholder="AA:BB:CC:DD:EE:FF"
              className="flex-1 bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-emerald-500 placeholder:text-slate-600"
            />
            <button
              onClick={addTrustedMac}
              className="flex items-center gap-1.5 px-3 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 rounded text-[10px] font-bold text-emerald-400 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Add
            </button>
          </div>
        </section>

        {/* â”€â”€ Detection Thresholds â”€â”€ */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-orange-500" />
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-widest">Detection Thresholds</h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Deauth Threshold (packets)</label>
              <input
                type="number" min={2} max={50} value={deauthThreshold}
                onChange={(e) => setDeauthThreshold(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm font-mono text-slate-200 focus:outline-none focus:border-orange-500"
              />
              <p className="text-[9px] text-slate-600">Deauth frames before DoS alert fires</p>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Deauth Window (ms)</label>
              <input
                type="number" min={1000} max={30000} step={500} value={deauthWindowMs}
                onChange={(e) => setDeauthWindowMs(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm font-mono text-slate-200 focus:outline-none focus:border-orange-500"
              />
              <p className="text-[9px] text-slate-600">Rolling time window for deauth counting</p>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Alert Dedup Window (ms)</label>
              <input
                type="number" min={1000} max={60000} step={1000} value={dedupWindowMs}
                onChange={(e) => setDedupWindowMs(Number(e.target.value))}
                className="w-full bg-slate-950 border border-slate-700 rounded px-3 py-2 text-sm font-mono text-slate-200 focus:outline-none focus:border-orange-500"
              />
              <p className="text-[9px] text-slate-600">Suppress duplicate alerts within this window</p>
            </div>
          </div>
        </section>

        {/* â”€â”€ Detection Rules Reference â”€â”€ */}
        <section className="space-y-3">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-widest">Detection Rules Reference</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {DETECTION_RULES.map((r) => (
              <div key={r.title} className={cn("p-3 rounded-lg border", r.color)}>
                <div className="text-[10px] font-bold text-slate-300 uppercase mb-1">{r.title}</div>
                <div className="text-[9px] text-slate-500 font-mono leading-relaxed">{r.rule}</div>
              </div>
            ))}
          </div>
        </section>

      </div>
    </motion.div>
  );
}

