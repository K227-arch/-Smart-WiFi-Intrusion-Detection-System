import { Activity, BarChart2, CheckCircle2, Server } from "lucide-react";
import { motion } from "motion/react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn, formatNumber, mockChartData } from "../lib/utils";
import type { Alert, Analytics, Device, TrafficBucket } from "../types";
import { KpiCard } from "../components/ui/KpiCard";

interface AnalyticsTabProps {
  analytics: Analytics | null;
  alerts: Alert[];
  devices: Device[];
  chartData: TrafficBucket[];
}

const PIE_COLORS = ["#10b981", "#f59e0b", "#f43f5e"];
const DETECTION_COLORS: Record<string, string> = {
  ROGUE_AP: "#f43f5e",
  DEAUTH_ATTACK: "#f97316",
  MAC_SPOOFING: "#a855f7",
  UNAUTHORIZED_DEVICE: "#f59e0b",
};

const ACCURACY_DATA = [
  { attack: "Rogue AP", key: "ROGUE_AP", accuracy: 95 },
  { attack: "Deauth Attack", key: "DEAUTH_ATTACK", accuracy: 93 },
  { attack: "MAC Spoofing", key: "MAC_SPOOFING", accuracy: 90 },
  { attack: "Unauth Device", key: "UNAUTHORIZED_DEVICE", accuracy: 98 },
];

export function AnalyticsTab({ analytics, alerts, devices, chartData }: AnalyticsTabProps) {
  const liveChart = chartData.length > 0 ? chartData : mockChartData;

  const detectionBarData = analytics
    ? Object.entries(analytics.detectionCounts).map(([type, count]) => ({
        name: type.replace(/_/g, " "),
        count,
        fill: DETECTION_COLORS[type] ?? "#64748b",
      }))
    : [];

  const devicePieData = analytics
    ? [
        { name: "Trusted", value: analytics.deviceBreakdown.trusted },
        { name: "Unknown", value: analytics.deviceBreakdown.unknown },
        { name: "Blocked", value: analytics.deviceBreakdown.blocked },
      ].filter((d) => d.value > 0)
    : [];

  return (
    <motion.div
      key="analytics-view"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar"
    >
      {/* Summary KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 shrink-0">
        <KpiCard
          label="Total Detections"
          value={analytics?.totalDetections ?? 0}
          color="text-white"
          trend="All attack types"
          trendColor="text-slate-500"
        />
        <KpiCard
          label="Packets Analyzed"
          value={analytics ? formatNumber(analytics.totalPacketsProcessed) : "—"}
          color="text-sky-400"
          trend="Since engine start"
          trendColor="text-slate-500"
        />
        <KpiCard
          label="High Severity"
          value={analytics?.alertSeverityBreakdown.high ?? 0}
          color="text-rose-500"
          trend="Critical incidents"
          trendColor="text-rose-400"
        />
        <KpiCard
          label="Blocked Devices"
          value={analytics?.deviceBreakdown.blocked ?? 0}
          color="text-amber-500"
          trend="Quarantined nodes"
          trendColor="text-amber-400"
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 shrink-0">
        {/* Detection bar chart */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 h-56">
          <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
            <BarChart2 className="w-3 h-3 text-sky-500" /> Detections by Attack Type
          </h4>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={detectionBarData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#64748b" }} />
              <YAxis tick={{ fontSize: 9, fill: "#64748b" }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: "#0f172a",
                  border: "1px solid #1e293b",
                  fontSize: "10px",
                }}
              />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}>
                {detectionBarData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Device pie chart */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 h-56">
          <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
            <Server className="w-3 h-3 text-sky-500" /> Device Status Distribution
          </h4>
          {devicePieData.length > 0 ? (
            <ResponsiveContainer width="100%" height="85%">
              <PieChart>
                <Pie
                  data={devicePieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={40}
                  outerRadius={70}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {devicePieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#0f172a",
                    border: "1px solid #1e293b",
                    fontSize: "10px",
                  }}
                />
                <Legend iconSize={8} wrapperStyle={{ fontSize: "10px", color: "#94a3b8" }} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-full text-slate-600 text-xs italic">
              No device data yet.
            </div>
          )}
        </div>
      </div>

      {/* Detection accuracy table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shrink-0">
        <div className="px-6 py-4 border-b border-slate-800">
          <h4 className="text-sm font-bold text-white uppercase tracking-wider">
            Detection Performance Metrics
          </h4>
          <p className="text-[10px] text-slate-500 mt-1">
            Based on system design accuracy targets (Chapter 6)
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[500px]">
            <thead className="text-[10px] text-slate-600 uppercase border-b border-slate-800 bg-slate-950/30">
              <tr>
                <th className="px-6 py-3">Attack Type</th>
                <th className="px-6 py-3 text-center">Detected (Session)</th>
                <th className="px-6 py-3 text-center">Target Accuracy</th>
                <th className="px-6 py-3">Accuracy Bar</th>
                <th className="px-6 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              {ACCURACY_DATA.map((row) => (
                <tr
                  key={row.attack}
                  className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors"
                >
                  <td className="px-6 py-4 font-semibold text-slate-200">{row.attack}</td>
                  <td className="px-6 py-4 text-center font-mono text-sky-400 font-bold">
                    {analytics?.detectionCounts[row.key] ?? 0}
                  </td>
                  <td className="px-6 py-4 text-center font-mono text-emerald-400 font-bold">
                    {row.accuracy}%
                  </td>
                  <td className="px-6 py-4">
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${row.accuracy}%` }}
                        transition={{ duration: 1, delay: 0.2 }}
                        className="h-full bg-emerald-500 rounded-full"
                      />
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="flex items-center justify-center gap-1 text-emerald-500 text-[10px] font-bold">
                      <CheckCircle2 className="w-3 h-3" /> Active
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Traffic trend chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 h-52 shrink-0">
        <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
          <Activity className="w-3 h-3 text-sky-500" /> Traffic Trend (30s Buckets)
        </h4>
        <ResponsiveContainer width="100%" height="85%">
          <AreaChart data={liveChart}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis dataKey="time" tick={{ fontSize: 9, fill: "#64748b" }} />
            <YAxis tick={{ fontSize: 9, fill: "#64748b" }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#0f172a",
                border: "1px solid #1e293b",
                fontSize: "10px",
              }}
            />
            <Legend iconSize={8} wrapperStyle={{ fontSize: "10px", color: "#94a3b8" }} />
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
              fillOpacity={0.15}
              name="Deauth"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
