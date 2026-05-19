import {
  Activity,
  Plus,
  Save,
  Shield,
  Trash2,
  Wifi,
} from "lucide-react";
import { motion } from "motion/react";
import { useEffect, useState } from "react";
import { cn } from "../lib/utils";
import type { EngineConfig, KnownNetwork } from "../types";

interface SettingsTabProps {
  engineConfig: EngineConfig | null;
  onSaveConfig: (cfg: EngineConfig) => void;
}

const DETECTION_RULES = [
  { title: "Rogue AP (Evil Twin)", rule: "IF SSID matches known network AND BSSID is different → FLAG as Rogue AP", color: "border-rose-500/30 bg-rose-500/5" },
  { title: "Deauth Flood Attack", rule: "IF Deauth packets ≥ threshold within window from same source → FLAG as DoS", color: "border-orange-500/30 bg-orange-500/5" },
  { title: "MAC Spoofing", rule: "IF known SSID is broadcast from a new/unknown BSSID → FLAG as MAC Spoofing", color: "border-purple-500/30 bg-purple-500/5" },
  { title: "Channel Anomaly", rule: "IF known BSSID suddenly broadcasts on a different channel → FLAG as anomaly", color: "border-sky-500/30 bg-sky-500/5" },
  { title: "Unauthorized Device", rule: "IF MAC address not in trusted whitelist AND first time seen → FLAG device", color: "border-amber-500/30 bg-amber-500/5" },
];

export function SettingsTab({ engineConfig, onSaveConfig }: SettingsTabProps) {
  const [networks, setNetworks] = useState<KnownNetwork[]>([]);
  const [trustedMacs, setTrustedMacs] = useState<string[]>([]);
  const [deauthThreshold, setDeauthThreshold] = useState(5);
  const [deauthWindowMs, setDeauthWindowMs] = useState(3000);
  const [dedupWindowMs, setDedupWindowMs] = useState(10000);
  const [newMac, setNewMac] = useState("");
  const [newNetwork, setNewNetwork] = useState<KnownNetwork>({ ssid: "", bssid: "", channel: 6 });
  const [saved, setSaved] = useState(false);

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
              : "bg-sky-500 text-white hover:bg-sky-400 shadow-lg shadow-sky-500/20"
          )}
        >
          <Save className="w-3.5 h-3.5" />
          {saved ? "Saved!" : "Save Changes"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-8">

        {/* ── Known Networks ── */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Wifi className="w-4 h-4 text-sky-500" />
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
                  <span className="text-sky-400">{n.bssid}</span>
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
              className="bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-sky-500 placeholder:text-slate-600"
            />
            <input
              value={newNetwork.bssid}
              onChange={(e) => setNewNetwork((p) => ({ ...p, bssid: e.target.value.toUpperCase() }))}
              placeholder="BSSID (AA:BB:CC:DD:EE:FF)"
              className="bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-sky-500 placeholder:text-slate-600"
            />
            <div className="flex gap-2">
              <input
                type="number"
                value={newNetwork.channel}
                onChange={(e) => setNewNetwork((p) => ({ ...p, channel: Number(e.target.value) }))}
                min={1} max={14}
                placeholder="Ch"
                className="w-20 bg-slate-950 border border-slate-700 rounded px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-sky-500"
              />
              <button
                onClick={addNetwork}
                className="flex-1 flex items-center justify-center gap-1 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/30 rounded text-[10px] font-bold text-sky-400 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Add
              </button>
            </div>
          </div>
        </section>

        {/* ── Trusted MAC Whitelist ── */}
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

        {/* ── Detection Thresholds ── */}
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

        {/* ── Detection Rules Reference ── */}
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
