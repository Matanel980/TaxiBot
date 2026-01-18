-- ============================================
-- Enable Realtime Replication for Profiles Table
-- Run this in Supabase SQL Editor
-- ============================================
-- This script ensures that the profiles table is enabled for Realtime
-- so that location updates from drivers are broadcast to admin dashboard

-- Check if profiles table is already in the replication publication
DO $$
BEGIN
  -- Add profiles table to supabase_realtime publication if not already added
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
    RAISE NOTICE 'Added profiles table to supabase_realtime publication';
  ELSE
    RAISE NOTICE 'profiles table is already in supabase_realtime publication';
  END IF;
END $$;

-- Verify the replication status
SELECT 
  schemaname,
  tablename,
  pubname
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename = 'profiles';

-- Also ensure trips table is enabled (for trip status updates)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'trips'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE trips;
    RAISE NOTICE 'Added trips table to supabase_realtime publication';
  ELSE
    RAISE NOTICE 'trips table is already in supabase_realtime publication';
  END IF;
END $$;

-- Verify all tables in replication
SELECT 
  schemaname,
  tablename,
  pubname
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
ORDER BY tablename;








