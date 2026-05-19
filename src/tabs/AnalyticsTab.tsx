import { Activity, BarChart2, CheckCircle2, Server, XCircle } from "lucide-react";
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
import { formatNumber, mockChartData } from "../lib/utils";
import type { Analytics, TrafficBucket } from "../types";
import { KpiCard } from "../components/ui/KpiCard";

interface AnalyticsTabProps {
  analytics: Analytics | null;
  chartData: TrafficBucket[];
}

const PIE_COLORS = ["#10b981", "#f59e0b", "#f43f5e"];

const DETECTION_COLORS: Record<string, string> = {
  ROGUE_AP: "#f43f5e",
  DEAUTH_ATTACK: "#f97316",
  MAC_SPOOFING: "#a855f7",
  UNAUTHORIZED_DEVICE: "#f59e0b",
  CHANNEL_ANOMALY: "#0ea5e9",
};

// Target accuracy benchmarks from spec Chapter 6
const ACCURACY_TARGETS: Record<string, number> = {
  ROGUE_AP: 95,
  DEAUTH_ATTACK: 93,
  MAC_SPOOFING: 90,
  UNAUTHORIZED_DEVICE: 98,
  CHANNEL_ANOMALY: 92,
};

const ATTACK_LABELS: Record<string, string> = {
  ROGUE_AP: "Rogue AP",
  DEAUTH_ATTACK: "Deauth Attack",
  MAC_SPOOFING: "MAC Spoofing",
  UNAUTHORIZED_DEVICE: "Unauth Device",
  CHANNEL_ANOMALY: "Channel Anomaly",
};

export function AnalyticsTab({ analytics, chartData }: AnalyticsTabProps) {
  const liveChart = chartData.length > 0 ? chartData : mockChartData;

  const detectionBarData = analytics
    ? Object.entries(analytics.detectionCounts).map(([type, count]) => ({
        name: ATTACK_LABELS[type] ?? type.replace(/_/g, " "),
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

  // Build accuracy rows from live server data
  const accuracyRows = Object.keys(ACCURACY_TARGETS).map((key) => {
    const detected = analytics?.detectionCounts[key] ?? 0;
    const fp = analytics?.falsePositiveCounts[key] ?? 0;
    // Use server-calculated accuracy if available, else fall back to target
    const liveAccuracy = analytics?.accuracyByType[key];
    const displayAccuracy = detected > 0 && liveAccuracy !== undefined ? liveAccuracy : ACCURACY_TARGETS[key];
    const isLive = detected > 0;
    return { key, label: ATTACK_LABELS[key], detected, fp, displayAccuracy, isLive };
  });

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
          label="False Positives"
          value={Object.values(analytics?.falsePositiveCounts ?? {}).reduce((a, b) => a + b, 0)}
          color="text-amber-500"
          trend="Dismissed alerts"
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
              <XAxis dataKey="name" tick={{ fontSize: 8, fill: "#64748b" }} />
              <YAxis tick={{ fontSize: 9, fill: "#64748b" }} />
              <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", fontSize: "10px" }} />
              <Bar dataKey="count" radius={[3, 3, 0, 0]}
                fill="#0ea5e9"
                label={false}
              />
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
                  fill="#0ea5e9"
                >
                  {devicePieData.map((entry, i) => (
                    <Cell key={entry.name} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", fontSize: "10px" }} />
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

      {/* Detection accuracy table — live data */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shrink-0">
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h4 className="text-sm font-bold text-white uppercase tracking-wider">
              Detection Performance Metrics
            </h4>
            <p className="text-[10px] text-slate-500 mt-1">
              Live accuracy calculated from session detections minus dismissed false positives
            </p>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[560px]">
            <thead className="text-[10px] text-slate-600 uppercase border-b border-slate-800 bg-slate-950/30">
              <tr>
                <th className="px-6 py-3">Attack Type</th>
                <th className="px-6 py-3 text-center">Detected</th>
                <th className="px-6 py-3 text-center">False +</th>
                <th className="px-6 py-3 text-center">Accuracy</th>
                <th className="px-6 py-3">Bar</th>
                <th className="px-6 py-3 text-center">Source</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              {accuracyRows.map((row) => (
                <tr key={row.key} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                  <td className="px-6 py-4 font-semibold text-slate-200">{row.label}</td>
                  <td className="px-6 py-4 text-center font-mono text-sky-400 font-bold">{row.detected}</td>
                  <td className="px-6 py-4 text-center font-mono text-rose-400 font-bold">{row.fp}</td>
                  <td className="px-6 py-4 text-center font-mono font-bold"
                    style={{ color: row.displayAccuracy >= 90 ? "#10b981" : row.displayAccuracy >= 75 ? "#f59e0b" : "#f43f5e" }}>
                    {row.displayAccuracy}%
                  </td>
                  <td className="px-6 py-4 w-32">
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${row.displayAccuracy}%` }}
                        transition={{ duration: 1, delay: 0.1 }}
                        className="h-full rounded-full"
                        style={{ backgroundColor: row.displayAccuracy >= 90 ? "#10b981" : row.displayAccuracy >= 75 ? "#f59e0b" : "#f43f5e" }}
                      />
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    {row.isLive ? (
                      <span className="flex items-center justify-center gap-1 text-emerald-500 text-[9px] font-bold">
                        <CheckCircle2 className="w-3 h-3" /> Live
                      </span>
                    ) : (
                      <span className="flex items-center justify-center gap-1 text-slate-500 text-[9px] font-bold">
                        <XCircle className="w-3 h-3" /> Target
                      </span>
                    )}
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
            <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", fontSize: "10px" }} />
            <Legend iconSize={8} wrapperStyle={{ fontSize: "10px", color: "#94a3b8" }} />
            <Area type="monotone" dataKey="data" stroke="#0ea5e9" fill="#0ea5e9" fillOpacity={0.1} name="Data" />
            <Area type="monotone" dataKey="beacons" stroke="#10b981" fill="#10b981" fillOpacity={0.05} name="Beacons" />
            <Area type="monotone" dataKey="mgmt" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.05} name="MGMT" />
            <Area type="monotone" dataKey="deauth" stroke="#f43f5e" fill="#f43f5e" fillOpacity={0.15} name="Deauth" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </motion.div>
  );
}
