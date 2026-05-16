/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from "react";
import { 
  Shield, 
  AlertTriangle, 
  Wifi, 
  Cpu, 
  Activity, 
  Lock, 
  Users, 
  History, 
  RefreshCcw, 
  BrainCircuit,
  Settings as SettingsIcon,
  ShieldCheck,
  ShieldAlert,
  Menu,
  X,
  Save,
  RotateCcw
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { 
  AreaChart,
  Area,
  Tooltip, 
  ResponsiveContainer
} from "recharts";
import { format } from "date-fns";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { GoogleGenAI } from "@google/genai";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
interface Alert {
  id: string;
  timestamp: number;
  type: "ROGUE_AP" | "DEAUTH_ATTACK" | "MAC_SPOOFING" | "UNAUTHORIZED_DEVICE";
  severity: "high" | "medium" | "low";
  description: string;
  targetMac: string;
  details: any;
}

interface Device {
  mac: string;
  lastSeen: number;
  status: "trusted" | "unknown" | "blocked";
  firstSeen: number;
  ssid?: string;
  avgSignal: number;
}

interface WiFiPacket {
  timestamp: number;
  ssid?: string;
  bssid: string;
  sourceMac: string;
  destMac?: string;
  type: "data" | "mgmt" | "beacons" | "deauth";
  signalStrength: number;
  channel: number;
}

export default function App() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<"dashboard" | "alerts" | "devices" | "traffic" | "settings">("dashboard");
  const [selectedDeviceDetails, setSelectedDeviceDetails] = useState<Device | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [customPrompt, setCustomPrompt] = useState<string>(`
You are a cybersecurity expert analyzing logs from a Wireless Intrusion Detection System (WIDS).
Current Alerts: {{ALERTS}}
Current Network Density: {{DEVICES}} devices detected.

Provide a concise security posture assessment and 3 actionable recommendations for the network administrator.
Keep it professional and technical but accessible. Format in Markdown.
  `.trim());

  // Gemini Initialization
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [alertsRes, devicesRes] = await Promise.all([
          fetch("/api/alerts"),
          fetch("/api/devices")
        ]);
        
        setAlerts(await alertsRes.json());
        setDevices(await devicesRes.json());
      } catch (e) {
        console.error("Fetch error", e);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 3000);
    return () => clearInterval(interval);
  }, []);

  const runAiAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const prompt = customPrompt
        .replace("{{ALERTS}}", JSON.stringify(alerts.slice(0, 10)))
        .replace("{{DEVICES}}", devices.length.toString());

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
      });

      setAiAnalysis(response.text || "No analysis generated.");
    } catch (e) {
      console.error("Gemini Error", e);
      setAiAnalysis("Error running analysis. Check API key in Settings > Secrets.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const highSeverityAlerts = alerts.filter(a => a.severity === "high");

  const toggleTab = (tab: any) => {
    setSelectedTab(tab);
    setIsMenuOpen(false);
  };

  const updateDeviceStatus = async (mac: string, status: "trusted" | "blocked" | "unknown") => {
    try {
      await fetch(`/api/devices/${mac}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      // Refresh local state immediately for better UX
      setDevices(prev => prev.map(d => d.mac === mac ? { ...d, status } : d));
    } catch (e) {
      console.error("Update device status error", e);
    }
  };

  return (
    <div className="h-screen w-full bg-slate-950 text-slate-300 font-sans flex flex-col overflow-hidden select-none">
      {/* Header Navigation */}
      <nav className="h-16 border-b border-slate-800 bg-slate-900/50 px-4 md:px-6 flex items-center justify-between shrink-0 z-50">
        <div className="flex items-center gap-3">
          <button 
            onClick={() => setIsMenuOpen(!isMenuOpen)}
            className="p-2 md:hidden text-slate-400 hover:text-white"
          >
            {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
          <div className="w-8 h-8 bg-sky-500 rounded flex items-center justify-center shrink-0">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <span className="text-lg md:text-xl font-bold tracking-tight text-white hidden sm:block">SMART<span className="text-sky-500">WIDS</span></span>
          <span className="hidden lg:block ml-4 px-2 py-1 text-[10px] font-mono bg-slate-800 rounded border border-slate-700 text-sky-400">v1.0.4-STABLE</span>
        </div>

        <div className="flex items-center gap-2 md:gap-6">
          <div className="hidden md:flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
            <span className="text-xs font-medium uppercase tracking-wider text-emerald-500">Active</span>
          </div>
          <div className="hidden md:block h-4 w-[1px] bg-slate-800"></div>
          <div className="flex items-center gap-2 md:gap-3">
             <button 
                onClick={runAiAnalysis}
                disabled={isAnalyzing}
                className="flex items-center gap-2 px-2 md:px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[10px] md:text-xs font-medium transition-colors whitespace-nowrap"
              >
                <BrainCircuit className={cn("w-3 md:w-3.5 h-3 md:h-3.5 text-sky-400", isAnalyzing && "animate-spin")} />
                <span className="hidden xs:inline">AI Insight</span>
              </button>
            <div className="text-right hidden xs:block">
              <div className="text-[10px] uppercase text-slate-500 leading-none">Intf</div>
              <div className="text-[10px] md:text-xs font-mono text-slate-300">wlan0</div>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content Layout */}
      <main className="flex-1 flex flex-col lg:grid lg:grid-cols-12 gap-0 overflow-hidden relative">
        
        {/* Sidebar Controls - Drawer on mobile */}
        <aside className={cn(
          "absolute lg:relative lg:col-span-2 border-r border-slate-800 bg-slate-900/95 lg:bg-slate-900/30 p-4 space-y-6 flex flex-col h-full z-40 transition-transform duration-300 ease-in-out w-64 lg:w-auto",
          isMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}>
          <div>
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 font-mono">Core Modules</h3>
            <div className="space-y-1">
              <NavButton active={selectedTab === "dashboard"} onClick={() => toggleTab("dashboard")}>Dashboard</NavButton>
              <NavButton active={selectedTab === "traffic"} onClick={() => toggleTab("traffic")}>Live Traffic</NavButton>
              <NavButton active={selectedTab === "devices"} onClick={() => toggleTab("devices")}>Device Registry</NavButton>
              <NavButton active={selectedTab === "alerts"} onClick={() => toggleTab("alerts")}>Forensic Logs</NavButton>
              <NavButton active={selectedTab === "settings"} onClick={() => toggleTab("settings")}>
                <div className="flex justify-between items-center w-full">
                  <span>Settings</span>
                  <SettingsIcon className="w-3.5 h-3.5" />
                </div>
              </NavButton>
            </div>
          </div>
          
          <div className="pt-6 border-t border-slate-800 hidden lg:block">
            <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 font-mono">Real-time Metrics</h3>
            <div className="space-y-4">
              <SidebarStat label="Infection Rate" value="0.0%" progress={2} />
              <SidebarStat label="Threat Neutralized" value="100%" progress={100} />
              <SidebarStat label="Accuracy" value="98.2%" progress={98} color="bg-emerald-500" />
            </div>
          </div>

          <div className="flex-1" />
          
          <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-800">
            <p className="text-[10px] text-slate-500 leading-relaxed italic">"Intelligent detection for resilient wireless environments."</p>
          </div>
        </aside>

        {/* Overlay for mobile drawer */}
        {isMenuOpen && (
          <div 
            className="absolute inset-0 bg-black/50 backdrop-blur-sm z-30 lg:hidden"
            onClick={() => setIsMenuOpen(false)}
          />
        )}

        {/* Center Dashboard */}
        <section className="flex-1 lg:col-span-7 p-4 md:p-6 overflow-y-auto lg:overflow-hidden flex flex-col gap-6 custom-scrollbar">
          <AnimatePresence mode="wait">
            {selectedTab === "dashboard" && (
              <motion.div 
                key="dash" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="flex flex-col gap-6 h-full"
              >
                {/* Top KPI Row */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 shrink-0">
                  <KpiCard label="Active Devices" value={devices.length} color="text-white" trend="+3 Since last scan" trendColor="text-emerald-400" />
                  <KpiCard label="Rogue APs" value={alerts.filter(a => a.type === 'ROGUE_AP').length} color="text-rose-500" trend="FLAGGED: HIGH RISK" trendColor="text-rose-400" />
                  <KpiCard label="Deauth Events" value={alerts.filter(a => a.type === 'DEAUTH_ATTACK').length} color="text-amber-500" trend="THRESHOLD MONITORING" trendColor="text-amber-400" />
                </div>

                {/* AI / Content Row */}
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-6 shrink-0 h-auto sm:h-48">
                  <div className="sm:col-span-3 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col overflow-hidden h-40 sm:h-auto">
                    <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
                       <Activity className="w-3 h-3 text-sky-500" /> Traffic Load
                    </h4>
                    <div className="flex-1 min-h-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={mockChartData}>
                          <Area type="monotone" dataKey="data" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.1} />
                          <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', fontSize: '10px' }} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                  <div className="sm:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col h-40 sm:h-auto">
                    <h4 className="text-[10px] font-bold text-sky-500 uppercase mb-2 flex items-center gap-2">
                      <BrainCircuit className="w-3 h-3" /> Analysis
                    </h4>
                    <div className="flex-1 overflow-y-auto text-[11px] leading-relaxed text-slate-400 custom-scrollbar pr-1 whitespace-pre-wrap">
                       {aiAnalysis || "Evaluation pending..."}
                    </div>
                  </div>
                </div>

                {/* Active Traffic Registry */}
                <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl flex flex-col overflow-hidden min-h-[300px]">
                  <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/80 flex justify-between items-center shrink-0">
                    <h2 className="text-sm font-semibold text-white uppercase tracking-wider">Inventory</h2>
                    <span className="text-[10px] text-slate-500 font-mono italic">WIDS Engine</span>
                  </div>
                  <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left min-w-[500px]">
                      <thead className="text-[10px] text-slate-500 uppercase border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
                        <tr>
                          <th className="px-4 py-3 font-semibold">MAC Address</th>
                          <th className="px-4 py-3 font-semibold">SSID / Context</th>
                          <th className="px-4 py-3 font-semibold">Signal</th>
                          <th className="px-4 py-3 font-semibold">Status</th>
                        </tr>
                      </thead>
                      <tbody className="text-xs font-mono">
                        {devices.map(device => (
                          <tr key={device.mac} className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors">
                            <td className="px-4 py-3 text-sky-400">{device.mac}</td>
                            <td className="px-4 py-3 text-slate-200">{device.ssid || "[Probe]"}</td>
                            <td className={cn("px-4 py-3 font-bold", device.avgSignal > -60 ? "text-emerald-500" : "text-amber-500")}>
                               {device.avgSignal.toFixed(0)}
                            </td>
                            <td className="px-4 py-3">
                              <span className={cn(
                                "px-2 py-0.5 rounded border text-[9px] font-bold uppercase whitespace-nowrap",
                                device.status === 'trusted' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : 
                                device.status === 'blocked' ? "bg-rose-500/10 text-rose-500 border-rose-500/20" :
                                "bg-slate-800 text-slate-500 border-slate-700"
                              )}>
                                {device.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </motion.div>
            )}

            {selectedTab === "devices" && (
              <motion.div 
                key="devices-view" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-full overflow-hidden"
              >
                <div className="px-6 py-4 border-b border-slate-800">
                  <h2 className="text-lg font-bold text-white uppercase sm:tracking-widest">Identify Registry</h2>
                </div>
                <div className="p-4 md:p-6 grid grid-cols-1 sm:grid-cols-2 gap-4 overflow-y-auto custom-scrollbar">
                   {devices.map(d => (
                     <div 
                       key={d.mac} 
                       onClick={() => setSelectedDeviceDetails(d)}
                       className="p-4 rounded-lg bg-slate-950 border border-slate-800 flex flex-col gap-2 cursor-pointer hover:border-sky-500/50 transition-colors group"
                     >
                        <div className="flex justify-between items-center">
                           <span className="text-xs font-mono text-sky-400">{d.mac}</span>
                           <span className={cn(
                             "px-1.5 py-0.5 rounded-[4px] text-[8px] font-bold uppercase", 
                             d.status === 'trusted' ? 'bg-emerald-500/20 text-emerald-500' : 
                             d.status === 'blocked' ? 'bg-rose-500/20 text-rose-500' :
                             'bg-slate-800 text-slate-500'
                           )}>
                             {d.status}
                           </span>
                        </div>
                        <div className="text-sm font-medium text-slate-200 truncate">{d.ssid || "Unconnected Node"}</div>
                        <div className="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-800/50">
                           <div className="flex flex-col">
                              <span className="text-[8px] text-slate-500 uppercase font-bold tracking-tighter">Engagement</span>
                              <span className="text-[10px] text-slate-300 font-mono">{format(d.firstSeen, 'MMM dd, HH:mm:ss')}</span>
                           </div>
                           <div className="flex flex-col text-right">
                              <span className="text-[8px] text-slate-500 uppercase font-bold tracking-tighter">Last Contact</span>
                              <span className="text-[10px] text-emerald-500 font-mono">{format(d.lastSeen, 'HH:mm:ss')}</span>
                           </div>
                        </div>
                        <div className="flex justify-between text-[9px] text-slate-500 uppercase font-bold mt-2">
                          <span className="flex items-center gap-1"><Wifi className="w-2.5 h-2.5"/> {d.avgSignal.toFixed(0)} dBm</span>
                          <span>{d.ssid || "Unidentified"}</span>
                        </div>
                         <div className="flex gap-2 mt-2">
                           <button 
                             onClick={(e) => {
                               e.stopPropagation();
                               updateDeviceStatus(d.mac, d.status === 'trusted' ? 'unknown' : 'trusted');
                             }}
                             className={cn(
                               "flex-1 text-[10px] font-bold py-1.5 rounded transition-colors uppercase tracking-wider",
                               d.status === 'trusted' ? "bg-slate-800 text-slate-400 hover:bg-slate-700" : "bg-sky-500/10 text-sky-400 hover:bg-sky-500/20 border border-sky-500/20"
                             )}
                           >
                             {d.status === 'trusted' ? 'Revoke Trust' : 'Trust Device'}
                           </button>
                           <button 
                             onClick={(e) => {
                               e.stopPropagation();
                               updateDeviceStatus(d.mac, d.status === 'blocked' ? 'unknown' : 'blocked');
                             }}
                             className={cn(
                               "px-3 text-[10px] font-bold py-1.5 rounded transition-colors uppercase tracking-wider",
                               d.status === 'blocked' ? "bg-rose-500 text-white" : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                             )}
                           >
                             {d.status === 'blocked' ? 'Unblock' : 'Block'}
                           </button>
                        </div>
                     </div>
                   ))}
                </div>
              </motion.div>
            )}

            {selectedTab === "alerts" && (
              <motion.div 
                 key="alerts-view" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                 className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-full overflow-hidden"
              >
                <div className="px-6 py-4 border-b border-slate-800">
                  <h2 className="text-lg font-bold text-white uppercase tracking-wider">Forensic Logs</h2>
                </div>
                <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar">
                   <table className="w-full text-left min-w-[600px]">
                     <thead className="text-[10px] text-slate-600 uppercase border-b border-slate-800 sticky top-0 bg-slate-900">
                        <tr>
                          <th className="px-6 py-3">Event</th>
                          <th className="px-6 py-3 text-center">Severity</th>
                          <th className="px-6 py-3">Timestamp</th>
                        </tr>
                     </thead>
                     <tbody className="text-xs text-slate-400">
                        {alerts.map(a => (
                          <tr key={a.id} className="border-b border-slate-800/50">
                             <td className="px-6 py-4">
                                <div className="font-semibold text-slate-200">{a.type}</div>
                                <div className="text-[10px] text-slate-500 mt-0.5 italic">{a.description}</div>
                             </td>
                             <td className="px-6 py-4 text-center">
                               <span className={cn(
                                 "px-2 py-1 rounded text-[9px] font-bold uppercase",
                                 a.severity === 'high' ? 'bg-rose-500/20 text-rose-500 border border-rose-500/30' : 'bg-amber-500/20 text-amber-500 border border-amber-500/30'
                               )}>
                                 {a.severity}
                               </span>
                             </td>
                             <td className="px-6 py-4 font-mono text-slate-500 text-[10px]">{format(a.timestamp, 'HH:mm:ss')}</td>
                          </tr>
                        ))}
                     </tbody>
                   </table>
                </div>
              </motion.div>
            )}

            {selectedTab === "traffic" && (
              <LiveTrafficTab />
            )}

            {selectedTab === "settings" && (
              <motion.div 
                key="settings-view" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
                className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-full overflow-hidden"
              >
                <div className="px-6 py-4 border-b border-slate-800">
                  <h2 className="text-lg font-bold text-white uppercase tracking-wider">AI Configuration</h2>
                </div>
                <div className="p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <h3 className="text-sm font-bold text-slate-200 uppercase tracking-widest">Cognitive Prompt</h3>
                        <p className="text-[10px] text-slate-500 mt-1 uppercase font-mono tracking-tighter italic">Customize the logic used for security posture evaluation</p>
                      </div>
                      <button 
                        onClick={() => setCustomPrompt(`
You are a cybersecurity expert analyzing logs from a Wireless Intrusion Detection System (WIDS).
Current Alerts: {{ALERTS}}
Current Network Density: {{DEVICES}} devices detected.

Provide a concise security posture assessment and 3 actionable recommendations for the network administrator.
Keep it professional and technical but accessible. Format in Markdown.
                        `.trim())}
                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[10px] font-bold text-slate-400 transition-colors"
                      >
                        <RotateCcw className="w-3 h-3" /> Reset Default
                      </button>
                    </div>
                    
                    <div className="relative">
                      <textarea 
                        value={customPrompt}
                        onChange={(e) => setCustomPrompt(e.target.value)}
                        className="w-full h-64 bg-slate-950 border border-slate-800 rounded-lg p-4 text-xs font-mono text-sky-400 focus:outline-none focus:border-sky-500/50 custom-scrollbar resize-none"
                      />
                      <div className="absolute bottom-3 right-3 flex items-center gap-2 px-2 py-1 bg-slate-900/80 rounded border border-slate-700 text-[10px] text-slate-500 font-mono">
                         <Activity className="w-3 h-3 text-emerald-500" /> Dynamic Injection Active
                      </div>
                    </div>

                    <div className="p-4 bg-slate-800/20 border border-slate-800 rounded-lg space-y-3">
                      <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
                        <History className="w-3 h-3" /> Available Injection Tokens
                      </h4>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <code className="text-sky-400 text-[10px] b-1 px-1 bg-slate-900">{"{{ALERTS}}"}</code>
                          <p className="text-[9px] text-slate-500 leading-tight">Last 10 security alerts serialized in JSON</p>
                        </div>
                        <div className="space-y-1">
                          <code className="text-sky-400 text-[10px] b-1 px-1 bg-slate-900">{"{{DEVICES}}"}</code>
                          <p className="text-[9px] text-slate-500 leading-tight">Raw count of active network identities</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        {/* Right Alert Feed - Stacks on mobile or drawer? Let's hide on small screens or move to bottom */}
        <section className="hidden lg:flex lg:col-span-3 border-l border-slate-800 bg-slate-900/50 p-4 flex-col overflow-hidden">
          <h2 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 font-mono">Incident Timeline</h2>
          <div className="flex-1 space-y-4 overflow-y-auto custom-scrollbar pr-2">
            {alerts.slice(0, 10).map(alert => (
              <div key={alert.id} className={cn(
                "p-3 rounded-lg border",
                alert.severity === 'high' ? "bg-rose-500/10 border-rose-500/30" : "bg-amber-500/10 border-amber-500/30"
              )}>
                <div className="flex justify-between items-start mb-1">
                  <span className={cn("text-[10px] font-bold uppercase", alert.severity === 'high' ? "text-rose-500" : "text-amber-500")}>
                    {alert.severity === 'high' ? "Critical Alert" : "Warning"}
                  </span>
                  <span className="text-[9px] text-slate-500 font-mono">{format(alert.timestamp, 'HH:mm:ss')}</span>
                </div>
                <div className={cn("text-sm font-medium", alert.severity === 'high' ? "text-rose-200" : "text-amber-200")}>{alert.type.replace('_', ' ')}</div>
                <div className={cn("text-[10px] mt-1 italic", alert.severity === 'high' ? "text-rose-300/70" : "text-amber-300/70")}>
                  Target: {alert.targetMac}
                </div>
              </div>
            ))}

            {alerts.length === 0 && (
              <div className="text-center py-12 text-slate-600 italic text-xs">No active threats discovered.</div>
            )}
          </div>
          
          <div className="mt-4 pt-4 border-t border-slate-800 text-center shrink-0">
            <p className="text-[9px] text-slate-600">Designed for SMEs and Institutions</p>
            <p className="text-[9px] text-slate-500 uppercase tracking-tighter mt-1 font-bold italic underline decoration-sky-800 underline-offset-2">Lightweight • Affordable • Secure</p>
          </div>
        </section>
      </main>

      {/* Device Details Modal */}
      <AnimatePresence>
        {selectedDeviceDetails && (
          <>
            <motion.div 
               initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
               onClick={() => setSelectedDeviceDetails(null)}
               className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[60] flex items-center justify-center p-4"
            >
               <motion.div 
                 initial={{ scale: 0.95, opacity: 0, y: 20 }}
                 animate={{ scale: 1, opacity: 1, y: 0 }}
                 exit={{ scale: 0.95, opacity: 0, y: 20 }}
                 onClick={(e) => e.stopPropagation()}
                 className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl"
               >
                 <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center">
                    <h3 className="text-white font-bold uppercase tracking-widest flex items-center gap-2">
                       <Shield className="w-4 h-4 text-sky-500" /> Identity Inspector
                    </h3>
                    <button 
                      onClick={() => setSelectedDeviceDetails(null)}
                      className="p-1 hover:bg-slate-800 rounded-md transition-colors"
                    >
                      <X className="w-5 h-5 text-slate-500" />
                    </button>
                 </div>

                 <div className="p-6 space-y-6">
                    <div className="flex flex-col items-center justify-center py-4 bg-slate-950/50 rounded-xl border border-slate-800/50">
                       <div className="w-16 h-16 bg-sky-500/10 rounded-full flex items-center justify-center mb-4 ring-1 ring-sky-500/20">
                          <Wifi className="w-8 h-8 text-sky-500" />
                       </div>
                       <div className="text-xl font-mono font-bold text-white tracking-widest">{selectedDeviceDetails.mac}</div>
                       <div className={cn(
                         "mt-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest",
                         selectedDeviceDetails.status === 'trusted' ? 'bg-emerald-500/20 text-emerald-500' :
                         selectedDeviceDetails.status === 'blocked' ? 'bg-rose-500/20 text-rose-500' :
                         'bg-slate-500/20 text-slate-400'
                       )}>
                         {selectedDeviceDetails.status} Identity
                       </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                       <DetailItem label="Primary SSID" value={selectedDeviceDetails.ssid || "Hidden/Broadcast Proxy"} />
                       <DetailItem label="Signal Intensity" value={`${selectedDeviceDetails.avgSignal.toFixed(1)} dBm`} color={selectedDeviceDetails.avgSignal > -60 ? "text-emerald-500" : "text-amber-500"} />
                       <DetailItem label="First Observation" value={format(selectedDeviceDetails.firstSeen, 'MMM dd, yyyy HH:mm:ss')} />
                       <DetailItem label="Last Active Signal" value={format(selectedDeviceDetails.lastSeen, 'MMM dd, yyyy HH:mm:ss')} />
                    </div>

                    <div className="pt-4 border-t border-slate-800">
                       <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-3">Security Actions</div>
                       <div className="flex gap-3">
                          <button 
                            onClick={() => {
                              updateDeviceStatus(selectedDeviceDetails.mac, selectedDeviceDetails.status === 'trusted' ? 'unknown' : 'trusted');
                              setSelectedDeviceDetails(prev => prev ? { ...prev, status: selectedDeviceDetails.status === 'trusted' ? 'unknown' : 'trusted' } : null);
                            }}
                            className={cn(
                              "flex-1 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all",
                              selectedDeviceDetails.status === 'trusted' ? "bg-slate-800 text-slate-400" : "bg-sky-500 text-white shadow-lg shadow-sky-500/20"
                            )}
                          >
                             {selectedDeviceDetails.status === 'trusted' ? 'Revoke Trust' : 'Sanctify Device'}
                          </button>
                          <button 
                             onClick={() => {
                              updateDeviceStatus(selectedDeviceDetails.mac, selectedDeviceDetails.status === 'blocked' ? 'unknown' : 'blocked');
                              setSelectedDeviceDetails(prev => prev ? { ...prev, status: selectedDeviceDetails.status === 'blocked' ? 'unknown' : 'blocked' } : null);
                            }}
                            className={cn(
                              "flex-1 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-all",
                              selectedDeviceDetails.status === 'blocked' ? "bg-rose-500 text-white shadow-lg shadow-rose-500/20" : "bg-slate-800 text-slate-400"
                            )}
                          >
                             {selectedDeviceDetails.status === 'blocked' ? 'Whitelist (Unblock)' : 'Quarantine (Block)'}
                          </button>
                       </div>
                    </div>
                 </div>

                 <div className="px-6 py-4 bg-slate-950/50 border-t border-slate-800 text-center">
                    <p className="text-[9px] text-slate-500 uppercase font-bold tracking-tighter italic">Cognitive Analysis active for this node</p>
                 </div>
               </motion.div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* System Footer Bar */}
      <footer className="h-8 bg-slate-900 border-t border-slate-800 px-4 flex items-center justify-between text-[10px] text-slate-500 font-mono shrink-0">
        <div className="flex gap-4">
          <span className="hidden xs:inline">CPU: 12%</span>
          <span className="hidden xs:inline">RAM: 242MB</span>
          <span className="xs:hidden">SYS: OK</span>
        </div>
        <div className="flex gap-4">
          <span className="text-emerald-500 font-bold uppercase hidden sm:inline">Engine Active</span>
          <span className="text-sky-500 font-bold uppercase whitespace-nowrap">v22.1.0</span>
        </div>
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(51, 65, 85, 0.5); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(51, 65, 85, 0.8); }
        @media (max-width: 640px) {
           .xs\\:hidden { display: none; }
           .xs\\:inline { display: inline; }
           .xs\\:block { display: block; }
        }
      `}</style>
    </div>
  );
}

function LiveTrafficTab() {
  const [packets, setPackets] = useState<WiFiPacket[]>([]);
  const [expandedPacketId, setExpandedPacketId] = useState<string | null>(null);
  const [stats, setStats] = useState({
    total: 0,
    data: 0,
    mgmt: 0,
    beacons: 0,
    deauth: 0,
    totalSignal: 0
  });

  useEffect(() => {
    const eventSource = new EventSource("/api/stream");
    
    eventSource.onmessage = (event) => {
      const packet = JSON.parse(event.data);
      setPackets(prev => {
        const next = [packet, ...prev];
        return next.slice(0, 50); // Keep last 50
      });

      setStats(prev => ({
        total: prev.total + 1,
        data: packet.type === "data" ? prev.data + 1 : prev.data,
        mgmt: packet.type === "mgmt" ? prev.mgmt + 1 : prev.mgmt,
        beacons: packet.type === "beacons" ? prev.beacons + 1 : prev.beacons,
        deauth: packet.type === "deauth" ? prev.deauth + 1 : prev.deauth,
        totalSignal: prev.totalSignal + packet.signalStrength
      }));
    };

    eventSource.onerror = (err) => {
      console.error("EventSource failed:", err);
      eventSource.close();
    };

    return () => eventSource.close();
  }, []);

  const avgSignal = stats.total > 0 ? stats.totalSignal / stats.total : 0;

  return (
    <motion.div 
      key="traffic-view" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}
      className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-full overflow-hidden"
    >
      <div className="px-6 py-4 border-b border-slate-800 flex justify-between items-center shrink-0">
        <h2 className="text-lg font-bold text-white uppercase tracking-wider">Live Traffic Stream</h2>
        <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-sky-500 animate-pulse" />
            <span className="text-[10px] text-slate-500 uppercase font-bold tracking-widest hidden sm:inline">Active Interception</span>
        </div>
      </div>

      {/* Traffic Stats Header */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-0 border-b border-slate-800 bg-slate-950/30 shrink-0">
        <TrafficStatBox label="Total Packets" value={stats.total} />
        <TrafficStatBox label="DATA" value={stats.data} color="text-sky-500" />
        <TrafficStatBox label="BEACONS" value={stats.beacons} color="text-emerald-500" />
        <TrafficStatBox label="MGMT" value={stats.mgmt} color="text-amber-500" />
        <TrafficStatBox label="DEAUTH" value={stats.deauth} color="text-rose-500" />
        <TrafficStatBox label="Avg Signal" value={`${avgSignal.toFixed(1)} dBm`} color={avgSignal > -60 ? "text-emerald-500" : "text-slate-400"} />
      </div>

      <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar">
         <table className="w-full text-left min-w-[800px]">
           <thead className="text-[10px] text-slate-500 uppercase border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
              <tr>
                <th className="px-6 py-3 font-semibold">Time</th>
                <th className="px-6 py-3 font-semibold">Source MAC</th>
                <th className="px-6 py-3 font-semibold">Destination MAC</th>
                <th className="px-6 py-3 font-semibold text-center">Type</th>
                <th className="px-6 py-3 font-semibold">Sig</th>
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
                          isExpanded && "border-sky-500/30 bg-slate-800/50"
                        )}
                        onClick={() => setExpandedPacketId(isExpanded ? null : packetId)}
                      >
                        <td className="px-6 py-3 text-slate-500">{format(p.timestamp, 'HH:mm:ss.SSS')}</td>
                        <td className="px-6 py-3 text-sky-400 font-bold">{p.sourceMac}</td>
                        <td className="px-6 py-3 text-slate-400 truncate max-w-[150px]">{p.destMac || (p.type === 'beacons' ? 'Broadcast' : '—')}</td>
                        <td className="px-6 py-3 text-center">
                           <span className={cn(
                             "px-1.5 py-0.5 rounded text-[9px] font-bold uppercase",
                             p.type === 'deauth' ? 'bg-rose-500/20 text-rose-500' :
                             p.type === 'mgmt' ? 'bg-amber-500/20 text-amber-500' :
                             p.type === 'beacons' ? 'bg-emerald-500/20 text-emerald-500' :
                             'bg-sky-500/20 text-sky-500'
                           )}>
                             {p.type}
                           </span>
                        </td>
                        <td className={cn("px-6 py-3 font-bold", p.signalStrength > -60 ? "text-emerald-500" : "text-slate-500")}>
                           {p.signalStrength.toFixed(0)}
                        </td>
                        <td className="px-6 py-3 text-right">
                          <button className="p-1 hover:text-sky-400 text-slate-600 transition-colors">
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
                            <td colSpan={6} className="px-6 py-4 border-b border-sky-500/20">
                               <div className="grid grid-cols-4 gap-6">
                                  <div className="space-y-1">
                                     <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">BSSID</div>
                                     <div className="text-xs text-sky-400 font-mono">{p.bssid}</div>
                                  </div>
                                  <div className="space-y-1">
                                     <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Channel</div>
                                     <div className="text-xs text-slate-200 font-mono">{p.channel} (2.4GHz)</div>
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
                               <div className="mt-4 pt-4 border-t border-slate-800/50 flex gap-4">
                                  <div className="text-[9px] text-slate-600 uppercase font-mono">Payload: [ENCAPSULATED 802.11 DATA]</div>
                                  <div className="text-[9px] text-slate-600 uppercase font-mono">Frame Length: 128 Bytes</div>
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
         {packets.length === 0 && (
           <div className="flex flex-col items-center justify-center h-64 opacity-20">
              <RefreshCcw className="w-8 h-8 mb-2 animate-spin" />
              <p className="text-sm italic">Synchronizing with stream...</p>
           </div>
         )}
      </div>
    </motion.div>
  );
}

function NavButton({ active, children, onClick }: any) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full text-left px-3 py-2 rounded-md text-sm font-medium transition-all focus:outline-none",
        active ? "bg-sky-500/10 text-sky-400 border border-sky-500/20" : "text-slate-400 hover:bg-slate-800"
      )}
    >
      {children}
    </button>
  );
}

function KpiCard({ label, value, color, trend, trendColor }: any) {
  return (
    <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl shadow-sm">
      <div className="text-slate-500 text-[9px] uppercase font-bold tracking-wider mb-1">{label}</div>
      <div className={cn("text-xl md:text-2xl font-bold tracking-tight", color)}>{value}</div>
      <div className={cn("text-[8px] md:text-[9px] mt-2 font-mono uppercase font-bold truncate", trendColor)}>{trend}</div>
    </div>
  );
}

function SidebarStat({ label, value, progress, color = "bg-sky-500" }: any) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-end">
        <span className="text-[10px] text-slate-500 uppercase font-bold tracking-tighter">{label}</span>
        <span className="text-xs font-mono text-white leading-none">{value}</span>
      </div>
      <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 1 }}
          className={cn("h-full", color)} 
        />
      </div>
    </div>
  );
}

function TrafficStatBox({ label, value, color = "text-slate-200" }: any) {
  return (
    <div className="px-4 py-3 border-r border-slate-800 last:border-r-0 relative group overflow-hidden">
      <div className="text-[9px] uppercase font-bold text-slate-500 tracking-wider mb-0.5">{label}</div>
      <motion.div 
        key={value}
        initial={{ opacity: 0.5, y: -2 }}
        animate={{ opacity: 1, y: 0 }}
        className={cn("text-sm font-mono font-bold tabular-nums", color)}
      >
        {value}
      </motion.div>
      <motion.div 
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        key={`pulse-${value}`}
        transition={{ duration: 0.3 }}
        className={cn("absolute bottom-0 left-0 right-0 h-[1px] origin-left", color.replace('text-', 'bg-'), "opacity-20")}
      />
    </div>
  );
}

function DetailItem({ label, value, color = "text-slate-200" }: any) {
  return (
    <div className="space-y-1">
      <div className="text-[9px] uppercase font-bold text-slate-500 tracking-widest">{label}</div>
      <div className={cn("text-[11px] font-mono break-all", color)}>{value}</div>
    </div>
  );
}

const mockChartData = [
  { time: '10:00', data: 400, beacons: 240 },
  { time: '10:05', data: 300, beacons: 139 },
  { time: '10:10', data: 200, beacons: 980 },
  { time: '10:15', data: 278, beacons: 390 },
  { time: '10:20', data: 189, beacons: 480 },
  { time: '10:25', data: 239, beacons: 380 },
  { time: '10:30', data: 349, beacons: 430 },
  { time: '10:35', data: 550, beacons: 400 },
  { time: '10:40', data: 400, beacons: 700 },
  { time: '10:45', data: 700, beacons: 300 },
];
