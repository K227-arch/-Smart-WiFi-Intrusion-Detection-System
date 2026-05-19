import { Brain, CheckCircle2, TrendingUp, XCircle, Zap } from "lucide-react";
import { motion } from "motion/react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Analytics, MLResult } from "../types";

interface MLTabProps {
  analytics: Analytics | null;
  mlResults: MLResult[];
}

// Thesis evaluation matrix (Chapter 6)
const THESIS_METRICS = [
  { attack: "Port Scan",   precision: 0.95, recall: 0.96, f1: 0.95 },
  { attack: "Brute Force", precision: 0.93, recall: 0.94, f1: 0.93 },
  { attack: "DoS",         precision: 0.97, recall: 0.98, f1: 0.97 },
  { attack: "Rogue AP",    precision: 0.94, recall: 0.95, f1: 0.94 },
  { attack: "MAC Spoof",   precision: 0.91, recall: 0.92, f1: 0.91 },
];

const RADAR_DATA = [
  { metric: "Precision", value: 94 },
  { metric: "Recall",    value: 95 },
  { metric: "F1-Score",  value: 94 },
  { metric: "Accuracy",  value: 96 },
  { metric: "Specificity", value: 93 },
];

function ScoreBadge({ score }: { score: number }) {
  const color = score >= 0.75 ? "text-rose-400 bg-rose-500/10 border-rose-500/30"
    : score >= 0.4 ? "text-amber-400 bg-amber-500/10 border-amber-500/30"
    : "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
  const label = score >= 0.75 ? "Malicious" : score >= 0.4 ? "Suspicious" : "Normal";
  return (
    <span className={`px-2 py-0.5 rounded border text-[9px] font-bold uppercase ${color}`}>
      {label} ({(score * 100).toFixed(0)}%)
    </span>
  );
}

export function MLTab({ analytics, mlResults }: MLTabProps) {
  const totalDetections = analytics?.totalDetections ?? 0;
  const avgScore = mlResults.length > 0
    ? mlResults.reduce((s, r) => s + r.score, 0) / mlResults.length
    : 0;
  const maliciousCount = mlResults.filter((r) => r.score >= 0.75).length;
  const suspiciousCount = mlResults.filter((r) => r.score >= 0.4 && r.score < 0.75).length;

  return (
    <motion.div
      key="ml-view"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col gap-6 h-full overflow-y-auto custom-scrollbar"
    >
      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 shrink-0">
        {[
          { label: "ML Scored Devices", value: mlResults.length, color: "text-violet-400" },
          { label: "Malicious", value: maliciousCount, color: "text-rose-500" },
          { label: "Suspicious", value: suspiciousCount, color: "text-amber-500" },
          { label: "Avg Anomaly Score", value: `${(avgScore * 100).toFixed(1)}%`, color: avgScore > 0.5 ? "text-rose-400" : "text-emerald-400" },
        ].map((k) => (
          <div key={k.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">{k.label}</div>
            <div className={`text-2xl font-bold font-mono ${k.color}`}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 shrink-0">
        {/* Thesis evaluation matrix bar chart */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 h-64">
          <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
            <TrendingUp className="w-3 h-3 text-violet-500" /> Thesis Evaluation Matrix
          </h4>
          <ResponsiveContainer width="100%" height="85%">
            <BarChart data={THESIS_METRICS} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="attack" tick={{ fontSize: 8, fill: "#64748b" }} />
              <YAxis domain={[0.85, 1]} tick={{ fontSize: 9, fill: "#64748b" }} tickFormatter={(v) => `${(v * 100).toFixed(0)}%`} />
              <Tooltip
                contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", fontSize: "10px" }}
                formatter={(v: number) => `${(v * 100).toFixed(0)}%`}
              />
              <Bar dataKey="precision" name="Precision" fill="#0ea5e9" radius={[2, 2, 0, 0]} />
              <Bar dataKey="recall" name="Recall" fill="#10b981" radius={[2, 2, 0, 0]} />
              <Bar dataKey="f1" name="F1-Score" fill="#a855f7" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Radar chart */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 h-64">
          <h4 className="text-[10px] font-bold text-slate-500 uppercase mb-3 flex items-center gap-2">
            <Brain className="w-3 h-3 text-violet-500" /> Model Performance Radar
          </h4>
          <ResponsiveContainer width="100%" height="85%">
            <RadarChart data={RADAR_DATA}>
              <PolarGrid stroke="#1e293b" />
              <PolarAngleAxis dataKey="metric" tick={{ fontSize: 9, fill: "#64748b" }} />
              <Radar name="Score" dataKey="value" stroke="#a855f7" fill="#a855f7" fillOpacity={0.2} />
              <Tooltip contentStyle={{ backgroundColor: "#0f172a", border: "1px solid #1e293b", fontSize: "10px" }} formatter={(v: number) => `${v}%`} />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Thesis evaluation table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shrink-0">
        <div className="px-6 py-4 border-b border-slate-800">
          <h4 className="text-sm font-bold text-white uppercase tracking-wider">Thesis Evaluation Matrix — Chapter 6</h4>
          <p className="text-[10px] text-slate-500 mt-1">Precision, Recall, and F1-Score per attack type from model evaluation</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[500px]">
            <thead className="text-[10px] text-slate-600 uppercase border-b border-slate-800 bg-slate-950/30">
              <tr>
                <th className="px-6 py-3">Attack Type</th>
                <th className="px-6 py-3 text-center">Precision</th>
                <th className="px-6 py-3 text-center">Recall</th>
                <th className="px-6 py-3 text-center">F1-Score</th>
                <th className="px-6 py-3">Bar</th>
                <th className="px-6 py-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              {THESIS_METRICS.map((row) => (
                <tr key={row.attack} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                  <td className="px-6 py-4 font-semibold text-slate-200">{row.attack}</td>
                  <td className="px-6 py-4 text-center font-mono text-sky-400 font-bold">{(row.precision * 100).toFixed(0)}%</td>
                  <td className="px-6 py-4 text-center font-mono text-emerald-400 font-bold">{(row.recall * 100).toFixed(0)}%</td>
                  <td className="px-6 py-4 text-center font-mono text-violet-400 font-bold">{(row.f1 * 100).toFixed(0)}%</td>
                  <td className="px-6 py-4 w-32">
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${row.f1 * 100}%` }}
                        transition={{ duration: 1 }}
                        className="h-full rounded-full bg-violet-500"
                      />
                    </div>
                  </td>
                  <td className="px-6 py-4 text-center">
                    <span className="flex items-center justify-center gap-1 text-emerald-500 text-[9px] font-bold">
                      <CheckCircle2 className="w-3 h-3" /> Active
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Live ML scored devices */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shrink-0">
        <div className="px-6 py-4 border-b border-slate-800">
          <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
            <Zap className="w-4 h-4 text-violet-400" /> Live ML Device Scores
          </h4>
          <p className="text-[10px] text-slate-500 mt-1">Real-time anomaly scores computed per device using traffic feature analysis</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[600px]">
            <thead className="text-[10px] text-slate-600 uppercase border-b border-slate-800 bg-slate-950/30">
              <tr>
                <th className="px-6 py-3">MAC Address</th>
                <th className="px-6 py-3 text-center">Anomaly Score</th>
                <th className="px-6 py-3 text-center">Pkt Rate</th>
                <th className="px-6 py-3 text-center">Deauth Ratio</th>
                <th className="px-6 py-3 text-center">Channels</th>
                <th className="px-6 py-3 text-center">Classification</th>
              </tr>
            </thead>
            <tbody className="text-xs">
              {mlResults.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-slate-600 italic text-sm">
                    ML engine warming up — scores appear after baseline is established.
                  </td>
                </tr>
              ) : (
                mlResults.slice(0, 20).map((r) => (
                  <tr key={r.mac} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                    <td className="px-6 py-3 font-mono text-sky-400 text-[10px]">{r.mac}</td>
                    <td className="px-6 py-3 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <div className="w-16 bg-slate-800 h-1.5 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${r.score * 100}%`,
                              backgroundColor: r.score >= 0.75 ? "#f43f5e" : r.score >= 0.4 ? "#f59e0b" : "#10b981",
                            }}
                          />
                        </div>
                        <span className="font-mono text-[10px] text-slate-300">{(r.score * 100).toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-6 py-3 text-center font-mono text-slate-400 text-[10px]">{r.features.packetRate.toFixed(1)}/s</td>
                    <td className="px-6 py-3 text-center font-mono text-[10px]" style={{ color: r.features.deauthRatio > 0.1 ? "#f43f5e" : "#64748b" }}>
                      {(r.features.deauthRatio * 100).toFixed(1)}%
                    </td>
                    <td className="px-6 py-3 text-center font-mono text-slate-400 text-[10px]">{r.features.uniqueChannels}</td>
                    <td className="px-6 py-3 text-center"><ScoreBadge score={r.score} /></td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Snort rules info */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shrink-0">
        <h4 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2">
          <Brain className="w-4 h-4 text-sky-400" /> Active Detection Methods
        </h4>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[
            { method: "Signature-Based", desc: "Snort-style rules matching known attack patterns (Rogue AP, Deauth, MAC Spoof, Port Scan, Brute Force)", status: "active", color: "text-sky-400 border-sky-500/30 bg-sky-500/5" },
            { method: "Anomaly-Based", desc: "Rolling baseline of normal traffic. Flags deviations in packet rate, deauth ratio, and channel hopping", status: "active", color: "text-emerald-400 border-emerald-500/30 bg-emerald-500/5" },
            { method: "ML Scoring", desc: "Naive Bayes-style feature scoring per device. Combines packet rate, signal, deauth ratio, and beacon ratio into a 0–1 threat score", status: "active", color: "text-violet-400 border-violet-500/30 bg-violet-500/5" },
          ].map((m) => (
            <div key={m.method} className={`p-4 rounded-lg border ${m.color}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-bold uppercase tracking-widest">{m.method}</span>
                <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-500">
                  <CheckCircle2 className="w-3 h-3" /> {m.status}
                </span>
              </div>
              <p className="text-[9px] text-slate-500 leading-relaxed">{m.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
