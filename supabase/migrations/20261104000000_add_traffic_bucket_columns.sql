-- Add missing columns to traffic_buckets table
ALTER TABLE traffic_buckets ADD COLUMN IF NOT EXISTS beacons_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE traffic_buckets ADD COLUMN IF NOT EXISTS deauth_count  INTEGER NOT NULL DEFAULT 0;
