-- ============================================
-- Push Notifications & Webhooks Migration
-- Run this in Supabase SQL Editor
-- ============================================
-- 
-- This migration adds:
-- 1. Missing columns to trips table (zone_id, pickup_lat, pickup_lng)
-- 2. push_tokens table for storing device push notification tokens
-- 3. Indexes and RLS policies
--
-- Run this AFTER the base migration (supabase-migration.sql)
-- ============================================

-- Step 1: Add missing columns to trips table
ALTER TABLE trips 
ADD COLUMN IF NOT EXISTS zone_id UUID REFERENCES zones(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS pickup_lat DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS pickup_lng DECIMAL(11, 8);

-- Step 2: Create indexes for zone-based queries
CREATE INDEX IF NOT EXISTS trips_zone_id_idx ON trips(zone_id) WHERE zone_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS trips_pickup_coords_idx ON trips(pickup_lat, pickup_lng) WHERE pickup_lat IS NOT NULL;

-- Step 3: Create push_tokens table
CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL CHECK (platform IN ('web', 'ios', 'android')),
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true
);

-- Step 4: Create indexes for push_tokens
CREATE INDEX IF NOT EXISTS idx_push_tokens_driver_id ON push_tokens(driver_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_active ON push_tokens(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_push_tokens_driver_active ON push_tokens(driver_id, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_push_tokens_token ON push_tokens(token);

-- Step 5: Add updated_at trigger for push_tokens
DROP TRIGGER IF EXISTS update_push_tokens_updated_at ON push_tokens;
CREATE TRIGGER update_push_tokens_updated_at 
  BEFORE UPDATE ON push_tokens
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Step 6: Enable Row Level Security (RLS)
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- Step 7: Drop existing policies if they exist (for clean re-runs)
DROP POLICY IF EXISTS "Drivers can manage their own push tokens" ON push_tokens;
DROP POLICY IF EXISTS "Service role can manage all push tokens" ON push_tokens;

-- Step 8: Create RLS Policies for push_tokens
CREATE POLICY "Drivers can manage their own push tokens"
  ON push_tokens FOR ALL
  USING (auth.uid() = driver_id);

CREATE POLICY "Service role can manage all push tokens"
  ON push_tokens FOR ALL
  USING (auth.role() = 'service_role');

-- Step 9: Enable Realtime for push_tokens (optional - for monitoring)
ALTER PUBLICATION supabase_realtime ADD TABLE push_tokens;

-- ============================================
-- Migration Complete!
-- ============================================
-- 
-- Next steps:
-- 1. Verify tables were created: Check Table Editor in Supabase Dashboard
-- 2. Test RLS policies: Ensure drivers can only see their own tokens
-- 3. Proceed with API endpoint implementation
-- ============================================





