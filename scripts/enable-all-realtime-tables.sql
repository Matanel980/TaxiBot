-- ============================================
-- Enable Realtime Replication for All Required Tables
-- Run this in Supabase SQL Editor
-- ============================================
-- This script enables Realtime for all tables used in the TaxiBot application

-- 1. Enable profiles table (for driver location and status updates)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
    RAISE NOTICE '✅ Added profiles table to supabase_realtime publication';
  ELSE
    RAISE NOTICE 'ℹ️ profiles table is already in supabase_realtime publication';
  END IF;
END $$;

-- 2. Enable trips table (for trip status updates - pending, active, completed)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'trips'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE trips;
    RAISE NOTICE '✅ Added trips table to supabase_realtime publication';
  ELSE
    RAISE NOTICE 'ℹ️ trips table is already in supabase_realtime publication';
  END IF;
END $$;

-- 3. Enable zones_postgis table (for zone updates - when admin creates/edits zones)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 
    FROM pg_publication_tables 
    WHERE pubname = 'supabase_realtime' 
    AND tablename = 'zones_postgis'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE zones_postgis;
    RAISE NOTICE '✅ Added zones_postgis table to supabase_realtime publication';
  ELSE
    RAISE NOTICE 'ℹ️ zones_postgis table is already in supabase_realtime publication';
  END IF;
END $$;

-- Verify all tables in replication
SELECT 
  schemaname,
  tablename,
  pubname,
  CASE 
    WHEN tablename IN ('profiles', 'trips', 'zones_postgis') THEN '✅ Required'
    ELSE 'Optional'
  END as status
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename IN ('profiles', 'trips', 'zones_postgis')
ORDER BY 
  CASE tablename
    WHEN 'profiles' THEN 1
    WHEN 'trips' THEN 2
    WHEN 'zones_postgis' THEN 3
  END;

-- Summary
SELECT 
  COUNT(*) FILTER (WHERE tablename = 'profiles') as profiles_enabled,
  COUNT(*) FILTER (WHERE tablename = 'trips') as trips_enabled,
  COUNT(*) FILTER (WHERE tablename = 'zones_postgis') as zones_enabled
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename IN ('profiles', 'trips', 'zones_postgis');








