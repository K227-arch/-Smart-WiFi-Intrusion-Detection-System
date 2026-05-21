/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";
import { insforge } from "./lib/insforge";
import { LoginPage } from "./pages/LoginPage";

import { useWidsData } from "./hooks/useWidsData";
import { useSession } from "./hooks/useSession";
import { useTheme } from "./hooks/useTheme";
import { formatUptime, formatNumber, cn } from "./lib/utils";

import { Header } from "./components/Header";
import { Sidebar, type TabId } from "./components/Sidebar";
import { IncidentTimeline } from "./components/IncidentTimeline";
import { DeviceModal } from "./components/DeviceModal";
import { ErrorBoundary } from "./components/ErrorBoundary";

import { DashboardTab } from "./tabs/DashboardTab";
import { DevicesTab } from "./tabs/DevicesTab";
import { AlertsTab } from "./tabs/AlertsTab";
import { LiveTrafficTab } from "./tabs/LiveTrafficTab";
import { AnalyticsTab } from "./tabs/AnalyticsTab";
import { MLTab } from "./tabs/MLTab";
import { NetworkTab } from "./tabs/NetworkTab";
import { SnortTab } from "./tabs/SnortTab";
import { SettingsTab } from "./tabs/SettingsTab";

import type { Alert, Analytics, Device, MLResult } from "./types";

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    // Check for OAuth callback — InsForge puts insforge_code in the URL after redirect
    const params = new URLSearchParams(window.location.search);
    const hasOAuthCode = params.has("insforge_code") || params.has("code");

    insforge.auth.getCurrentUser().then(({ data }) => {
      setIsAuthenticated(!!data?.user);
      setAuthChecked(true);
      // Clean up OAuth params from URL without triggering a reload
      if (hasOAuthCode) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    });
  }, []);

  if (!authChecked) {
    return (
      <div className="h-screen w-full bg-slate-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage onLogin={() => setIsAuthenticated(true)} />;
  }

  return <Dashboard onSignOut={() => setIsAuthenticated(false)} />;
}

// ── Local ML-based insight generator ─────────────────────────────────────────
function generateMlInsight(
  alerts: Alert[],
  devices: Device[],
  analytics: Analytics | null,
  mlResults: MLResult[]
): string {
  const lines: string[] = [];

  // ── Threat summary ──────────────────────────────────────────────────────
  const high = alerts.filter((a) => a.severity === "high").length;
  const medium = alerts.filter((a) => a.severity === "medium").length;
  const low = alerts.filter((a) => a.severity === "low").length;
  const total = alerts.length;

  lines.push("## Security Posture Assessment\n");

  if (total === 0) {
    lines.push("✅ **No active alerts.** Network posture is clean.\n");
  } else {
    const level = high > 0 ? "🔴 **CRITICAL**" : medium > 5 ? "🟠 **ELEVATED**" : "🟡 **MODERATE**";
    lines.push(`**Threat Level:** ${level}`);
    lines.push(`**Active Alerts:** ${total} total — ${high} critical, ${medium} medium, ${low} low\n`);
  }

  // ── Top attack types ────────────────────────────────────────────────────
  if (analytics?.detectionCounts) {
    const sorted = Object.entries(analytics.detectionCounts)
      .filter(([, v]) => v > 0)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);

    if (sorted.length > 0) {
      lines.push("**Top Detected Threats:**");
      const labels: Record<string, string> = {
        ROGUE_AP: "Rogue AP / Evil Twin",
        DEAUTH_ATTACK: "Deauth Flood (DoS)",
        MAC_SPOOFING: "MAC Spoofing",
        UNAUTHORIZED_DEVICE: "Unauthorized Device",
        CHANNEL_ANOMALY: "Channel Anomaly",
        PORT_SCAN: "Port Scan",
        BRUTE_FORCE: "Brute Force",
        ANOMALY: "ML Anomaly",
      };
      sorted.forEach(([type, count]) => {
        lines.push(`- ${labels[type] ?? type}: **${count}** detections`);
      });
      lines.push("");
    }
  }

  // ── ML scoring summary ──────────────────────────────────────────────────
  if (mlResults.length > 0) {
    const malicious = mlResults.filter((r) => r.score >= 0.75);
    const suspicious = mlResults.filter((r) => r.score >= 0.4 && r.score < 0.75);
    const avgScore = mlResults.reduce((s, r) => s + r.score, 0) / mlResults.length;

    lines.push("**ML Engine Analysis:**");
    lines.push(`- Devices scored: **${mlResults.length}**`);
    lines.push(`- Average anomaly score: **${(avgScore * 100).toFixed(1)}%**`);
    if (malicious.length > 0) {
      lines.push(`- 🔴 Malicious devices: **${malicious.length}** (score ≥ 75%)`);
      malicious.slice(0, 3).forEach((r) => {
        lines.push(`  - \`${r.mac}\` — score ${(r.score * 100).toFixed(0)}%, deauth ratio ${(r.features.deauthRatio * 100).toFixed(1)}%`);
      });
    }
    if (suspicious.length > 0) {
      lines.push(`- 🟠 Suspicious devices: **${suspicious.length}** (score 40–75%)`);
    }
    lines.push("");
  }

  // ── Device posture ──────────────────────────────────────────────────────
  const trusted = devices.filter((d) => d.status === "trusted").length;
  const blocked = devices.filter((d) => d.status === "blocked").length;
  const unknown = devices.filter((d) => d.status === "unknown").length;

  lines.push("**Device Registry:**");
  lines.push(`- Total: **${devices.length}** — ${trusted} trusted, ${unknown} unknown, ${blocked} blocked`);
  if (unknown > 10) {
    lines.push(`- ⚠️ ${unknown} unclassified devices — review and trust or block via Device Registry`);
  }
  lines.push("");

  // ── Recommendations ─────────────────────────────────────────────────────
  lines.push("## Recommendations\n");

  const recs: string[] = [];

  if (high > 0) {
    const rogueCount = alerts.filter((a) => a.type === "ROGUE_AP").length;
    if (rogueCount > 0) recs.push(`**Investigate ${rogueCount} Rogue AP alert(s)** — verify all BSSIDs in Settings → Known Networks match your legitimate access points.`);
    const deauthCount = alerts.filter((a) => a.type === "DEAUTH_ATTACK").length;
    if (deauthCount > 0) recs.push(`**Deauth flood detected (${deauthCount} events)** — consider lowering the deauth threshold in Settings and enabling 802.11w (Management Frame Protection) on your APs.`);
  }

  if (mlResults.some((r) => r.score >= 0.75)) {
    recs.push("**Block high-scoring ML devices** — navigate to Device Registry, filter by unknown, and block devices with high anomaly scores.");
  }

  if (unknown > 5) {
    recs.push(`**Classify ${unknown} unknown devices** — add legitimate device MACs to the Trusted Whitelist in Settings to reduce false positives.`);
  }

  const fpTotal = Object.values(analytics?.falsePositiveCounts ?? {}).reduce((a, b) => a + b, 0);
  if (fpTotal > 10) {
    recs.push(`**Tune detection thresholds** — ${fpTotal} alerts were dismissed as false positives. Increase the dedup window or deauth threshold in Settings to reduce noise.`);
  }

  if (recs.length === 0) {
    recs.push("Network posture is healthy. Continue monitoring and ensure known networks are configured in Settings.");
  }

  recs.forEach((r, i) => lines.push(`${i + 1}. ${r}`));

  return lines.join("\n");
}

function Dashboard({ onSignOut }: { onSignOut: () => void }) {
  const {
    alerts,
    devices,
    status,
    analytics,
    chartData,
    engineConfig,
    newAlertCount,
    mlResults,
    isLoading,
    clearAlertBadge,
    updateDeviceStatus,
    dismissAlert,
    clearAllAlerts,
    saveConfig,
    refetch: fetchData,
  } = useWidsData();

  const [currentUser, setCurrentUser] = useState<{ email: string; name?: string; avatar_url?: string; id?: string } | null>(null);

  useEffect(() => {
    insforge.auth.getCurrentUser().then(({ data }) => {
      if (data?.user) {
        setCurrentUser({
          id: data.user.id,
          email: data.user.email,
          name: data.user.profile?.name ?? undefined,
          avatar_url: data.user.profile?.avatar_url ?? undefined,
        });
      }
    });
  }, []);

  // ── Multi-user session tracking ───────────────────────────────────────────
  const { activeUsers } = useSession({
    userId: currentUser?.id ?? "anonymous",
    email: currentUser?.email ?? "",
    name: currentUser?.name,
    avatarUrl: currentUser?.avatar_url,
  });

  // ── Theme ─────────────────────────────────────────────────────────────────
  const { theme, toggleTheme } = useTheme();

  const [selectedTab, setSelectedTab] = useState<TabId>("dashboard");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);

  // ── ML-based insight — no external API needed ─────────────────────────
  const runAiAnalysis = useCallback(() => {
    setIsAnalyzing(true);
    setAiAnalysis(null);
    // Small timeout so the spinner renders before the synchronous work
    setTimeout(() => {
      try {
        const insight = generateMlInsight(alerts, devices, analytics, mlResults);
        setAiAnalysis(insight);
      } catch {
        setAiAnalysis("Error generating analysis. Please try again.");
      } finally {
        setIsAnalyzing(false);
      }
    }, 150);
  }, [alerts, devices, analytics, mlResults]);

  const handleTabChange = useCallback((tab: TabId) => {
    setSelectedTab(tab);
    setIsMenuOpen(false);
    if (tab === "alerts") clearAlertBadge();
  }, [clearAlertBadge]);

  const toggleMenu = useCallback(() => setIsMenuOpen((v) => !v), []);
  const closeMenu = useCallback(() => setIsMenuOpen(false), []);
  const exportLogs = useCallback(() => window.open("/api/alerts/export", "_blank"), []);

  const handleSignOut = useCallback(async () => {
    await insforge.auth.signOut();
    onSignOut();
  }, [onSignOut]);

  const highSeverityCount = useMemo(
    () => alerts.filter((a) => a.severity === "high").length,
    [alerts]
  );

  return (
    <div className="h-screen w-full bg-slate-950 text-slate-300 font-sans flex flex-col overflow-hidden select-none">
      <Header
        status={status}
        highSeverityCount={highSeverityCount}
        isAnalyzing={isAnalyzing}
        isMenuOpen={isMenuOpen}
        onToggleMenu={toggleMenu}
        onRunAnalysis={runAiAnalysis}
        onRefresh={fetchData}
        user={currentUser}
        onSignOut={handleSignOut}
        activeUsers={activeUsers}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      <main className="flex-1 flex flex-col lg:grid lg:grid-cols-12 gap-0 overflow-hidden relative">
        <Sidebar
          selectedTab={selectedTab}
          isMenuOpen={isMenuOpen}
          newAlertCount={newAlertCount}
          devices={devices}
          status={status}
          onTabChange={handleTabChange}
        />

        {/* Mobile overlay */}
        {isMenuOpen && (
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm z-30 lg:hidden"
            onClick={closeMenu}
          />
        )}

        {/* Main content area */}
        <section className="flex-1 lg:col-span-7 p-4 md:p-6 overflow-y-auto lg:overflow-hidden flex flex-col gap-6 custom-scrollbar relative">
          {/* Initial data loading overlay */}
          {isLoading && (
            <div className="absolute inset-0 bg-slate-950/60 backdrop-blur-sm z-20 flex items-center justify-center">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-[11px] text-amber-400 font-mono uppercase tracking-widest">Loading data…</span>
              </div>
            </div>
          )}
          <AnimatePresence mode="wait">
            {selectedTab === "dashboard" && (
              <Fragment key="dashboard">
                <ErrorBoundary fallbackLabel="Dashboard Error">
                  <DashboardTab
                    alerts={alerts}
                    devices={devices}
                    status={status}
                    chartData={chartData}
                    aiAnalysis={aiAnalysis}
                    isAnalyzing={isAnalyzing}
                    onRunAnalysis={runAiAnalysis}
                  />
                </ErrorBoundary>
              </Fragment>
            )}
            {selectedTab === "traffic" && (
              <Fragment key="traffic">
                <ErrorBoundary fallbackLabel="Live Traffic Error">
                  <LiveTrafficTab />
                </ErrorBoundary>
              </Fragment>
            )}
            {selectedTab === "devices" && (
              <Fragment key="devices">
                <ErrorBoundary fallbackLabel="Device Registry Error">
                  <DevicesTab
                    devices={devices}
                    onSelectDevice={setSelectedDevice}
                    onUpdateStatus={updateDeviceStatus}
                  />
                </ErrorBoundary>
              </Fragment>
            )}
            {selectedTab === "alerts" && (
              <Fragment key="alerts">
                <ErrorBoundary fallbackLabel="Forensic Logs Error">
                  <AlertsTab
                    alerts={alerts}
                    onExport={exportLogs}
                    onDismiss={dismissAlert}
                    onClearAll={clearAllAlerts}
                  />
                </ErrorBoundary>
              </Fragment>
            )}
            {selectedTab === "analytics" && (
              <Fragment key="analytics">
                <ErrorBoundary fallbackLabel="Analytics Error">
                  <AnalyticsTab
                    analytics={analytics}
                    chartData={chartData}
                  />
                </ErrorBoundary>
              </Fragment>
            )}
            {selectedTab === "ml" && (
              <Fragment key="ml">
                <ErrorBoundary fallbackLabel="ML Engine Error">
                  <MLTab analytics={analytics} mlResults={mlResults} />
                </ErrorBoundary>
              </Fragment>
            )}
            {selectedTab === "network" && (
              <Fragment key="network">
                <ErrorBoundary fallbackLabel="Network Monitor Error">
                  <NetworkTab />
                </ErrorBoundary>
              </Fragment>
            )}
            {selectedTab === "snort" && (
              <Fragment key="snort">
                <ErrorBoundary fallbackLabel="Snort Rules Error">
                  <SnortTab />
                </ErrorBoundary>
              </Fragment>
            )}
            {selectedTab === "settings" && (
              <Fragment key="settings">
                <ErrorBoundary fallbackLabel="Settings Error">
                  <SettingsTab
                    engineConfig={engineConfig}
                    onSaveConfig={saveConfig}
                  />
                </ErrorBoundary>
              </Fragment>
            )}
          </AnimatePresence>
        </section>

        <IncidentTimeline alerts={alerts} onExport={exportLogs} />
      </main>

      <DeviceModal
        device={selectedDevice}
        onClose={() => setSelectedDevice(null)}
        onUpdateStatus={(mac, newStatus) => {
          updateDeviceStatus(mac, newStatus);
          setSelectedDevice((prev) => (prev ? { ...prev, status: newStatus } : null));
        }}
      />

      {/* Footer */}
      <footer className="h-8 bg-slate-900 border-t border-slate-800 px-4 flex items-center justify-between text-[10px] text-slate-500 font-mono shrink-0">
        <div className="flex gap-4">
          <span className="hidden xs:inline">
            Uptime: {status ? formatUptime(status.uptime) : "—"}
          </span>
          <span className="hidden sm:inline">
            Pkts: {status ? formatNumber(status.totalPacketsProcessed) : "—"}
          </span>
        </div>
        <div className="flex gap-4">
          <span className={cn("font-bold uppercase hidden sm:inline", status?.monitoring ? "text-emerald-500" : "text-rose-500")}>
            {status?.monitoring ? "Engine Active" : "Engine Offline"}
          </span>
          <span className="text-amber-500 font-bold uppercase whitespace-nowrap">SALAMANDA v2.0</span>
        </div>
      </footer>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(51, 65, 85, 0.5); border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: rgba(51, 65, 85, 0.8); }
        @media (max-width: 640px) {
          .xs\\:hidden { display: none; }
          .xs\\:inline { display: inline; }
          .xs\\:block { display: block; }
        }
      `}</style>
    </div>
  );
}
