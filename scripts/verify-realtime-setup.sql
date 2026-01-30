-- ============================================
-- Verify Supabase Realtime Setup
-- Run this in Supabase SQL Editor to diagnose subscription errors
-- ============================================

-- 1. Check if profiles table is in supabase_realtime publication
SELECT 
  schemaname,
  tablename,
  pubname,
  CASE 
    WHEN tablename = 'profiles' THEN '✅ CRITICAL - Required for driver location updates'
    WHEN tablename = 'trips' THEN '✅ CRITICAL - Required for trip status updates'
    WHEN tablename = 'zones_postgis' THEN '✅ CRITICAL - Required for zone updates'
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

-- 2. If profiles table is MISSING, run this to add it:
-- ALTER PUBLICATION supabase_realtime ADD TABLE profiles;

-- 3. Check REPLICA IDENTITY (required for full row updates in Realtime)
SELECT 
  schemaname,
  tablename,
  relreplident,
  CASE relreplident
    WHEN 'f' THEN '✅ FULL - All columns replicated (Required)'
    WHEN 'd' THEN '⚠️ DEFAULT - May not include all columns'
    WHEN 'n' THEN '❌ NOTHING - No replication (Will cause errors)'
    WHEN 'i' THEN 'ℹ️ INDEX - Uses index (May miss some columns)'
  END as replica_identity_status
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname IN ('profiles', 'trips', 'zones_postgis')
  AND n.nspname = 'public';

-- 4. If REPLICA IDENTITY is not FULL, run this to fix:
-- ALTER TABLE profiles REPLICA IDENTITY FULL;
-- ALTER TABLE trips REPLICA IDENTITY FULL;
-- ALTER TABLE zones_postgis REPLICA IDENTITY FULL;

-- 5. Check RLS policies (admin must be able to SELECT profiles for Realtime to work)
SELECT 
  policyname,
  cmd,
  CASE 
    WHEN cmd = 'SELECT' AND qual LIKE '%admin%' THEN '✅ Admin SELECT policy exists'
    WHEN cmd = 'SELECT' THEN '⚠️ SELECT policy exists but may not allow admin access'
    ELSE '❌ No SELECT policy'
  END as rls_status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'profiles'
  AND cmd = 'SELECT';

-- 6. Summary: What needs to be fixed
SELECT 
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_publication_tables 
      WHERE pubname = 'supabase_realtime' AND tablename = 'profiles'
    ) THEN '✅ profiles table is in Realtime publication'
    ELSE '❌ profiles table is NOT in Realtime publication - Run: ALTER PUBLICATION supabase_realtime ADD TABLE profiles;'
  END as profiles_realtime_status,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = 'profiles' AND n.nspname = 'public' AND c.relreplident = 'f'
    ) THEN '✅ profiles table has REPLICA IDENTITY FULL'
    ELSE '❌ profiles table needs REPLICA IDENTITY FULL - Run: ALTER TABLE profiles REPLICA IDENTITY FULL;'
  END as profiles_replica_identity_status;
