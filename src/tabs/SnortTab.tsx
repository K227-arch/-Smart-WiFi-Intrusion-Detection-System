import { useEffect, useState, useCallback } from "react";
import { motion } from "motion/react";
import { CheckCircle2, RefreshCw, Save, Shield, XCircle } from "lucide-react";
import { cn } from "../lib/utils";

interface SnortRule {
  sid: number; msg: string; action: string; protocol: string;
  srcIp: string; srcPort: string; dstIp: string; dstPort: string;
  enabled: boolean; classtype?: string; priority?: number; raw: string;
}

export function SnortTab() {
  const [rules, setRules] = useState<SnortRule[]>([]);
  const [fileContent, setFileContent] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchRules = useCallback(async () => {
    setLoading(true);
    try {
      const [rulesRes, fileRes] = await Promise.all([
        fetch("/api/snort-rules").then(r => r.json()),
        fetch("/api/snort-rules/file").then(r => r.json()),
      ]);
      setRules(rulesRes);
      setFileContent(fileRes.content ?? "");
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { fetchRules(); }, [fetchRules]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch("/api/snort-rules/file", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: fileContent }),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
      await fetchRules();
    } catch { /* ignore */ }
    setSaving(false);
  };

  const handleReload = async () => {
    setReloading(true);
    try {
      await fetch("/api/snort-rules/reload", { method: "POST" });
      await fetchRules();
    } catch { /* ignore */ }
    setReloading(false);
  };

  const severityColor = (priority?: number) => {
    if (priority === 1) return "text-rose-400 bg-rose-500/10 border-rose-500/30";
    if (priority === 2) return "text-amber-400 bg-amber-500/10 border-amber-500/30";
    return "text-amber-400 bg-amber-500/10 border-amber-500/30";
  };

  return (
    <motion.div
      key="snort-view"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col gap-4 h-full overflow-y-auto custom-scrollbar"
    >
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-2">
              <Shield className="w-4 h-4 text-amber-400" /> Snort Rule Engine
            </h3>
            <p className="text-[10px] text-slate-500 mt-1">
              {rules.length} rules loaded · Edit the rules file directly or use the table view
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setEditMode(v => !v)}
              className={cn("px-3 py-1.5 rounded text-[10px] font-bold uppercase transition-all border",
                editMode ? "bg-violet-500/20 text-violet-400 border-violet-500/30" : "bg-slate-800 text-slate-400 border-slate-700 hover:text-slate-200")}>
              {editMode ? "Table View" : "Edit Rules"}
            </button>
            <button onClick={handleReload} disabled={reloading}
              className="p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-slate-400 hover:text-white transition-colors">
              <RefreshCw className={cn("w-3.5 h-3.5", reloading && "animate-spin")} />
            </button>
          </div>
        </div>
      </div>

      {editMode ? (
        /* Raw rules editor */
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden flex flex-col shrink-0">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <span className="text-[10px] text-slate-500 font-mono">data/wids.rules</span>
            <button onClick={handleSave} disabled={saving}
              className={cn("flex items-center gap-1.5 px-3 py-1.5 rounded text-[10px] font-bold uppercase transition-all",
                saved ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-amber-600 hover:bg-amber-500 text-white")}>
              <Save className="w-3 h-3" />
              {saving ? "Saving..." : saved ? "Saved!" : "Save & Reload"}
            </button>
          </div>
          <textarea
            value={fileContent}
            onChange={e => setFileContent(e.target.value)}
            className="w-full h-96 bg-slate-950 p-4 text-[11px] font-mono text-amber-300 focus:outline-none resize-none custom-scrollbar"
            spellCheck={false}
            placeholder="# Snort rules&#10;alert tcp any any -> any 80 (msg:&quot;HTTP&quot;; sid:1;)"
          />
          <div className="px-4 py-2 border-t border-slate-800 bg-slate-950/30">
            <p className="text-[9px] text-slate-600 font-mono">
              Syntax: action proto src_ip src_port -&gt; dst_ip dst_port (msg:"..."; sid:N; rev:1;)
            </p>
          </div>
        </div>
      ) : (
        /* Rules table */
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left min-w-[700px]">
              <thead className="text-[10px] text-slate-600 uppercase border-b border-slate-800 bg-slate-950/30">
                <tr>
                  <th className="px-4 py-3">SID</th>
                  <th className="px-4 py-3">Message</th>
                  <th className="px-4 py-3 text-center">Action</th>
                  <th className="px-4 py-3 text-center">Proto</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Destination</th>
                  <th className="px-4 py-3 text-center">Priority</th>
                  <th className="px-4 py-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="text-xs">
                {loading ? (
                  <tr><td colSpan={8} className="px-5 py-8 text-center text-slate-600 italic">Loading rules...</td></tr>
                ) : rules.length === 0 ? (
                  <tr><td colSpan={8} className="px-5 py-8 text-center text-slate-600 italic">No rules loaded.</td></tr>
                ) : rules.map(r => (
                  <tr key={r.sid} className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors">
                    <td className="px-4 py-3 font-mono text-slate-500 text-[10px]">{r.sid}</td>
                    <td className="px-4 py-3 text-slate-200 max-w-[200px] truncate" title={r.msg}>{r.msg}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-1.5 py-0.5 bg-slate-800 text-slate-400 rounded text-[9px] font-mono uppercase">{r.action}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-1.5 py-0.5 bg-amber-500/10 text-amber-400 rounded text-[9px] font-mono uppercase">{r.protocol}</span>
                    </td>
                    <td className="px-4 py-3 font-mono text-[10px] text-slate-400">{r.srcIp}:{r.srcPort}</td>
                    <td className="px-4 py-3 font-mono text-[10px] text-slate-400">{r.dstIp}:{r.dstPort}</td>
                    <td className="px-4 py-3 text-center">
                      {r.priority !== undefined
                        ? <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-bold border", severityColor(r.priority))}>P{r.priority}</span>
                        : <span className="text-slate-600 text-[9px]">—</span>}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {r.enabled
                        ? <span className="flex items-center justify-center gap-1 text-emerald-500 text-[9px] font-bold"><CheckCircle2 className="w-3 h-3" />Active</span>
                        : <span className="flex items-center justify-center gap-1 text-slate-500 text-[9px] font-bold"><XCircle className="w-3 h-3" />Disabled</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Snort rule syntax reference */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shrink-0">
        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Quick Reference</h4>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[
            { title: "SYN Flood", rule: 'alert tcp any any -> any any (msg:"SYN Flood"; flags:S; threshold:type both,track by_src,count 50,seconds 5; sid:2001; rev:1;)' },
            { title: "ICMP Ping", rule: 'alert icmp any any -> any any (msg:"ICMP Ping"; sid:2002; rev:1;)' },
            { title: "SSH Brute Force", rule: 'alert tcp any any -> any 22 (msg:"SSH Brute Force"; flags:S; threshold:type both,track by_src,count 10,seconds 60; sid:2003; rev:1;)' },
            { title: "DNS Flood", rule: 'alert udp any any -> any 53 (msg:"DNS Flood"; threshold:type both,track by_src,count 100,seconds 10; sid:2004; rev:1;)' },
          ].map(ex => (
            <div key={ex.title} className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
              <div className="text-[9px] font-bold text-amber-400 uppercase mb-1">{ex.title}</div>
              <code className="text-[9px] text-slate-400 font-mono break-all leading-relaxed">{ex.rule}</code>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
