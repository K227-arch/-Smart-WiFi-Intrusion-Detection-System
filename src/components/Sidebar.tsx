import {
  Activity,
  BarChart2,
  Brain,
  History,
  Network,
  Server,
  Settings as SettingsIcon,
  Shield,
  ShieldAlert,
} from "lucide-react";
import { memo, useMemo } from "react";
import { cn, formatNumber, formatUptime } from "../lib/utils";
import type { Device, SystemStatus } from "../types";
import { NavButton } from "./ui/NavButton";
import { SidebarStat } from "./ui/SidebarStat";

export type TabId = "dashboard" | "traffic" | "devices" | "alerts" | "analytics" | "ml" | "network" | "snort" | "settings";

interface SidebarProps {
  selectedTab: TabId;
  isMenuOpen: boolean;
  newAlertCount: number;
  devices: Device[];
  status: SystemStatus | null;
  onTabChange: (tab: TabId) => void;
}

export const Sidebar = memo(function Sidebar({
  selectedTab,
  isMenuOpen,
  newAlertCount,
  devices,
  status,
  onTabChange,
}: SidebarProps) {
  // Derive counts once — don't recompute on every render
  const trustedCount = useMemo(() => devices.filter((d) => d.status === "trusted").length, [devices]);
  const trustedProgress = useMemo(
    () => (devices.length > 0 ? (trustedCount / devices.length) * 100 : 0),
    [trustedCount, devices.length]
  );
  return (
    <aside
      className={cn(
        "absolute lg:relative lg:col-span-2 border-r border-slate-800 bg-slate-900/95 lg:bg-slate-900/30 p-4 space-y-6 flex flex-col h-full z-40 transition-transform duration-300 ease-in-out w-64 lg:w-auto",
        isMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}
    >
      <div>
        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 font-mono">
          Core Modules
        </h3>
        <div className="space-y-1">
          <NavButton active={selectedTab === "dashboard"} onClick={() => onTabChange("dashboard")}>
            <span className="flex items-center gap-2">
              <Shield className="w-3.5 h-3.5" /> Dashboard
            </span>
          </NavButton>

          <NavButton active={selectedTab === "traffic"} onClick={() => onTabChange("traffic")}>
            <span className="flex items-center gap-2">
              <Activity className="w-3.5 h-3.5" /> Live Traffic
            </span>
          </NavButton>

          <NavButton active={selectedTab === "devices"} onClick={() => onTabChange("devices")}>
            <span className="flex items-center gap-2">
              <Server className="w-3.5 h-3.5" /> Device Registry
            </span>
          </NavButton>

          <NavButton active={selectedTab === "alerts"} onClick={() => onTabChange("alerts")}>
            <span className="flex items-center justify-between w-full">
              <span className="flex items-center gap-2">
                <History className="w-3.5 h-3.5" /> Forensic Logs
              </span>
              {newAlertCount > 0 && (
                <span className="px-1.5 py-0.5 bg-rose-500 text-white text-[9px] font-bold rounded-full min-w-[18px] text-center">
                  {newAlertCount > 99 ? "99+" : newAlertCount}
                </span>
              )}
            </span>
          </NavButton>

          <NavButton active={selectedTab === "analytics"} onClick={() => onTabChange("analytics")}>
            <span className="flex items-center gap-2">
              <BarChart2 className="w-3.5 h-3.5" /> Analytics
            </span>
          </NavButton>

          <NavButton active={selectedTab === "ml"} onClick={() => onTabChange("ml")}>
            <span className="flex items-center gap-2">
              <Brain className="w-3.5 h-3.5" /> ML Engine
            </span>
          </NavButton>

          <NavButton active={selectedTab === "network"} onClick={() => onTabChange("network")}>
            <span className="flex items-center gap-2">
              <Network className="w-3.5 h-3.5" /> Network
            </span>
          </NavButton>

          <NavButton active={selectedTab === "snort"} onClick={() => onTabChange("snort")}>
            <span className="flex items-center gap-2">
              <ShieldAlert className="w-3.5 h-3.5" /> Snort Rules
            </span>
          </NavButton>

          <NavButton active={selectedTab === "settings"} onClick={() => onTabChange("settings")}>
            <span className="flex items-center gap-2">
              <SettingsIcon className="w-3.5 h-3.5" /> Settings
            </span>
          </NavButton>
        </div>
      </div>

      <div className="pt-6 border-t border-slate-800 hidden lg:block">
        <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-4 font-mono">
          System Metrics
        </h3>
        <div className="space-y-4">
          <SidebarStat
            label="Packets Processed"
            value={status ? formatNumber(status.totalPacketsProcessed) : "—"}
            progress={Math.min(100, (status?.totalPacketsProcessed ?? 0) / 100)}
            color="bg-sky-500"
          />
          <SidebarStat
            label="Trusted Devices"
            value={`${trustedCount} / ${devices.length}`}
            progress={trustedProgress}
            color="bg-emerald-500"
          />
          <SidebarStat
            label="Uptime"
            value={status ? formatUptime(status.uptime) : "—"}
            progress={100}
            color="bg-purple-500"
          />
        </div>
      </div>

      <div className="flex-1" />

      <div className="p-3 bg-slate-900/50 rounded-xl border border-slate-800">
        <p className="text-[10px] text-slate-500 leading-relaxed italic">
          "Intelligent detection for resilient wireless environments."
        </p>
      </div>
    </aside>
  );
});
