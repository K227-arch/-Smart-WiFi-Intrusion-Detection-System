-- Create tables for SALAMANDA WIDS

-- Users table (local auth storage)
CREATE TABLE IF NOT EXISTS local_users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  otp_secret TEXT,
  otp_enabled BOOLEAN DEFAULT false,
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Devices table
CREATE TABLE IF NOT EXISTS devices (
  mac TEXT PRIMARY KEY,
  first_seen TIMESTAMPTZ NOT NULL,
  last_seen TIMESTAMPTZ NOT NULL,
  status TEXT DEFAULT 'unknown',
  ssid TEXT,
  avg_signal INTEGER,
  ip_address TEXT,
  hostname TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alerts table
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY,
  timestamp TIMESTAMPTZ NOT NULL,
  type TEXT NOT NULL,
  severity TEXT NOT NULL,
  description TEXT NOT NULL,
  target_mac TEXT,
  target_ip TEXT,
  details JSONB,
  dismissed BOOLEAN DEFAULT false,
  dismissed_at TIMESTAMPTZ,
  dismissed_by TEXT
);

-- Detection stats table
CREATE TABLE IF NOT EXISTS detection_stats (
  id INTEGER PRIMARY KEY DEFAULT 1,
  detection_counts JSONB NOT NULL DEFAULT '{}',
  last_detection_type TEXT,
  last_detection_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Traffic buckets table
CREATE TABLE IF NOT EXISTS traffic_buckets (
  id BIGSERIAL PRIMARY KEY,
  time TIMESTAMPTZ NOT NULL,
  device_mac TEXT,
  packet_count INTEGER NOT NULL DEFAULT 0,
  byte_count BIGINT NOT NULL DEFAULT 0,
  data_count INTEGER NOT NULL DEFAULT 0,
  mgmt_count INTEGER NOT NULL DEFAULT 0
);

-- User sessions table
CREATE TABLE IF NOT EXISTS user_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  name TEXT,
  avatar_url TEXT,
  ip_address TEXT,
  subnet TEXT,
  connected_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN DEFAULT true
);

-- Engine config table
CREATE TABLE IF NOT EXISTS engine_config (
  id INTEGER PRIMARY KEY DEFAULT 1,
  config JSONB NOT NULL DEFAULT '{}',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default detection_stats row
INSERT INTO detection_stats (id, detection_counts) VALUES (1, '{}') ON CONFLICT (id) DO NOTHING;