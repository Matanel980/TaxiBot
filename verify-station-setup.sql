-- ============================================================================
-- VERIFY STATION SETUP
-- ============================================================================
-- This script verifies that:
-- - 0526099607 is admin/manager of taxi station
-- - 0509800301 is driver in the same station
-- ============================================================================

-- Step 1: Check if profiles exist for these phone numbers
SELECT 
  id,
  phone,
  role,
  full_name,
  station_id,
  is_approved
FROM profiles
WHERE phone LIKE '%0526099607%' 
   OR phone LIKE '%0509800301%'
   OR phone LIKE '+972526099607%'
   OR phone LIKE '+972509800301%'
ORDER BY phone;

-- Step 2: Verify admin user (0526099607)
-- Expected: role = 'admin', station_id is not null
SELECT 
  'Admin Check' as check_type,
  id,
  phone,
  role,
  full_name,
  station_id,
  CASE 
    WHEN role = 'admin' THEN '✅ Admin role correct'
    ELSE '❌ Role should be "admin"'
  END as role_status,
  CASE 
    WHEN station_id IS NOT NULL THEN '✅ Has station_id'
    ELSE '❌ Missing station_id'
  END as station_status
FROM profiles
WHERE phone LIKE '%526099607%' OR phone LIKE '%972526099607%';

-- Step 3: Verify driver user (0509800301)
-- Expected: role = 'driver', station_id matches admin's station_id
WITH admin_station AS (
  SELECT station_id 
  FROM profiles 
  WHERE phone LIKE '%526099607%' OR phone LIKE '%972526099607%'
  LIMIT 1
)
SELECT 
  'Driver Check' as check_type,
  p.id,
  p.phone,
  p.role,
  p.full_name,
  p.station_id,
  a.station_id as admin_station_id,
  CASE 
    WHEN p.role = 'driver' THEN '✅ Driver role correct'
    ELSE '❌ Role should be "driver"'
  END as role_status,
  CASE 
    WHEN p.station_id = a.station_id THEN '✅ Same station as admin'
    WHEN p.station_id IS NULL THEN '❌ Missing station_id'
    ELSE '❌ Different station than admin'
  END as station_match
FROM profiles p
CROSS JOIN admin_station a
WHERE p.phone LIKE '%509800301%' OR p.phone LIKE '%972509800301%';

-- Step 4: List all users in the same station (if station exists)
WITH admin_profile AS (
  SELECT station_id, full_name as admin_name
  FROM profiles 
  WHERE phone LIKE '%526099607%' OR phone LIKE '%972526099607%'
  LIMIT 1
)
SELECT 
  'Station Members' as check_type,
  p.id,
  p.phone,
  p.role,
  p.full_name,
  p.station_id,
  a.admin_name as admin_name
FROM profiles p
CROSS JOIN admin_profile a
WHERE p.station_id = a.station_id
ORDER BY p.role DESC, p.full_name;

-- Step 5: Show summary
SELECT 
  COUNT(*) FILTER (WHERE phone LIKE '%526099607%' OR phone LIKE '%972526099607%') as admin_count,
  COUNT(*) FILTER (WHERE phone LIKE '%509800301%' OR phone LIKE '%972509800301%') as driver_count,
  COUNT(DISTINCT station_id) FILTER (
    WHERE phone LIKE '%526099607%' 
       OR phone LIKE '%972526099607%'
       OR phone LIKE '%509800301%' 
       OR phone LIKE '%972509800301%'
  ) as shared_stations
FROM profiles;

-- ============================================================================
-- IF ISSUES FOUND, USE THESE FIXES:
-- ============================================================================

-- Fix 1: Set admin user's station_id (if missing)
-- UPDATE profiles
-- SET station_id = (SELECT id FROM stations LIMIT 1)  -- Replace with actual station_id
-- WHERE phone LIKE '%526099607%' OR phone LIKE '%972526099607%';

-- Fix 2: Set driver user's station_id to match admin's
-- UPDATE profiles
-- SET station_id = (
--   SELECT station_id 
--   FROM profiles 
--   WHERE phone LIKE '%526099607%' OR phone LIKE '%972526099607%'
--   LIMIT 1
-- )
-- WHERE phone LIKE '%509800301%' OR phone LIKE '%972509800301%';

-- Fix 3: Ensure admin role
-- UPDATE profiles
-- SET role = 'admin'
-- WHERE phone LIKE '%526099607%' OR phone LIKE '%972526099607%';

-- Fix 4: Ensure driver role
-- UPDATE profiles
-- SET role = 'driver'
-- WHERE phone LIKE '%509800301%' OR phone LIKE '%972509800301%';

-- ============================================================================

