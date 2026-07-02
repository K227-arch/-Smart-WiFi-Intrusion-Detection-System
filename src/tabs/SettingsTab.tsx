import {
  Activity,
  CheckCircle2,
  Cpu,
  Link2,
  Lock,
  Network,
  Plus,
  RefreshCw,
  Save,
  Shield,
  Signal,
  Trash2,
  Wifi,
  WifiOff,
} from "lucide-react";
import { motion } from "motion/react";
import { useCallback, useEffect, useState } from "react";
import { cn } from "../lib/utils";
import type { EngineConfig, KnownNetwork, NetworkInterface } from "../types";

interface ScannedNetwork {
  ssid: string;
  bssid: string;
  channel: number;
  signal: number;
  security: string;
}

interface SavedProfile {
  ssid: string;
  security: string;
  type: string;
}

interface SettingsTabProps {
  engineConfig: EngineConfig | null;
  onSaveConfig: (cfg: EngineConfig) => void;
}

const DETECTION_RULES = [
  { title: "Rogue AP (Evil Twin)", rule: "IF SSID matches known AND BSSID differs → FLAG as Rogue AP", color: "border-rose-500/30 bg-rose-500/5" },
  { title: "Deauth Flood Attack", rule: "IF Deauth packets ≥ threshold within window → FLAG as DoS", color: "border-orange-500/30 bg-orange-500/5" },
  { title: "MAC Spoofing", rule: "IF known SSID from new/unknown BSSID → FLAG as MAC Spoofing", color: "border-purple-500/30 bg-purple-500/5" },
  { title: "Channel Anomaly", rule: "IF known BSSID on different channel → FLAG as anomaly", color: "border-amber-500/30 bg-amber-500/5" },
  { title: "Unauthorized Device", rule: "IF MAC not in trusted whitelist → FLAG device", color: "border-amber-500/30 bg-amber-500/5" },
];

function InterfaceTypeIcon({ type }: { type: NetworkInterface["type"] }) {
  if (type === "wifi") return <Wifi className="w-3.5 h-3.5 text-amber-400" />;
  if (type === "ethernet") return <Network className="w-3.5 h-3.5 text-emerald-400" />;
  return <Cpu className="w-3.5 h-3.5 text-slate-500" />;
}

function InterfaceTypeBadge({ type }: { type: NetworkInterface["type"] }) {
  const styles: Record<NetworkInterface["type"], string> = {
    wifi: "bg-amber-500/15 text-amber-400 border-amber-500/30",
    ethernet: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    loopback: "bg-slate-700 text-slate-500 border-slate-600",
    virtual: "bg-slate-700 text-slate-500 border-slate-600",
    unknown: "bg-slate-700 text-slate-400 border-slate-600",
  };
  return (
    <span className={cn("px-1.5 py-0.5 rounded border text-[9px] font-bold uppercase", styles[type])}>
      {type}
    </span>
  );
}

function SignalBars({ signal }: { signal: number }) {
  return (
    <div className="flex items-end gap-[2px] h-4 shrink-0">
      <div className={cn("w-[3px] rounded-sm", signal >= 20 ? "bg-amber-500 h-1" : "bg-slate-700 h-1")} />
      <div className={cn("w-[3px] rounded-sm", signal >= 40 ? "bg-amber-500 h-2" : "bg-slate-700 h-2")} />
      <div className={cn("w-[3px] rounded-sm", signal >= 60 ? "bg-amber-500 h-3" : "bg-slate-700 h-3")} />
      <div className={cn("w-[3px] rounded-sm", signal >= 80 ? "bg-amber-500 h-4" : "bg-slate-700 h-4")} />
    </div>
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

  // WiFi scan state
  const [scannedNetworks, setScannedNetworks] = useState<ScannedNetwork[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);

  // Saved profiles (previously connected)
  const [savedProfiles, setSavedProfiles] = useState<SavedProfile[]>([]);
  const [profilesLoading, setProfilesLoading] = useState(false);

  // Connect state
  const [connectingTo, setConnectingTo] = useState<string | null>(null);
  const [connectedSsid, setConnectedSsid] = useState<string | null>(null);
  const [connectMsg, setConnectMsg] = useState<{ ssid: string; msg: string; ok: boolean } | null>(null);
  const [passwordPrompt, setPasswordPrompt] = useState<{ ssid: string; bssid: string } | null>(null);
  const [passwordInput, setPasswordInput] = useState("");

  // Network interface state
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([]);
  const [activeCapture, setActiveCapture] = useState<string>("");
  const [captureMode, setCaptureMode] = useState<string>("");
  const [ifaceLoading, setIfaceLoading] = useState(false);
  const [ifaceMsg, setIfaceMsg] = useState<string | null>(null);

  const scanWifi = useCallback(async () => {
    setScanning(true);
    setScanError(null);
    try {
      const res = await fetch("/api/network/scan-wifi");
      const data = await res.json();
      if (data.error) setScanError(data.error);
      const nets: ScannedNetwork[] = data.networks ?? [];
      setScannedNetworks(nets);
      // Detect currently connected network from scan results
      const connected = nets.find(n => n.security === "Connected");
      if (connected) setConnectedSsid(connected.ssid);
    } catch {
      setScanError("Failed to scan networks");
    }
    setScanning(false);
  }, []);

  const fetchProfiles = useCallback(async () => {
    setProfilesLoading(true);
    try {
      const res = await fetch("/api/network/saved-profiles");
      const data = await res.json();
      setSavedProfiles(data.profiles ?? []);
    } catch { /* ignore */ }
    setProfilesLoading(false);
  }, []);

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

  // Auto-load on mount
  useEffect(() => { scanWifi(); }, [scanWifi]);
  useEffect(() => { fetchProfiles(); }, [fetchProfiles]);
  useEffect(() => { fetchInterfaces(); }, [fetchInterfaces]);

  // Auto-refresh WiFi scan every 30 seconds
  useEffect(() => {
    const interval = setInterval(scanWifi, 30000);
    return () => clearInterval(interval);
  }, [scanWifi]);

  const connectToNetwork = async (ssid: string, password?: string) => {
    setConnectingTo(ssid);
    setConnectMsg(null);
    try {
      const res = await fetch("/api/network/connect", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ssid, password }),
      });
      const data = await res.json();
      if (data.success) {
        setConnectMsg({ ssid, msg: data.message, ok: true });
        setConnectedSsid(ssid);
        // Refresh networks after connecting
        setTimeout(() => { scanWifi(); fetchProfiles(); }, 3000);
      } else {
        setConnectMsg({ ssid, msg: data.error || "Failed to connect", ok: false });
      }
    } catch (e: any) {
      setConnectMsg({ ssid, msg: "Connection failed", ok: false });
    }
    setConnectingTo(null);
    setPasswordPrompt(null);
    setPasswordInput("");
    setTimeout(() => setConnectMsg(null), 5000);
  };

  const handleConnectClick = (net: ScannedNetwork) => {
    // If it's a saved profile, connect directly
    const isSaved = savedProfiles.some(p => p.ssid === net.ssid);
    if (isSaved || net.security === "Open" || net.security === "Connected") {
      connectToNetwork(net.ssid);
    } else {
      // Prompt for password
      setPasswordPrompt({ ssid: net.ssid, bssid: net.bssid });
      setPasswordInput("");
    }
  };

  const addScannedNetwork = (net: ScannedNetwork) => {
    if (networks.some(n => n.bssid === net.bssid)) return;
    setNetworks(prev => [...prev, { ssid: net.ssid, bssid: net.bssid, channel: net.channel }]);
  };

  const isAlreadyAdded = (bssid: string) => networks.some(n => n.bssid === bssid);

  const selectInterface = async (name: string) => {
    try {
      const res = await fetch("/api/network/interfaces/select", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      setIfaceMsg(data.message ?? "Interface saved — restart to apply.");
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

        {/* ── Connected Network ── */}
        {connectedSsid && (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Wifi className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-widest">Connected Network</h3>
            </div>
            <div className="flex items-center gap-3 px-4 py-3 bg-emerald-500/5 border border-emerald-500/30 rounded-lg">
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <Wifi className="w-4 h-4 text-emerald-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="text-sm font-bold text-white block">{connectedSsid}</span>
                <span className="text-[9px] text-emerald-400/70 font-mono">SALAMANDA IDS is monitoring this network</span>
              </div>
              <span className="px-2.5 py-1 rounded-md bg-emerald-500/20 border border-emerald-500/30 text-[9px] font-bold text-emerald-400 uppercase">
                Connected
              </span>
            </div>
          </section>
        )}

        {/* ── Known Networks (Previously Connected + Manual) ── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Signal className="w-4 h-4 text-amber-500" />
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-widest">Known Networks</h3>
            </div>
            <button
              onClick={fetchProfiles}
              disabled={profilesLoading}
              className="p-1.5 text-slate-500 hover:text-amber-400 transition-colors"
              title="Refresh saved profiles"
            >
              <RefreshCw className={cn("w-3.5 h-3.5", profilesLoading && "animate-spin")} />
            </button>
          </div>
          <p className="text-[10px] text-slate-500">
            Networks previously connected to on this device. These are monitored by SALAMANDA IDS. Click connect to reconnect.
          </p>

          {/* Saved profiles list */}
          {savedProfiles.length > 0 && (
            <div className="space-y-1.5">
              {savedProfiles.map((profile) => {
                const isConnecting = connectingTo === profile.ssid;
                return (
                  <div
                    key={profile.ssid}
                    className="flex items-center gap-3 px-3 py-2.5 bg-slate-950 border border-slate-800 rounded-lg hover:border-slate-700 transition-colors"
                  >
                    <Wifi className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="text-[11px] font-bold text-white truncate block">{profile.ssid}</span>
                      <span className="text-[9px] text-slate-500">{profile.security}</span>
                    </div>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400 font-bold uppercase">
                      Saved
                    </span>
                    <button
                      onClick={() => connectToNetwork(profile.ssid)}
                      disabled={isConnecting}
                      className={cn(
                        "flex items-center gap-1 px-2 py-1 rounded text-[9px] font-bold transition-colors",
                        isConnecting
                          ? "bg-slate-800 text-slate-500 cursor-wait"
                          : "bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 text-violet-400"
                      )}
                    >
                      <Link2 className="w-3 h-3" />
                      {isConnecting ? "..." : "Connect"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {savedProfiles.length === 0 && !profilesLoading && (
            <p className="text-[10px] text-slate-600 italic">No saved WiFi profiles found.</p>
          )}
        </section>

        {/* ── Available WiFi Networks ── */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wifi className="w-4 h-4 text-violet-400" />
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-widest">Networks</h3>
            </div>
            <button
              onClick={scanWifi}
              disabled={scanning}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[9px] font-bold text-violet-400 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 rounded transition-colors"
            >
              <RefreshCw className={cn("w-3 h-3", scanning && "animate-spin")} />
              {scanning ? "Scanning..." : "Scan"}
            </button>
          </div>
          <p className="text-[10px] text-slate-500">
            All WiFi networks visible to this device. Connect to monitor with SALAMANDA IDS.
          </p>

          {/* Password prompt modal */}
          {passwordPrompt && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-4 bg-slate-950 border border-amber-500/30 rounded-lg space-y-3"
            >
              <div className="flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-bold text-white">Connect to &quot;{passwordPrompt.ssid}&quot;</span>
              </div>
              <div className="flex gap-2">
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && passwordInput && connectToNetwork(passwordPrompt.ssid, passwordInput)}
                  placeholder="Enter WiFi password"
                  className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs font-mono text-slate-200 focus:outline-none focus:border-amber-500 placeholder:text-slate-600"
                  autoFocus
                />
                <button
                  onClick={() => connectToNetwork(passwordPrompt.ssid, passwordInput)}
                  disabled={!passwordInput}
                  className="px-3 py-2 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 disabled:cursor-not-allowed rounded text-xs font-bold text-white transition-colors"
                >
                  Connect
                </button>
                <button
                  onClick={() => { setPasswordPrompt(null); setPasswordInput(""); }}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 rounded text-xs font-bold text-slate-400 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          )}

          {/* Connection status message */}
          {connectMsg && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              className={cn(
                "flex items-center gap-2 px-3 py-2 rounded-lg text-[10px]",
                connectMsg.ok
                  ? "bg-emerald-500/10 border border-emerald-500/20 text-emerald-400"
                  : "bg-rose-500/10 border border-rose-500/20 text-rose-400"
              )}
            >
              {connectMsg.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              {connectMsg.msg}
            </motion.div>
          )}

          {scanError && (
            <div className="px-3 py-2 bg-rose-500/10 border border-rose-500/20 rounded-lg text-[10px] text-rose-400">
              {scanError}
            </div>
          )}

          {scannedNetworks.length === 0 && !scanning && !scanError && (
            <p className="text-[10px] text-slate-600 italic px-1">No WiFi networks detected. Ensure WiFi is enabled.</p>
          )}

          <div className="space-y-1.5 max-h-72 overflow-y-auto custom-scrollbar">
            {scannedNetworks.map((net) => {
              const added = isAlreadyAdded(net.bssid);
              const isConnecting = connectingTo === net.ssid;
              return (
                <div
                  key={net.bssid}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors",
                    net.security === "Connected"
                      ? "bg-emerald-500/5 border-emerald-500/30"
                      : "bg-slate-950 border-slate-800 hover:border-slate-700"
                  )}
                >
                  <SignalBars signal={net.signal} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[11px] font-bold text-white truncate">{net.ssid || "(Hidden)"}</span>
                      {net.security === "Connected" && (
                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 font-bold uppercase">Connected</span>
                      )}
                      <span className="text-[9px] px-1.5 py-0.5 rounded border bg-slate-800 border-slate-700 text-slate-400 font-mono shrink-0">
                        Ch {net.channel}
                      </span>
                      <span className="text-[9px] px-1.5 py-0.5 rounded border bg-slate-800 border-slate-700 text-slate-500 font-mono shrink-0">
                        {net.security !== "Connected" ? net.security : ""}
                      </span>
                    </div>
                    <span className="text-[9px] text-slate-500 font-mono">{net.bssid}</span>
                  </div>
                  <span className="text-[9px] text-slate-400 font-mono shrink-0">{net.signal}%</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {net.security === "Connected" || connectedSsid === net.ssid ? (
                      <span className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/15 border border-emerald-500/30 rounded">
                        <CheckCircle2 className="w-3 h-3" /> Connected
                      </span>
                    ) : (
                      <button
                        onClick={() => handleConnectClick(net)}
                        disabled={isConnecting}
                        className={cn(
                          "flex items-center gap-1 px-2 py-1 rounded text-[9px] font-bold transition-colors",
                          isConnecting
                            ? "bg-slate-800 text-slate-500 cursor-wait"
                            : "bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/30 text-violet-400"
                        )}
                      >
                        <Link2 className="w-3 h-3" />
                        {isConnecting ? "..." : "Connect"}
                      </button>
                    )}
                    {!added ? (
                      <button
                        onClick={() => addScannedNetwork(net)}
                        className="flex items-center gap-1 px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 rounded text-[9px] font-bold text-amber-400 transition-colors"
                        title="Add to Known Networks"
                      >
                        <Plus className="w-3 h-3" />
                      </button>
                    ) : (
                      <span className="flex items-center gap-1 px-2 py-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 rounded">
                        <CheckCircle2 className="w-3 h-3" />
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Capture Interface ── */}
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
            Select the network interface SALAMANDA monitors. Changes take effect on next restart.
          </p>
          <div className="flex items-center gap-3 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg">
            <div className={cn("w-2 h-2 rounded-full shrink-0", captureMode === "live" ? "bg-emerald-500 animate-pulse" : "bg-amber-400 animate-pulse")} />
            <span className="text-[10px] text-slate-400 font-mono">
              Active: <span className="text-white font-bold">{activeCapture || "—"}</span>
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

        {/* ── Trusted MAC Whitelist ── */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-emerald-500" />
            <h3 className="text-sm font-bold text-slate-200 uppercase tracking-widest">Trusted MAC Whitelist</h3>
          </div>
          <p className="text-[10px] text-slate-500">
            Devices on this list will not trigger Unauthorized Device alerts.
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
              <label className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Deauth Threshold</label>
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
