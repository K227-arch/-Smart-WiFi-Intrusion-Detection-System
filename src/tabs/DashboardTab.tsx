import { Activity, BrainCircuit } from "lucide-react";
import { motion } from "motion/react";
import { format } from "date-fns";
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
import { cn, mockChartData } from "../lib/utils";
import type { Alert, Device, SystemStatus, TrafficBucket } from "../types";
import { KpiCard } from "../components/ui/KpiCard";

export interface DashboardTabProps {
  alerts: Alert[];
  devices: Device[];
  status: SystemStatus | null;
  chartData: TrafficBucket[];
  aiAnalysis: string | null;
  isAnalyzing: boolean;
  onRunAnalysis: () => void;
}

export function DashboardTab({
  alerts,
  devices,
  status,
  chartData,
  aiAnalysis,
  isAnalyzing,
  onRunAnalysis,
}: DashboardTabProps) {
  const rogueAPs = alerts.filter((a) => a.type === "ROGUE_AP").length;
  const deauthEvents = alerts.filter((a) => a.type === "DEAUTH_ATTACK").length;
  const macSpoofing = alerts.filter((a) => a.type === "MAC_SPOOFING").length;
  const liveChart = chartData.length > 0 ? chartData : mockChartData;

  return (
    <motion.div
      key="dash"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex flex-col gap-6 h-full"
    >
      {/* KPI Row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 shrink-0">
        <KpiCard
          label="Active Devices"
          value={devices.length}
          color="text-white"
          trend={`${devices.filter((d) => d.status === "trusted").length} trusted`}
          trendColor="text-emerald-400"
        />
        <KpiCard
          label="Rogue APs"
          value={rogueAPs}
          color={rogueAPs > 0 ? "text-rose-500" : "text-white"}
          trend="Evil Twin Detection"
          trendColor={rogueAPs > 0 ? "text-rose-400" : "text-slate-500"}
        />
        <KpiCard
          label="Deauth Events"
          value={deauthEvents}
          color={deauthEvents > 0 ? "text-orange-500" : "text-white"}
          trend="DoS Monitoring"
          trendColor={deauthEvents > 0 ? "text-orange-400" : "text-slate-500"}
        />
        <KpiCard
          label="MAC Spoofing"
          value={macSpoofing}
          color={macSpoofing > 0 ? "text-purple-500" : "text-white"}
          trend="Identity Fraud"
          trendColor={macSpoofing > 0 ? "text-purple-400" : "text-slate-500"}
        />
      </div>

      {/* Chart + AI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-5 gap-6 shrink-0 h-auto sm:h-52">
        <div className="sm:col-span-3 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col overflow-hidden h-44 sm:h-auto">
          <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
            <Activity className="w-3 h-3 text-sky-500" /> Traffic Load (Live)
          </h4>
          <div className="flex-1 min-h-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={liveChart}>
                <Area
                  type="monotone"
                  dataKey="data"
                  stroke="#0ea5e9"
                  fill="#0ea5e9"
                  fillOpacity={0.1}
                  name="Data"
                />
                <Area
                  type="monotone"
                  dataKey="beacons"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.05}
                  name="Beacons"
                />
                <Area
                  type="monotone"
                  dataKey="deauth"
                  stroke="#f43f5e"
                  fill="#f43f5e"
                  fillOpacity={0.1}
                  name="Deauth"
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid #1e293b",
                    fontSize: "10px",
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="sm:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-4 flex flex-col h-44 sm:h-auto">
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-[10px] font-bold text-sky-500 uppercase flex items-center gap-2">
              <BrainCircuit className="w-3 h-3" /> ML Insight
            </h4>
            <button
              onClick={onRunAnalysis}
              disabled={isAnalyzing}
              className="text-[9px] px-2 py-0.5 bg-sky-500/10 hover:bg-sky-500/20 border border-sky-500/20 rounded text-sky-400 font-bold transition-colors disabled:opacity-50"
            >
              {isAnalyzing ? "..." : "Run"}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto text-[11px] leading-relaxed text-slate-400 custom-scrollbar pr-1 whitespace-pre-wrap">
            {isAnalyzing ? (
              <div className="flex items-center gap-2 text-sky-400">
                <BrainCircuit className="w-4 h-4 animate-spin" />
                Analyzing network posture...
              </div>
            ) : (
              aiAnalysis || "Click Run to generate ML security assessment."
            )}
          </div>
        </div>
      </div>

      {/* Device Inventory Table */}
      <div className="flex-1 bg-slate-900 border border-slate-800 rounded-xl flex flex-col overflow-hidden min-h-[250px]">
        <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/80 flex justify-between items-center shrink-0">
          <h2 className="text-sm font-semibold text-white uppercase tracking-wider">
            Device Inventory
          </h2>
          <span className="text-[10px] text-slate-500 font-mono italic">
            {status
              ? `${status.totalPacketsProcessed.toLocaleString()} pkts processed`
              : "WIDS Engine"}
          </span>
        </div>
        <div className="flex-1 overflow-x-auto overflow-y-auto custom-scrollbar">
          <table className="w-full text-left min-w-[500px]">
            <thead className="text-[10px] text-slate-500 uppercase border-b border-slate-800 sticky top-0 bg-slate-900 z-10">
              <tr>
                <th className="px-4 py-3 font-semibold">MAC Address</th>
                <th className="px-4 py-3 font-semibold">SSID</th>
                <th className="px-4 py-3 font-semibold">Signal</th>
                <th className="px-4 py-3 font-semibold">Last Seen</th>
                <th className="px-4 py-3 font-semibold">Status</th>
              </tr>
            </thead>
            <tbody className="text-xs font-mono">
              {devices.map((device) => (
                <tr
                  key={device.mac}
                  className="border-b border-slate-800/50 hover:bg-slate-800/30 transition-colors"
                >
                  <td className="px-4 py-3 text-sky-400">{device.mac}</td>
                  <td className="px-4 py-3 text-slate-200">{device.ssid || "[Probe]"}</td>
                  <td
                    className={cn(
                      "px-4 py-3 font-bold",
                      device.avgSignal > -60 ? "text-emerald-500" : "text-amber-500"
                    )}
                  >
                    {device.avgSignal.toFixed(0)} dBm
                  </td>
                  <td className="px-4 py-3 text-slate-500 text-[10px]">
                    {format(device.lastSeen, "HH:mm:ss")}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "px-2 py-0.5 rounded border text-[9px] font-bold uppercase whitespace-nowrap",
                        device.status === "trusted"
                          ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20"
                          : device.status === "blocked"
                          ? "bg-rose-500/10 text-rose-500 border-rose-500/20"
                          : "bg-slate-800 text-slate-500 border-slate-700"
                      )}
                    >
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
  );
}
