-- ============================================================================
-- ONE-TIME BACKFILL: Sync Role and Station_ID to JWT Metadata
-- ============================================================================
-- This script syncs existing users' role and station_id from profiles table
-- to auth.users.raw_user_meta_data so JWT-based RLS policies can read them.
--
-- SAFE TO RUN MULTIPLE TIMES (idempotent)
-- Run this in Supabase SQL Editor
-- ============================================================================

DO $$
DECLARE
  profile_record RECORD;
  updated_count INTEGER := 0;
  skipped_count INTEGER := 0;
  error_count INTEGER := 0;
  total_profiles INTEGER;
BEGIN
  -- Get total count for progress tracking
  SELECT COUNT(*) INTO total_profiles FROM profiles;
  
  RAISE NOTICE '📊 Starting JWT metadata backfill for % profiles...', total_profiles;
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  
  -- Loop through all profiles
  FOR profile_record IN 
    SELECT 
      id,
      role,
      station_id,
      full_name,
      phone
    FROM profiles
    WHERE id IS NOT NULL
    ORDER BY created_at ASC
  LOOP
    BEGIN
      -- Update auth.users metadata with role and station_id
      -- Uses COALESCE to preserve existing metadata, then merges role/station_id
      UPDATE auth.users
      SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
        'role', COALESCE(profile_record.role::text, ''),
        'station_id', COALESCE(profile_record.station_id::text, '')
      )
      WHERE id = profile_record.id;
      
      -- Check if update was successful
      IF FOUND THEN
        updated_count := updated_count + 1;
        
        -- Log progress every 10 users
        IF updated_count % 10 = 0 THEN
          RAISE NOTICE '✅ Progress: %/% users synced...', updated_count, total_profiles;
        END IF;
      ELSE
        -- User exists in profiles but not in auth.users (orphaned profile)
        skipped_count := skipped_count + 1;
        RAISE WARNING '⚠️ Profile % (%, %) exists but no auth user found', 
          profile_record.id, 
          profile_record.full_name, 
          profile_record.phone;
      END IF;
      
    EXCEPTION
      WHEN OTHERS THEN
        error_count := error_count + 1;
        RAISE WARNING '❌ Error syncing user % (%, %): %', 
          profile_record.id,
          profile_record.full_name,
          profile_record.phone,
          SQLERRM;
    END;
  END LOOP;
  
  -- Final summary
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  RAISE NOTICE '✅ BACKFILL COMPLETE';
  RAISE NOTICE '   Total profiles processed: %', total_profiles;
  RAISE NOTICE '   Successfully synced: %', updated_count;
  RAISE NOTICE '   Skipped (no auth user): %', skipped_count;
  RAISE NOTICE '   Errors: %', error_count;
  RAISE NOTICE '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
  
  -- Verification query results
  RAISE NOTICE '';
  RAISE NOTICE '📋 VERIFICATION:';
  RAISE NOTICE '   Run this query to verify sync status:';
  RAISE NOTICE '';
  RAISE NOTICE '   SELECT';
  RAISE NOTICE '     COUNT(*) as total_users,';
  RAISE NOTICE '     COUNT(*) FILTER (WHERE raw_user_meta_data->>''role'' IS NOT NULL) as users_with_role,';
  RAISE NOTICE '     COUNT(*) FILTER (WHERE raw_user_meta_data->>''station_id'' IS NOT NULL) as users_with_station';
  RAISE NOTICE '   FROM auth.users;';
  RAISE NOTICE '';
  
END $$;

-- ============================================================================
-- VERIFICATION QUERIES (Run these after the backfill)
-- ============================================================================

-- 1. Check sync status summary
SELECT 
  'Sync Status' as report_type,
  COUNT(*) as total_auth_users,
  COUNT(*) FILTER (WHERE raw_user_meta_data->>'role' IS NOT NULL AND raw_user_meta_data->>'role' != '') as users_with_role,
  COUNT(*) FILTER (WHERE raw_user_meta_data->>'station_id' IS NOT NULL AND raw_user_meta_data->>'station_id' != '') as users_with_station,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE raw_user_meta_data->>'role' IS NOT NULL AND raw_user_meta_data->>'role' != '') / NULLIF(COUNT(*), 0),
    2
  ) as role_sync_percentage,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE raw_user_meta_data->>'station_id' IS NOT NULL AND raw_user_meta_data->>'station_id' != '') / NULLIF(COUNT(*), 0),
    2
  ) as station_sync_percentage
FROM auth.users;

-- 2. Check for users with profiles but missing JWT metadata
SELECT 
  'Missing Metadata' as report_type,
  p.id,
  p.full_name,
  p.phone,
  p.role,
  p.station_id,
  CASE 
    WHEN u.raw_user_meta_data->>'role' IS NULL OR u.raw_user_meta_data->>'role' = '' THEN '❌ Missing role'
    ELSE '✅ Has role'
  END as role_status,
  CASE 
    WHEN u.raw_user_meta_data->>'station_id' IS NULL OR u.raw_user_meta_data->>'station_id' = '' THEN '❌ Missing station'
    ELSE '✅ Has station'
  END as station_status
FROM profiles p
LEFT JOIN auth.users u ON p.id = u.id
WHERE 
  (u.raw_user_meta_data->>'role' IS NULL OR u.raw_user_meta_data->>'role' = '')
  OR (u.raw_user_meta_data->>'station_id' IS NULL OR u.raw_user_meta_data->>'station_id' = '')
ORDER BY p.created_at DESC
LIMIT 20;

-- 3. Sample of synced users (for verification)
SELECT 
  'Sample Synced Users' as report_type,
  u.id,
  p.full_name,
  p.role as profile_role,
  u.raw_user_meta_data->>'role' as jwt_role,
  p.station_id::text as profile_station_id,
  u.raw_user_meta_data->>'station_id' as jwt_station_id,
  CASE 
    WHEN p.role::text = u.raw_user_meta_data->>'role' 
      AND COALESCE(p.station_id::text, '') = COALESCE(u.raw_user_meta_data->>'station_id', '')
    THEN '✅ Synced correctly'
    ELSE '⚠️ Mismatch'
  END as sync_status
FROM auth.users u
INNER JOIN profiles p ON u.id = p.id
WHERE u.raw_user_meta_data->>'role' IS NOT NULL
ORDER BY u.created_at DESC
LIMIT 10;

-- ============================================================================
-- NOTES
-- ============================================================================
-- 
-- ✅ This script is SAFE to run multiple times (idempotent)
-- ✅ It preserves existing metadata and only updates role/station_id
-- ✅ Handles null values gracefully (empty strings for missing data)
-- ✅ Provides detailed progress and error reporting
-- 
-- After running:
-- 1. Check the verification queries above
-- 2. Verify role_sync_percentage and station_sync_percentage are close to 100%
-- 3. If there are missing metadata entries, investigate the "Missing Metadata" query
-- 4. Test JWT-based policies work by logging in as admin/driver
-- 
-- ============================================================================
