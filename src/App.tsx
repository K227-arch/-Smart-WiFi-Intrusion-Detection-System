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
  Settings,
  ShieldCheck,
  ShieldAlert,
  Menu,
  X
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

export default function App() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<"dashboard" | "alerts" | "devices">("dashboard");
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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
      const prompt = `
        You are a cybersecurity expert analyzing logs from a Wireless Intrusion Detection System (WIDS).
        Current Alerts: ${JSON.stringify(alerts.slice(0, 10))}
        Current Network Density: ${devices.length} devices detected.
        
        Provide a concise security posture assessment and 3 actionable recommendations for the network administrator.
        Keep it professional and technical but accessible. Format in Markdown.
      `;

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
              <NavButton active={selectedTab === "devices"} onClick={() => toggleTab("devices")}>Device Registry</NavButton>
              <NavButton active={selectedTab === "alerts"} onClick={() => toggleTab("alerts")}>Forensic Logs</NavButton>
              <div className="px-3 py-2 hover:bg-slate-800 rounded-md text-sm text-slate-500 cursor-not-allowed flex items-center justify-between">
                <span>Settings</span>
                <Lock className="w-3 h-3" />
              </div>
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
                                "px-2 py-0.5 rounded border text-[9px] font-bold uppercase",
                                device.status === 'trusted' ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-slate-800 text-slate-500 border-slate-700"
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
                     <div key={d.mac} className="p-4 rounded-lg bg-slate-950 border border-slate-800 flex flex-col gap-2">
                        <div className="flex justify-between items-center">
                           <span className="text-xs font-mono text-sky-400">{d.mac}</span>
                           <span className={cn("px-1.5 py-0.5 rounded-[4px] text-[8px] font-bold uppercase", d.status === 'trusted' ? 'bg-emerald-500/20 text-emerald-500' : 'bg-slate-800 text-slate-500')}>
                             {d.status}
                           </span>
                        </div>
                        <div className="text-sm font-medium text-slate-200 truncate">{d.ssid || "Unconnected Node"}</div>
                        <div className="flex justify-between text-[10px] text-slate-500 uppercase mt-2">
                          <span>Seen: {format(d.firstSeen, 'HH:mm')}</span>
                          <span>Sig: {d.avgSignal.toFixed(0)}</span>
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
