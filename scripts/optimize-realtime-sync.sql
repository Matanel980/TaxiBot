-- =====================================================
-- Optimize Realtime Sync Performance
-- Run this in Supabase SQL Editor
-- =====================================================

-- 1. Set REPLICA IDENTITY for efficient realtime updates
-- This tells PostgreSQL to include all columns in the WAL (Write-Ahead Log)
-- which is required for Supabase Realtime to send full row updates
ALTER TABLE profiles REPLICA IDENTITY FULL;

-- 2. Ensure Realtime publication includes profiles table
ALTER PUBLICATION supabase_realtime DROP TABLE IF EXISTS profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;

-- 3. Create index for faster realtime queries on driver updates
CREATE INDEX IF NOT EXISTS profiles_realtime_idx 
ON profiles(role, is_online, updated_at) 
WHERE role = 'driver' AND is_online = true;

-- 4. Optimize location update queries
CREATE INDEX IF NOT EXISTS profiles_location_realtime_idx 
ON profiles(latitude, longitude, updated_at) 
WHERE role = 'driver' AND is_online = true AND latitude IS NOT NULL AND longitude IS NOT NULL;

-- 5. Optimize for presence tracking
CREATE INDEX IF NOT EXISTS profiles_presence_idx 
ON profiles(id, is_online) 
WHERE role = 'driver';

-- Verify Realtime is enabled
SELECT 
  schemaname,
  tablename,
  pubname
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime' AND tablename = 'profiles';

-- Verify REPLICA IDENTITY is set
SELECT 
  schemaname,
  tablename,
  relreplident
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname = 'profiles' AND n.nspname = 'public';

-- Expected result: relreplident = 'f' (FULL)
-- 'd' = default (nothing)
-- 'n' = nothing
-- 'f' = full
-- 'i' = index







