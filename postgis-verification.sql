-- ============================================
-- PostGIS Verification & Permission Check
-- Run this in Supabase SQL Editor
-- ============================================

-- Step 1: Check if PostGIS extension is enabled
SELECT * FROM pg_extension WHERE extname = 'postgis';

-- Expected: Should return at least one row with extname = 'postgis'
-- If empty, enable PostGIS: Supabase Dashboard → Database → Extensions → Enable 'postgis'

-- Step 2: Verify PostGIS functions are available
SELECT ST_Distance(
  ST_SetSRID(ST_MakePoint(32.9, 35.1), 4326)::geography,
  ST_SetSRID(ST_MakePoint(32.91, 35.11), 4326)::geography
) AS test_distance_meters;

-- Expected: Should return a distance in meters (~1388 meters)
-- If error, PostGIS is not properly enabled

-- Step 3: Verify find_nearest_driver function exists
SELECT 
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS return_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname = 'find_nearest_driver';

-- Expected: Should return function definition
-- If empty, run supabase-find-nearest-driver-function.sql first

-- Step 4: Test function permissions (this should work if you're admin/service_role)
-- Note: This requires at least one online driver in the database
SELECT * FROM find_nearest_driver(32.9, 35.1, NULL) LIMIT 1;

-- Expected: Either returns a driver (if available) or empty result (if no drivers)
-- If permission error, check RLS policies or grant permissions

-- Step 5: Verify tables have required columns
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles' 
  AND column_name IN ('latitude', 'longitude', 'current_zone', 'is_online', 'is_approved', 'role');

-- Expected: Should return 6 rows (one for each column)

SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_name = 'trips' 
  AND column_name IN ('zone_id', 'pickup_lat', 'pickup_lng', 'driver_id', 'status');

-- Expected: Should return 5 rows (one for each column)

-- Step 6: Verify push_tokens table exists
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
  AND table_name = 'push_tokens';

-- Expected: Should return 'push_tokens'
-- If empty, run supabase-push-notifications-migration.sql

-- ============================================
-- Summary Check (run this to see all results)
-- ============================================

DO $$
DECLARE
  postgis_enabled BOOLEAN;
  function_exists BOOLEAN;
  profiles_columns INT;
  trips_columns INT;
  push_tokens_exists BOOLEAN;
BEGIN
  -- Check PostGIS
  SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname = 'postgis') INTO postgis_enabled;
  
  -- Check function
  SELECT EXISTS(
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'find_nearest_driver'
  ) INTO function_exists;
  
  -- Check profiles columns
  SELECT COUNT(*) INTO profiles_columns
  FROM information_schema.columns
  WHERE table_name = 'profiles' 
    AND column_name IN ('latitude', 'longitude', 'current_zone', 'is_online', 'is_approved', 'role');
  
  -- Check trips columns
  SELECT COUNT(*) INTO trips_columns
  FROM information_schema.columns
  WHERE table_name = 'trips' 
    AND column_name IN ('zone_id', 'pickup_lat', 'pickup_lng', 'driver_id', 'status');
  
  -- Check push_tokens table
  SELECT EXISTS(
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'push_tokens'
  ) INTO push_tokens_exists;
  
  -- Print results
  RAISE NOTICE '=== PostGIS Verification Results ===';
  RAISE NOTICE 'PostGIS Enabled: %', postgis_enabled;
  RAISE NOTICE 'find_nearest_driver Function Exists: %', function_exists;
  RAISE NOTICE 'Profiles Table Columns (expected 6): %', profiles_columns;
  RAISE NOTICE 'Trips Table Columns (expected 5): %', trips_columns;
  RAISE NOTICE 'push_tokens Table Exists: %', push_tokens_exists;
  RAISE NOTICE '===============================';
  
  IF postgis_enabled AND function_exists AND profiles_columns = 6 AND trips_columns = 5 AND push_tokens_exists THEN
    RAISE NOTICE '✅ All checks passed! System is ready for Edge Functions.';
  ELSE
    RAISE NOTICE '❌ Some checks failed. Please review the results above.';
  END IF;
END $$;





