/**
 * SALAMANDA WIDS - Supabase Database Client
 * Replaces InsForge with Supabase for database operations
 */

import { createClient } from "@supabase/supabase-js";

// Server-side client with secret key for admin operations
const supabaseUrl = process.env.SUPABASE_URL ?? "https://kuntnvlvyuqetiorvlve.supabase.co";
const supabaseKey = process.env.SUPABASE_SECRET_KEY ?? "";

export const supabase = createClient(supabaseUrl, supabaseKey);

// Client-side client (anon key) for frontend
export const supabaseClient = createClient(
  import.meta.env.VITE_SUPABASE_URL ?? supabaseUrl,
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ""
);

// Types matching Supabase schema
export interface User {
  id: string;
  email: string;
  name?: string;
  avatar_url?: string;
  created_at: string;
}

export interface Device {
  mac: string;
  ip_address?: string;
  hostname?: string;
  ssid?: string;
  status: "trusted" | "unknown" | "blocked";
  first_seen: number;
  last_seen: number;
  avg_signal?: number;
  total_packets: number;
  created_at: string;
  updated_at: string;
}

export interface Alert {
  id: string;
  type: string;
  severity: "high" | "medium" | "low";
  source_ip?: string;
  source_mac?: string;
  target_ip?: string;
  target_mac?: string;
  description: string;
  details?: any;
  dismissed: boolean;
  timestamp: number;
  created_at: string;
}

export interface EngineConfig {
  id: number;
  known_networks: any[];
  trusted_macs: string[];
  deauth_threshold: number;
  deauth_window_ms: number;
  dedup_window_ms: number;
  updated_at: number;
}

// Database helper functions
export const db = {
  // Devices
  async getDevices(): Promise<Device[]> {
    const { data, error } = await supabase
      .from("devices")
      .select("*")
      .order("last_seen", { ascending: false });
    if (error) throw error;
    return data || [];
  },

  async upsertDevice(device: Partial<Device>): Promise<Device> {
    const { data, error } = await supabase
      .from("devices")
      .upsert(device)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async updateDeviceStatus(mac: string, status: "trusted" | "unknown" | "blocked"): Promise<void> {
    const { error } = await supabase
      .from("devices")
      .update({ status, updated_at: Date.now() })
      .eq("mac", mac);
    if (error) throw error;
  },

  // Alerts
  async getAlerts(limit = 100, dismissed = false): Promise<Alert[]> {
    const { data, error } = await supabase
      .from("alerts")
      .select("*")
      .eq("dismissed", dismissed)
      .order("timestamp", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data || [];
  },

  async createAlert(alert: Partial<Alert>): Promise<Alert> {
    const { data, error } = await supabase
      .from("alerts")
      .insert(alert)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  async dismissAlert(id: string): Promise<void> {
    const { error } = await supabase
      .from("alerts")
      .update({ dismissed: true })
      .eq("id", id);
    if (error) throw error;
  },

  // Engine Config
  async getEngineConfig(): Promise<EngineConfig | null> {
    const { data, error } = await supabase
      .from("engine_config")
      .select("*")
      .eq("id", 1)
      .single();
    if (error && error.code !== "PGRST116") throw error;
    return data;
  },

  async updateEngineConfig(config: Partial<EngineConfig>): Promise<EngineConfig> {
    const { data, error } = await supabase
      .from("engine_config")
      .update({ ...config, updated_at: Date.now() })
      .eq("id", 1)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // Stats
  async getDetectionStats(): Promise<any> {
    const { data, error } = await supabase
      .from("detection_stats")
      .select("*")
      .order("timestamp", { ascending: false })
      .limit(1)
      .single();
    if (error && error.code !== "PGRST116") throw error;
    return data;
  },

  async recordDetectionStats(stats: any): Promise<void> {
    const { error } = await supabase
      .from("detection_stats")
      .insert(stats);
    // Silently ignore errors for fire-and-forget stats
  },
};