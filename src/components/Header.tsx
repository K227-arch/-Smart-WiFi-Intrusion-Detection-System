import { BrainCircuit, LogOut, Menu, RefreshCw, ShieldAlert, User, Users, X } from "lucide-react";
import { memo, useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { cn } from "../lib/utils";
import type { SystemStatus } from "../types";
import { SalamandaLogo } from "./SalamandaLogo";
import type { ActiveUser } from "../hooks/useSession";

interface HeaderProps {
  status: SystemStatus | null;
  highSeverityCount: number;
  isAnalyzing: boolean;
  isMenuOpen: boolean;
  onToggleMenu: () => void;
  onRunAnalysis: () => void;
  onRefresh: () => void;
  user?: { email: string; name?: string; avatar_url?: string } | null;
  onSignOut?: () => void;
  activeUsers?: ActiveUser[];
}

export const Header = memo(function Header({
  status,
  highSeverityCount,
  isAnalyzing,
  isMenuOpen,
  onToggleMenu,
  onRunAnalysis,
  onRefresh,
  user,
  onSignOut,
  activeUsers = [],
}: HeaderProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const initials = user?.name
    ? user.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
    : user?.email?.[0]?.toUpperCase() ?? "?";

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
        <div className="w-10 h-10 bg-slate-900 border border-amber-500/30 rounded-lg flex items-center justify-center shrink-0 overflow-hidden">
          <SalamandaLogo className="w-9 h-9" />
        </div>
        <span className="text-lg md:text-xl font-bold tracking-tight text-white hidden sm:block">
          SALA<span className="text-amber-500">MANDA</span>
        </span>
        <span className="hidden lg:block ml-4 px-2 py-1 text-[10px] font-mono bg-slate-800 rounded border border-slate-700 text-amber-400">
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
              "w-3 md:w-3.5 h-3 md:h-3.5 text-amber-400",
              isAnalyzing && "animate-spin"
            )}
          />
          <span className="hidden xs:inline">
            {isAnalyzing ? "Analyzing..." : "ML Insight"}
          </span>
        </button>

        <button
          onClick={onRefresh}
          title="Refresh data now"
          className="p-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-slate-400 hover:text-white transition-colors"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>

        {/* ── Active users on this network ── */}
        {activeUsers.length > 0 && (
          <div className="relative group hidden sm:flex items-center gap-1.5 px-2 py-1 bg-slate-800 border border-slate-700 rounded cursor-default">
            <Users className="w-3 h-3 text-emerald-400" />
            <span className="text-[10px] font-bold text-emerald-400">{activeUsers.length}</span>
            {/* Tooltip */}
            <div className="absolute right-0 top-full mt-2 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl shadow-black/40 z-50 opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity duration-150">
              <div className="px-3 py-2 border-b border-slate-800">
                <p className="text-[9px] text-slate-500 uppercase font-bold tracking-widest">Also viewing this dashboard</p>
              </div>
              <div className="p-2 space-y-1 max-h-48 overflow-y-auto">
                {activeUsers.map((u) => {
                  const initials = u.name
                    ? u.name.split(" ").map((n) => n[0]).join("").toUpperCase().slice(0, 2)
                    : u.email[0]?.toUpperCase() ?? "?";
                  return (
                    <div key={u.userId} className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-slate-800">
                      {u.avatarUrl ? (
                        <img src={u.avatarUrl} alt="" className="w-6 h-6 rounded-full object-cover border border-slate-700" />
                      ) : (
                        <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center text-white text-[9px] font-bold shrink-0">
                          {initials}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-[10px] font-semibold text-slate-200 truncate">
                          {u.name ?? u.email.split("@")[0]}
                        </div>
                        <div className="text-[9px] text-slate-500 truncate">{u.ip ?? u.subnet ?? "unknown IP"}</div>
                      </div>
                      <span className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        <div className="text-right hidden xs:block">
          <div className="text-[10px] uppercase text-slate-500 leading-none">Interface</div>
          <div className="text-[10px] md:text-xs font-mono text-slate-300">{status?.activeInterface ?? "—"}</div>
        </div>

        {/* ── User profile avatar + dropdown ── */}
        {user && (
          <div className="relative" ref={dropdownRef}>
            <button
              onClick={() => setDropdownOpen((v) => !v)}
              className="flex items-center gap-2 pl-1 pr-2 py-1 rounded-lg hover:bg-slate-800 border border-transparent hover:border-slate-700 transition-all"
            >
              {/* Avatar */}
              {user.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.name ?? user.email}
                  className="w-8 h-8 rounded-full object-cover border-2 border-amber-500/40"
                />
              ) : (
                <div className="w-8 h-8 rounded-full bg-amber-600 border-2 border-amber-500/40 flex items-center justify-center text-white text-xs font-bold select-none">
                  {initials}
                </div>
              )}
              {/* Name — hidden on small screens */}
              <div className="hidden sm:block text-left">
                <div className="text-[11px] font-semibold text-slate-200 leading-tight max-w-[120px] truncate">
                  {user.name ?? user.email.split("@")[0]}
                </div>
                <div className="text-[9px] text-slate-500 leading-tight max-w-[120px] truncate">
                  {user.email}
                </div>
              </div>
            </button>

            {/* Dropdown */}
            <AnimatePresence>
              {dropdownOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -6, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -6, scale: 0.97 }}
                  transition={{ duration: 0.12 }}
                  className="absolute right-0 top-full mt-2 w-56 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl shadow-black/40 overflow-hidden z-50"
                >
                  {/* Profile info */}
                  <div className="px-4 py-3 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                      {user.avatar_url ? (
                        <img src={user.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover border-2 border-amber-500/40" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-amber-600 flex items-center justify-center text-white text-sm font-bold">
                          {initials}
                        </div>
                      )}
                      <div className="min-w-0">
                        <div className="text-sm font-semibold text-white truncate">
                          {user.name ?? user.email.split("@")[0]}
                        </div>
                        <div className="text-[10px] text-slate-400 truncate">{user.email}</div>
                      </div>
                    </div>
                  </div>

                  {/* Role badge */}
                  <div className="px-4 py-2 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                      <User className="w-3 h-3 text-amber-400" />
                      <span className="text-[10px] text-slate-400">Role:</span>
                      <span className="text-[10px] font-bold text-amber-400 uppercase">Network Admin</span>
                    </div>
                  </div>

                  {/* Sign out */}
                  <button
                    onClick={() => { setDropdownOpen(false); onSignOut?.(); }}
                    className="w-full flex items-center gap-2 px-4 py-3 text-sm text-rose-400 hover:bg-rose-500/10 transition-colors"
                  >
                    <LogOut className="w-4 h-4" />
                    Sign Out
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </div>
    </nav>
  );
});
