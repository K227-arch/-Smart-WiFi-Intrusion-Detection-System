import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Terminal, ChevronRight, Trash2, Copy, Check, Info, Wifi,
  BrainCircuit, Send, Loader2, ChevronDown, ChevronUp, Sparkles,
} from "lucide-react";
import { cn } from "../lib/utils";
import { format } from "date-fns";

// ── Types ─────────────────────────────────────────────────────────────────────
interface TerminalLine {
  id: string;
  type: "input" | "output" | "error" | "info" | "banner" | "ai-plan" | "ai-summary";
  text: string;
  timestamp: Date;
}

interface AgentResult {
  plan: string;
  commands: string[];
  commandResults: Array<{ command: string; stdout: string; stderr: string }>;
  summary: string;
}

// ── Quick-command palette ─────────────────────────────────────────────────────
const QUICK_COMMANDS = [
  { label: "IP Config",      cmd: "ipconfig",                          desc: "Show all network adapter info",         group: "Network Info" },
  { label: "IP Config Full", cmd: "ipconfig /all",                     desc: "Detailed adapter config with MACs",      group: "Network Info" },
  { label: "ARP Table",      cmd: "arp -a",                            desc: "IP→MAC mapping table",                  group: "Network Info" },
  { label: "Route Table",    cmd: "route print",                       desc: "Routing table",                         group: "Network Info" },
  { label: "Active Ports",   cmd: "netstat -ano",                      desc: "All active connections + PIDs",         group: "Network Info" },
  { label: "Listening Ports",cmd: "netstat -an | findstr LISTENING",   desc: "Only listening ports",                  group: "Network Info" },
  { label: "DNS Cache",      cmd: "ipconfig /displaydns",              desc: "DNS resolver cache",                    group: "DNS" },
  { label: "Flush DNS",      cmd: "ipconfig /flushdns",                desc: "Clear DNS cache",                       group: "DNS" },
  { label: "NSLookup",       cmd: "nslookup google.com",               desc: "DNS lookup for google.com",            group: "DNS" },
  { label: "Ping Gateway",   cmd: "ping -n 4 192.168.1.1",            desc: "Ping default gateway (4 packets)",      group: "Connectivity" },
  { label: "Ping Google",    cmd: "ping -n 4 8.8.8.8",                desc: "Ping Google DNS (connectivity check)",  group: "Connectivity" },
  { label: "Traceroute",     cmd: "tracert 8.8.8.8",                  desc: "Trace route to Google DNS",             group: "Connectivity" },
  { label: "WiFi Networks",  cmd: "netsh wlan show networks",          desc: "Scan nearby WiFi networks",             group: "WiFi" },
  { label: "WiFi Profile",   cmd: "netsh wlan show interfaces",        desc: "Current WiFi adapter status",           group: "WiFi" },
  { label: "WiFi Profiles",  cmd: "netsh wlan show profiles",          desc: "Saved WiFi network profiles",           group: "WiFi" },
  { label: "Firewall Rules", cmd: "netsh advfirewall firewall show rule name=all", desc: "Show all firewall rules", group: "Security" },
  { label: "Open Shares",    cmd: "net share",                         desc: "List network shares",                   group: "Security" },
  { label: "Who Logged In",  cmd: "net session",                       desc: "Active network sessions",               group: "Security" },
  { label: "Sys Info",       cmd: "systeminfo | findstr /C:\"OS\" /C:\"Network\"", desc: "OS and network summary", group: "System" },
  { label: "Hostname",       cmd: "hostname",                          desc: "Machine hostname",                      group: "System" },
  { label: "Adapter Stats",  cmd: "netstat -e",                        desc: "Network adapter statistics",            group: "System" },
];

const GROUPS = [...new Set(QUICK_COMMANDS.map((c) => c.group))];

// ── AI suggestion prompts ─────────────────────────────────────────────────────
const AI_SUGGESTIONS = [
  "Check if any suspicious ports are open",
  "Show all active network connections and flag unusual ones",
  "Scan for devices on the local network",
  "Diagnose slow internet connection",
  "Check DNS configuration and test resolution",
  "Show which processes are using the most bandwidth",
  "Check firewall status and active rules",
  "Test connectivity to the default gateway",
  "Show all WiFi networks in range",
  "Check for ARP cache poisoning",
];

export function TerminalTab() {
  // ── Terminal state ────────────────────────────────────────────────────────
  const [lines, setLines] = useState<TerminalLine[]>([
    {
      id: "banner",
      type: "banner",
      text: "SALAMANDA Network Terminal — Full shell access + AI Agent.\nType commands directly, use quick commands below, or ask the AI agent in natural language.",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const [copied, setCopied] = useState(false);
  const [activeGroup, setActiveGroup] = useState<string>(GROUPS[0]);

  // ── AI agent state ────────────────────────────────────────────────────────
  const [aiTask, setAiTask] = useState("");
  const [aiRunning, setAiRunning] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiOpen, setAiOpen] = useState(true);
  const [lastResult, setLastResult] = useState<AgentResult | null>(null);
  const [resultOpen, setResultOpen] = useState(false);

  const outputEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const aiInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lines]);

  const addLine = useCallback((type: TerminalLine["type"], text: string) => {
    setLines((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, type, text, timestamp: new Date() },
    ]);
  }, []);

  // ── Run a shell command ───────────────────────────────────────────────────
  const runCommand = useCallback(async (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) return;

    addLine("input", trimmed);
    setHistory((prev) => [trimmed, ...prev].slice(0, 100));
    setHistoryIdx(-1);
    setInput("");
    setRunning(true);

    try {
      const res = await fetch("/api/terminal/exec", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ command: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) {
        addLine("error", data.error ?? `Command failed (${res.status})`);
      } else {
        if (data.stdout) addLine("output", data.stdout.trimEnd());
        if (data.stderr) addLine("error", data.stderr.trimEnd());
        if (!data.stdout && !data.stderr) addLine("info", "(command completed with no output)");
      }
    } catch (err: any) {
      addLine("error", `Network error: ${err.message}`);
    } finally {
      setRunning(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [addLine]);

  // ── Run AI agent task ─────────────────────────────────────────────────────
  const runAiTask = useCallback(async (task: string) => {
    const trimmed = task.trim();
    if (!trimmed || aiRunning) return;

    setAiError(null);
    setAiRunning(true);
    setAiTask("");
    setResultOpen(false);

    // Show the task as a special line in the terminal
    addLine("ai-plan", `🤖 AI Agent: "${trimmed}"`);

    try {
      const res = await fetch("/api/terminal/ai", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ task: trimmed }),
      });
      const data = await res.json();

      if (!res.ok) {
        setAiError(data.error ?? "AI agent failed");
        addLine("error", `AI Agent error: ${data.error ?? "unknown error"}`);
        return;
      }

      const result: AgentResult = data;
      setLastResult(result);
      setResultOpen(true);

      // Echo plan
      addLine("ai-plan", `📋 Plan: ${result.plan}`);

      // Echo each command + output into the terminal
      for (const cr of result.commandResults) {
        addLine("input", cr.command);
        if (cr.stdout) addLine("output", cr.stdout.trimEnd());
        if (cr.stderr) addLine("error", cr.stderr.trimEnd());
        if (!cr.stdout && !cr.stderr) addLine("info", "(no output)");
      }

      // Final AI summary
      if (result.summary) {
        addLine("ai-summary", `✨ Analysis: ${result.summary}`);
      }
    } catch (err: any) {
      const msg = err.message ?? "Network error";
      setAiError(msg);
      addLine("error", `AI Agent error: ${msg}`);
    } finally {
      setAiRunning(false);
      setTimeout(() => aiInputRef.current?.focus(), 50);
    }
  }, [aiRunning, addLine]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      runCommand(input);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const idx = Math.min(historyIdx + 1, history.length - 1);
      setHistoryIdx(idx);
      setInput(history[idx] ?? "");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const idx = Math.max(historyIdx - 1, -1);
      setHistoryIdx(idx);
      setInput(idx === -1 ? "" : history[idx] ?? "");
    } else if (e.key === "Tab") {
      e.preventDefault();
      const match = QUICK_COMMANDS.find((c) => c.cmd.startsWith(input) && c.cmd !== input);
      if (match) setInput(match.cmd);
    } else if (e.key === "l" && e.ctrlKey) {
      e.preventDefault();
      setLines([]);
    }
  };

  const copyOutput = () => {
    const text = lines
      .filter((l) => l.type !== "banner")
      .map((l) => (l.type === "input" ? `> ${l.text}` : l.text))
      .join("\n");
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <motion.div
      key="terminal-view"
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="flex flex-col h-full gap-3 min-h-0"
    >
      {/* ── AI Agent panel ── */}
      <div className="bg-slate-900 border border-violet-500/30 rounded-xl overflow-hidden shrink-0">
        {/* Header */}
        <button
          onClick={() => setAiOpen((v) => !v)}
          className="w-full px-4 py-2.5 flex items-center justify-between hover:bg-slate-800/30 transition-colors"
        >
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-violet-500 animate-pulse" />
            <BrainCircuit className="w-3.5 h-3.5 text-violet-400" />
            <span className="text-[11px] font-bold text-violet-300 uppercase tracking-widest">
              AI Network Agent
            </span>
            <span className="text-[9px] text-slate-500 font-mono">powered by najod</span>
          </div>
          <div className="flex items-center gap-2">
            {aiRunning && (
              <span className="flex items-center gap-1 text-[10px] text-violet-400 font-mono">
                <Loader2 className="w-3 h-3 animate-spin" /> thinking…
              </span>
            )}
            {aiOpen
              ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
              : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
          </div>
        </button>

        <AnimatePresence initial={false}>
          {aiOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="px-4 pb-3 space-y-3 border-t border-slate-800">
                {/* Task input */}
                <div className="flex gap-2 pt-3">
                  <div className="flex-1 relative">
                    <Sparkles className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-violet-400/60 pointer-events-none" />
                    <input
                      ref={aiInputRef}
                      value={aiTask}
                      onChange={(e) => { setAiTask(e.target.value); setAiError(null); }}
                      onKeyDown={(e) => e.key === "Enter" && runAiTask(aiTask)}
                      disabled={aiRunning || running}
                      placeholder="Ask the AI agent to run a task… e.g. 'Check if any suspicious ports are open'"
                      className="w-full bg-slate-950 border border-slate-700 focus:border-violet-500/60 rounded-lg pl-9 pr-4 py-2.5 text-xs text-slate-200 placeholder-slate-600 focus:outline-none transition-colors disabled:opacity-50"
                    />
                  </div>
                  <button
                    onClick={() => runAiTask(aiTask)}
                    disabled={!aiTask.trim() || aiRunning || running}
                    className={cn(
                      "px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all shrink-0",
                      aiTask.trim() && !aiRunning && !running
                        ? "bg-violet-600 hover:bg-violet-500 text-white shadow shadow-violet-500/20"
                        : "bg-slate-800 text-slate-600 cursor-not-allowed"
                    )}
                  >
                    {aiRunning
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Send className="w-3.5 h-3.5" />}
                    {aiRunning ? "Running" : "Ask"}
                  </button>
                </div>

                {/* Error */}
                {aiError && (
                  <div className="text-[10px] text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded px-3 py-2">
                    {aiError}
                  </div>
                )}

                {/* Suggestion chips */}
                <div className="flex flex-wrap gap-1.5">
                  {AI_SUGGESTIONS.slice(0, 5).map((s) => (
                    <button
                      key={s}
                      onClick={() => { setAiTask(s); aiInputRef.current?.focus(); }}
                      disabled={aiRunning || running}
                      className="px-2.5 py-1 bg-violet-500/10 hover:bg-violet-500/20 border border-violet-500/20 rounded-full text-[9px] text-violet-300 transition-colors disabled:opacity-40"
                    >
                      {s}
                    </button>
                  ))}
                </div>

                {/* Last result summary */}
                {lastResult && (
                  <div className="border border-violet-500/20 rounded-lg overflow-hidden">
                    <button
                      onClick={() => setResultOpen((v) => !v)}
                      className="w-full px-3 py-2 flex items-center justify-between bg-violet-500/5 hover:bg-violet-500/10 transition-colors"
                    >
                      <span className="text-[10px] font-bold text-violet-300 flex items-center gap-1.5">
                        <BrainCircuit className="w-3 h-3" />
                        Last Agent Run — {lastResult.commands.length} command{lastResult.commands.length !== 1 ? "s" : ""} executed
                      </span>
                      {resultOpen ? <ChevronUp className="w-3 h-3 text-slate-500" /> : <ChevronDown className="w-3 h-3 text-slate-500" />}
                    </button>
                    <AnimatePresence initial={false}>
                      {resultOpen && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: "auto" }}
                          exit={{ height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="px-3 py-2 space-y-2 max-h-40 overflow-y-auto custom-scrollbar">
                            {lastResult.commands.map((cmd, i) => (
                              <div key={i} className="flex items-start gap-2">
                                <span className="text-[9px] text-emerald-500 font-mono shrink-0 mt-0.5">❯</span>
                                <span className="text-[9px] font-mono text-slate-300">{cmd}</span>
                              </div>
                            ))}
                            {lastResult.summary && (
                              <div className="pt-1 border-t border-slate-800 text-[10px] text-violet-200 leading-relaxed">
                                {lastResult.summary}
                              </div>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Terminal window ── */}
      <div className="flex-1 bg-slate-950 border border-slate-800 rounded-xl flex flex-col overflow-hidden min-h-0">
        {/* Header bar */}
        <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between shrink-0 bg-slate-900">
          <div className="flex items-center gap-2.5">
            <div className="flex gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full bg-rose-500/80" />
              <div className="w-2.5 h-2.5 rounded-full bg-amber-500/80" />
              <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/80" />
            </div>
            <Terminal className="w-3.5 h-3.5 text-emerald-400" />
            <span className="text-[11px] font-mono text-slate-400 font-bold">SALAMANDA — Network Terminal</span>
            {(running || aiRunning) && (
              <span className="flex items-center gap-1 text-[10px] text-amber-400 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                {aiRunning ? "agent running…" : "running…"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <button onClick={copyOutput} title="Copy all output" className="p-1.5 text-slate-600 hover:text-slate-300 transition-colors">
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </button>
            <button onClick={() => setLines([])} title="Clear (Ctrl+L)" className="p-1.5 text-slate-600 hover:text-slate-300 transition-colors">
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Output area */}
        <div
          className="flex-1 overflow-y-auto p-4 font-mono text-xs space-y-1.5 custom-scrollbar"
          onClick={(e) => { if (e.target === e.currentTarget) inputRef.current?.focus(); }}
        >
          <AnimatePresence initial={false}>
            {lines.map((line) => (
              <motion.div
                key={line.id}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.1 }}
              >
                {line.type === "banner" && (
                  <div className="text-emerald-400/70 text-[10px] leading-relaxed whitespace-pre-wrap mb-2 border border-emerald-500/20 bg-emerald-500/5 rounded p-2">
                    {line.text}
                  </div>
                )}
                {line.type === "input" && (
                  <div className="flex items-start gap-2 text-amber-400">
                    <span className="text-emerald-500 shrink-0 mt-0.5">❯</span>
                    <span className="break-all">{line.text}</span>
                    <span className="ml-auto text-[9px] text-slate-700 shrink-0 mt-0.5">{format(line.timestamp, "HH:mm:ss")}</span>
                  </div>
                )}
                {line.type === "output" && (
                  <div className="text-slate-300 whitespace-pre-wrap leading-relaxed pl-4 break-all">{line.text}</div>
                )}
                {line.type === "error" && (
                  <div className="text-rose-400 whitespace-pre-wrap leading-relaxed pl-4 break-all">{line.text}</div>
                )}
                {line.type === "info" && (
                  <div className="text-slate-500 italic pl-4">{line.text}</div>
                )}
                {line.type === "ai-plan" && (
                  <div className="flex items-start gap-2 text-[10px] text-violet-300 bg-violet-500/8 border border-violet-500/20 rounded px-3 py-1.5 my-1">
                    <BrainCircuit className="w-3 h-3 shrink-0 mt-0.5 text-violet-400" />
                    <span className="leading-relaxed">{line.text}</span>
                  </div>
                )}
                {line.type === "ai-summary" && (
                  <div className="flex items-start gap-2 text-[10px] text-violet-200 bg-violet-500/10 border border-violet-500/30 rounded px-3 py-2 my-1">
                    <Sparkles className="w-3 h-3 shrink-0 mt-0.5 text-violet-300" />
                    <span className="leading-relaxed">{line.text}</span>
                  </div>
                )}
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={outputEndRef} />
        </div>

        {/* Input row */}
        <div className="px-4 py-2.5 border-t border-slate-800 bg-slate-900/50 flex items-center gap-2 shrink-0">
          <ChevronRight className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <input
            ref={inputRef}
            value={input}
            onChange={(e) => { setInput(e.target.value); setHistoryIdx(-1); }}
            onKeyDown={handleKeyDown}
            disabled={running || aiRunning}
            placeholder={running || aiRunning ? "Busy…" : "Type a command or press Tab to autocomplete…"}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            className="flex-1 bg-transparent text-xs font-mono text-slate-200 placeholder-slate-700 focus:outline-none disabled:opacity-50"
          />
          <span className="text-[9px] text-slate-700 font-mono shrink-0 hidden sm:inline">↑↓ history · Tab · Ctrl+L</span>
        </div>
      </div>

      {/* ── Quick-command palette ── */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shrink-0">
        <div className="px-4 py-2.5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wifi className="w-3.5 h-3.5 text-amber-400" />
            <span className="text-[11px] font-bold text-slate-300 uppercase tracking-widest">Quick Commands</span>
          </div>
          <div className="flex gap-1 flex-wrap">
            {GROUPS.map((g) => (
              <button
                key={g}
                onClick={() => setActiveGroup(g)}
                className={cn(
                  "px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider transition-colors",
                  activeGroup === g
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                    : "text-slate-600 hover:text-slate-400"
                )}
              >
                {g}
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 p-3">
          {QUICK_COMMANDS.filter((c) => c.group === activeGroup).map((qc) => (
            <button
              key={qc.cmd}
              onClick={() => runCommand(qc.cmd)}
              disabled={running || aiRunning}
              title={qc.desc}
              className={cn(
                "flex flex-col items-start gap-0.5 px-3 py-2 rounded-lg border text-left transition-all",
                "bg-slate-950 border-slate-800 hover:border-amber-500/40 hover:bg-amber-500/5",
                "disabled:opacity-40 disabled:cursor-not-allowed"
              )}
            >
              <span className="text-[10px] font-bold text-slate-200">{qc.label}</span>
              <span className="text-[9px] text-slate-600 leading-relaxed line-clamp-2">{qc.desc}</span>
            </button>
          ))}
        </div>
        <div className="px-4 py-2 border-t border-slate-800 flex items-center gap-2 bg-slate-950/30">
          <Info className="w-3 h-3 text-slate-600 shrink-0" />
          <p className="text-[9px] text-slate-600">
            Full shell access — commands run as the current user. AI agent powered by najod.
          </p>
        </div>
      </div>
    </motion.div>
  );
}
