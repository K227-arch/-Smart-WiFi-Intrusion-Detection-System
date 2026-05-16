import { BrainCircuit, Menu, RefreshCw, ShieldAlert, X } from "lucide-react";
import { motion } from "motion/react";
import { cn } from "../lib/utils";
import type { SystemStatus } from "../types";
import { SalamandaLogo } from "./SalamandaLogo";

interface HeaderProps {
  status: SystemStatus | null;
  highSeverityCount: number;
  isAnalyzing: boolean;
  isMenuOpen: boolean;
  onToggleMenu: () => void;
  onRunAnalysis: () => void;
  onRefresh: () => void;
}

export function Header({
  status,
  highSeverityCount,
  isAnalyzing,
  isMenuOpen,
  onToggleMenu,
  onRunAnalysis,
  onRefresh,
}: HeaderProps) {
  return (
    <nav className="h-16 border-b border-slate-800 bg-slate-900/50 px-4 md:px-6 flex items-center justify-between shrink-0 z-50">
      <div className="flex items-center gap-3">
        <button
          onClick={onToggleMenu}
          className="p-2 md:hidden text-slate-400 hover:text-white"
          aria-label="Toggle menu"
        >
          {isMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
        <div className="w-9 h-9 bg-slate-900 border border-slate-700 rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
          <SalamandaLogo className="w-8 h-8" />
        </div>
        <span className="text-lg md:text-xl font-bold tracking-tight text-white hidden sm:block">
          SALA<span className="text-sky-500">MANDA</span>
        </span>
        <span className="hidden lg:block ml-4 px-2 py-1 text-[10px] font-mono bg-slate-800 rounded border border-slate-700 text-sky-400">
          v2.0.0
        </span>
      </div>

      <div className="flex items-center gap-2 md:gap-4">
        <div className="hidden md:flex items-center gap-2">
          <div
            className={cn(
              "w-2 h-2 rounded-full animate-pulse",
              status?.monitoring ? "bg-emerald-500" : "bg-rose-500"
            )}
          />
          <span
            className={cn(
              "text-xs font-medium uppercase tracking-wider",
              status?.monitoring ? "text-emerald-500" : "text-rose-500"
            )}
          >
            {status?.monitoring ? "Active" : "Offline"}
          </span>
        </div>

        <div className="hidden md:block h-4 w-[1px] bg-slate-800" />

        {highSeverityCount > 0 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="flex items-center gap-1.5 px-2 py-1 bg-rose-500/20 border border-rose-500/40 rounded text-[10px] font-bold text-rose-400 uppercase"
          >
            <ShieldAlert className="w-3 h-3" />
            <span>{highSeverityCount} Critical</span>
          </motion.div>
        )}

        <button
          onClick={onRunAnalysis}
          disabled={isAnalyzing}
          className="flex items-center gap-2 px-2 md:px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-[10px] md:text-xs font-medium transition-colors whitespace-nowrap disabled:opacity-60"
        >
          <BrainCircuit
            className={cn(
              "w-3 md:w-3.5 h-3 md:h-3.5 text-sky-400",
              isAnalyzing && "animate-spin"
            )}
          />
          <span className="hidden xs:inline">
            {isAnalyzing ? "Analyzing..." : "AI Insight"}
          </span>
        </button>

        <button
          onClick={onRefresh}
          title="Refresh data now (auto-refreshes every 30 min)"
          className="p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-slate-400 hover:text-white transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>

        <div className="text-right hidden xs:block">
          <div className="text-[10px] uppercase text-slate-500 leading-none">Interface</div>
          <div className="text-[10px] md:text-xs font-mono text-slate-300">wlan0mon</div>
        </div>
      </div>
    </nav>
  );
}
