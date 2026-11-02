-- Add total_packets_processed column to detection_stats
ALTER TABLE detection_stats ADD COLUMN IF NOT EXISTS total_packets_processed BIGINT DEFAULT 0;

-- Add false_positive_counts column (used by api/index.ts)
ALTER TABLE detection_stats ADD COLUMN IF NOT EXISTS false_positive_counts JSONB DEFAULT '{}';