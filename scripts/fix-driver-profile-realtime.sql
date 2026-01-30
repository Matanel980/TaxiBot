-- ============================================================================
-- Fix Driver Profile Realtime Subscription Error
-- ============================================================================
-- This script fixes the "CHANNEL_ERROR" when subscribing to profile updates
-- in the driver dashboard.
--
-- Common causes:
-- 1. profiles table not in Realtime publication
-- 2. REPLICA IDENTITY not FULL
-- 3. RLS policies blocking subscription
-- 4. Missing columns in publication
-- ============================================================================

BEGIN;

-- ============================================================================
-- STEP 1: Verify Current Status
-- ============================================================================

DO $$
DECLARE
  profiles_in_publication BOOLEAN;
  replica_identity_status TEXT;
  rls_enabled BOOLEAN;
BEGIN
  -- Check if profiles is in Realtime publication
  SELECT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'profiles'
  ) INTO profiles_in_publication;
  
  -- Check REPLICA IDENTITY
  SELECT relreplident INTO replica_identity_status
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'profiles' AND n.nspname = 'public';
  
  -- Check RLS status
  SELECT rowsecurity INTO rls_enabled
  FROM pg_tables
  WHERE schemaname = 'public' AND tablename = 'profiles';
  
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '📊 Current Status:';
  RAISE NOTICE '   Profiles in Realtime publication: %', 
    CASE WHEN profiles_in_publication THEN '✅ YES' ELSE '❌ NO' END;
  RAISE NOTICE '   REPLICA IDENTITY: %', 
    CASE 
      WHEN replica_identity_status = 'f' THEN '✅ FULL'
      WHEN replica_identity_status = 'd' THEN '⚠️ DEFAULT'
      ELSE '❌ NOT SET'
    END;
  RAISE NOTICE '   RLS Enabled: %', 
    CASE WHEN rls_enabled THEN '✅ YES' ELSE '❌ NO' END;
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END $$;

-- ============================================================================
-- STEP 2: Add profiles to Realtime Publication (if not already added)
-- ============================================================================

DO $$
BEGIN
  -- Check if already in publication
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'profiles'
  ) THEN
    -- Add to publication
    ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
    RAISE NOTICE '✅ Added profiles table to supabase_realtime publication';
  ELSE
    RAISE NOTICE 'ℹ️ profiles table is already in supabase_realtime publication';
  END IF;
END $$;

-- ============================================================================
-- STEP 3: Set REPLICA IDENTITY FULL (Required for UPDATE events)
-- ============================================================================

DO $$
DECLARE
  current_identity TEXT;
BEGIN
  -- Get current REPLICA IDENTITY
  SELECT relreplident INTO current_identity
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'profiles' AND n.nspname = 'public';
  
  -- Set to FULL if not already
  IF current_identity != 'f' THEN
    ALTER TABLE profiles REPLICA IDENTITY FULL;
    RAISE NOTICE '✅ Set REPLICA IDENTITY FULL for profiles table';
  ELSE
    RAISE NOTICE 'ℹ️ REPLICA IDENTITY is already FULL';
  END IF;
END $$;

-- ============================================================================
-- STEP 4: Verify RLS Policies Allow SELECT (Required for Realtime)
-- ============================================================================

DO $$
DECLARE
  has_select_policy BOOLEAN;
BEGIN
  -- Check if there's a SELECT policy that allows users to read their own profile
  SELECT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'profiles'
      AND cmd = 'SELECT'
      AND (
        qual LIKE '%auth.uid()%' OR
        qual LIKE '%auth.jwt()%'
      )
  ) INTO has_select_policy;
  
  IF NOT has_select_policy THEN
    RAISE WARNING '⚠️ No SELECT policy found that allows users to read their own profile';
    RAISE WARNING '   This may cause Realtime subscription to fail';
    RAISE WARNING '   Ensure you have a policy like: USING (auth.uid() = id)';
  ELSE
    RAISE NOTICE '✅ SELECT policy exists for profiles table';
  END IF;
END $$;

-- ============================================================================
-- STEP 5: Verify Publication Columns (if specific columns are published)
-- ============================================================================

DO $$
DECLARE
  published_columns TEXT;
BEGIN
  -- Check if specific columns are published (vs all columns)
  SELECT attnames::text INTO published_columns
  FROM pg_publication_tables
  WHERE pubname = 'supabase_realtime'
    AND tablename = 'profiles';
  
  IF published_columns IS NULL THEN
    RAISE NOTICE '✅ All columns are published (attnames is NULL = all columns)';
  ELSE
    RAISE NOTICE 'ℹ️ Specific columns published: %', published_columns;
    RAISE NOTICE '   Ensure id, is_online, latitude, longitude, heading are included';
  END IF;
END $$;

-- ============================================================================
-- STEP 6: Final Verification
-- ============================================================================

DO $$
DECLARE
  profiles_in_publication BOOLEAN;
  replica_identity_status TEXT;
BEGIN
  -- Final check
  SELECT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND tablename = 'profiles'
  ) INTO profiles_in_publication;
  
  SELECT relreplident INTO replica_identity_status
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'profiles' AND n.nspname = 'public';
  
  RAISE NOTICE '';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '✅ FIX COMPLETE';
  RAISE NOTICE '';
  RAISE NOTICE 'Final Status:';
  RAISE NOTICE '   Profiles in Realtime: %', 
    CASE WHEN profiles_in_publication THEN '✅ YES' ELSE '❌ NO' END;
  RAISE NOTICE '   REPLICA IDENTITY: %', 
    CASE 
      WHEN replica_identity_status = 'f' THEN '✅ FULL'
      ELSE '❌ NOT FULL'
    END;
  RAISE NOTICE '';
  RAISE NOTICE 'Next Steps:';
  RAISE NOTICE '   1. Refresh your driver dashboard (hard refresh: Ctrl+Shift+R)';
  RAISE NOTICE '   2. Check browser console for: ✅ Successfully subscribed to profile updates';
  RAISE NOTICE '   3. If error persists, check RLS policies allow SELECT';
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
END $$;

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (Run these after the fix)
-- ============================================================================

-- 1. Verify profiles is in Realtime publication
SELECT 
  'Publication Status' as check_type,
  tablename,
  CASE 
    WHEN tablename = 'profiles' THEN '✅ Enabled'
    ELSE 'Optional'
  END as status
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename = 'profiles';

-- 2. Verify REPLICA IDENTITY
SELECT 
  'REPLICA IDENTITY' as check_type,
  relreplident as current_setting,
  CASE 
    WHEN relreplident = 'f' THEN '✅ FULL (Correct)'
    WHEN relreplident = 'd' THEN '⚠️ DEFAULT (Needs to be FULL)'
    ELSE '❌ NOT SET'
  END as status
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname = 'profiles' AND n.nspname = 'public';

-- 3. Check RLS policies
SELECT 
  'RLS Policies' as check_type,
  policyname,
  cmd,
  CASE 
    WHEN qual LIKE '%auth.uid()%' OR qual LIKE '%auth.jwt()%' THEN '✅ Allows own profile'
    ELSE '⚠️ Review needed'
  END as status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'profiles'
  AND cmd = 'SELECT'
ORDER BY policyname;

-- ============================================================================
-- TROUBLESHOOTING
-- ============================================================================
-- 
-- If subscription still fails after running this script:
-- 
-- 1. Check browser console for specific error message
-- 2. Verify you're logged in as a driver (not admin)
-- 3. Test direct query: SELECT * FROM profiles WHERE id = auth.uid();
-- 4. Check Supabase Dashboard → Database → Replication → profiles table
-- 5. Verify network connection (Realtime uses WebSocket)
-- 
-- Common additional issues:
-- - JWT metadata not synced (run backfill-jwt-metadata.sql)
-- - RLS policy recursion (should be fixed with JWT-based policies)
-- - Network firewall blocking WebSocket connections
-- ============================================================================
