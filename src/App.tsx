/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence } from "motion/react";
import { GoogleGenAI } from "@google/genai";
import { insforge } from "./lib/insforge";
import { LoginPage } from "./pages/LoginPage";

import { useWidsData } from "./hooks/useWidsData";
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
import { SettingsTab } from "./tabs/SettingsTab";

import type { Device } from "./types";

export default function App() {
  const [authChecked, setAuthChecked] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    insforge.auth.getCurrentUser().then(({ data }) => {
      setIsAuthenticated(!!data?.user);
      setAuthChecked(true);
    });
  }, []);

  if (!authChecked) {
    return (
      <div className="h-screen w-full bg-slate-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <LoginPage onLogin={() => setIsAuthenticated(true)} />;
  }

  return <Dashboard onSignOut={() => setIsAuthenticated(false)} />;
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
    clearAlertBadge,
    updateDeviceStatus,
    dismissAlert,
    clearAllAlerts,
    saveConfig,
    refetch: fetchData,
  } = useWidsData();

  const [selectedTab, setSelectedTab] = useState<TabId>("dashboard");
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState(
    `You are a cybersecurity expert analyzing logs from a Wireless Intrusion Detection System (WIDS).
Current Alerts: {{ALERTS}}
Current Network Density: {{DEVICES}} devices detected.

Provide a concise security posture assessment and 3 actionable recommendations for the network administrator.
Keep it professional and technical but accessible. Format in Markdown.`.trim()
  );

  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  const runAiAnalysis = useCallback(async () => {
    setIsAnalyzing(true);
    setAiAnalysis(null);
    try {
      const prompt = customPrompt
        .replace("{{ALERTS}}", JSON.stringify(alerts.slice(0, 10)))
        .replace("{{DEVICES}}", String(devices.length));
      const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: prompt,
      });
      setAiAnalysis(response.text ?? "No analysis generated.");
    } catch {
      setAiAnalysis("Error running analysis. Check your GEMINI_API_KEY in the .env file.");
    } finally {
      setIsAnalyzing(false);
    }
  }, [alerts, devices, customPrompt]);

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

  // Only recompute when alerts array reference changes
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
        <section className="flex-1 lg:col-span-7 p-4 md:p-6 overflow-y-auto lg:overflow-hidden flex flex-col gap-6 custom-scrollbar">
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
            {selectedTab === "settings" && (
              <Fragment key="settings">
                <ErrorBoundary fallbackLabel="Settings Error">
                  <SettingsTab
                    customPrompt={customPrompt}
                    onPromptChange={setCustomPrompt}
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
          <span className="text-sky-500 font-bold uppercase whitespace-nowrap">SALAMANDA v2.0</span>
          <button
            onClick={handleSignOut}
            className="text-slate-500 hover:text-rose-400 font-bold uppercase transition-colors"
          >
            Sign Out
          </button>
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
