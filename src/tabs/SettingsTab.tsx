import { Activity, History, RotateCcw } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "../lib/utils";

interface SettingsTabProps {
  customPrompt: string;
  onPromptChange: (prompt: string) => void;
}

const DEFAULT_PROMPT = `You are a cybersecurity expert analyzing logs from a Wireless Intrusion Detection System (WIDS).
Current Alerts: {{ALERTS}}
Current Network Density: {{DEVICES}} devices detected.

Provide a concise security posture assessment and 3 actionable recommendations for the network administrator.
Keep it professional and technical but accessible. Format in Markdown.`;

const DETECTION_RULES = [
  {
    title: "Rogue AP (Evil Twin)",
    rule: "IF SSID matches known network AND BSSID is different → FLAG as Rogue AP",
    color: "border-rose-500/30 bg-rose-500/5",
  },
  {
    title: "Deauth Flood Attack",
    rule: "IF Deauth packets ≥ 5 within 3 seconds from same source → FLAG as DoS",
    color: "border-orange-500/30 bg-orange-500/5",
  },
  {
    title: "MAC Spoofing",
    rule: "IF known SSID is broadcast from a new/unknown BSSID → FLAG as MAC Spoofing",
    color: "border-purple-500/30 bg-purple-500/5",
  },
  {
    title: "Unauthorized Device",
    rule: "IF MAC address not in trusted whitelist AND first time seen → FLAG device",
    color: "border-amber-500/30 bg-amber-500/5",
  },
];

export function SettingsTab({ customPrompt, onPromptChange }: SettingsTabProps) {
  return (
    <motion.div
      key="settings-view"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="bg-slate-900 border border-slate-800 rounded-xl flex flex-col h-full overflow-hidden"
    >
      <div className="px-6 py-4 border-b border-slate-800">
        <h2 className="text-lg font-bold text-white uppercase tracking-wider">
          AI Configuration
        </h2>
        <p className="text-[10px] text-slate-500 mt-1">
          Customize the cognitive analysis prompt used for security posture evaluation
        </p>
      </div>

      <div className="p-6 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
        {/* Prompt editor */}
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-sm font-bold text-slate-200 uppercase tracking-widest">
                Cognitive Prompt
              </h3>
              <p className="text-[10px] text-slate-500 mt-1 font-mono italic">
                Use injection tokens to include live data
              </p>
            </div>
            <button
              onClick={() => onPromptChange(DEFAULT_PROMPT.trim())}
              className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[10px] font-bold text-slate-400 transition-colors"
            >
              <RotateCcw className="w-3 h-3" /> Reset Default
            </button>
          </div>

          <div className="relative">
            <textarea
              value={customPrompt}
              onChange={(e) => onPromptChange(e.target.value)}
              className="w-full h-64 bg-slate-950 border border-slate-800 rounded-lg p-4 text-xs font-mono text-sky-400 focus:outline-none focus:border-sky-500/50 custom-scrollbar resize-none"
            />
            <div className="absolute bottom-3 right-3 flex items-center gap-2 px-2 py-1 bg-slate-900/80 rounded border border-slate-700 text-[10px] text-slate-500 font-mono">
              <Activity className="w-3 h-3 text-emerald-500" /> Dynamic Injection Active
            </div>
          </div>

          {/* Injection tokens reference */}
          <div className="p-4 bg-slate-800/20 border border-slate-800 rounded-lg space-y-3">
            <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
              <History className="w-3 h-3" /> Available Injection Tokens
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <code className="text-sky-400 text-[10px] px-1 bg-slate-900 rounded">
                  {"{{ALERTS}}"}
                </code>
                <p className="text-[9px] text-slate-500 leading-tight">
                  Last 10 security alerts serialized as JSON
                </p>
              </div>
              <div className="space-y-1">
                <code className="text-sky-400 text-[10px] px-1 bg-slate-900 rounded">
                  {"{{DEVICES}}"}
                </code>
                <p className="text-[9px] text-slate-500 leading-tight">
                  Raw count of active network identities
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Detection rules reference */}
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-slate-200 uppercase tracking-widest">
            Detection Rules Reference
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {DETECTION_RULES.map((r) => (
              <div key={r.title} className={cn("p-3 rounded-lg border", r.color)}>
                <div className="text-[10px] font-bold text-slate-300 uppercase mb-1">
                  {r.title}
                </div>
                <div className="text-[9px] text-slate-500 font-mono leading-relaxed">{r.rule}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
