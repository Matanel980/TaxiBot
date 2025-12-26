-- ============================================
-- Diagnostic Queries for Location Sync Issues
-- Run these in Supabase SQL Editor to diagnose Realtime issues
-- ============================================

-- 1. Check Realtime Publication Status for profiles table
SELECT 
  schemaname,
  tablename,
  pubname,
  attnames,  -- This shows which columns are replicated
  rowfilter
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename = 'profiles';

-- Expected: attnames should include: id, phone, role, full_name, vehicle_number, 
-- car_type, current_zone, is_online, latitude, longitude, current_address, heading, updated_at

-- 2. Check if all required columns exist in profiles table
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'profiles'
  AND column_name IN ('latitude', 'longitude', 'heading', 'current_address', 'is_online', 'updated_at')
ORDER BY column_name;

-- 3. Test RLS Policy - Check if admin can SELECT driver profiles
-- Run this as the admin user (replace 'YOUR_ADMIN_USER_ID' with actual UUID)
-- Or use: SELECT auth.uid() to get current user ID
SELECT 
  id,
  full_name,
  role,
  is_online,
  latitude,
  longitude,
  updated_at
FROM profiles
WHERE role = 'driver'
LIMIT 5;

-- If this query fails or returns no rows, RLS policy is blocking admin access

-- 4. Check RLS Policies on profiles table
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,  -- USING clause
  with_check  -- WITH CHECK clause
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'profiles'
ORDER BY policyname;

-- 5. Check if profiles table has RLS enabled
SELECT 
  schemaname,
  tablename,
  rowsecurity
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'profiles';

-- Expected: rowsecurity should be 't' (true)

-- 6. Test if driver can UPDATE their own location
-- This simulates what happens when a driver updates their location
-- Replace 'DRIVER_USER_ID' with an actual driver's UUID
SELECT 
  id,
  full_name,
  latitude,
  longitude,
  updated_at
FROM profiles
WHERE id = auth.uid()  -- This will use the current authenticated user
LIMIT 1;

-- 7. Check recent location updates (last 5 minutes)
SELECT 
  id,
  full_name,
  is_online,
  latitude,
  longitude,
  updated_at,
  EXTRACT(EPOCH FROM (NOW() - updated_at)) as seconds_ago
FROM profiles
WHERE role = 'driver'
  AND updated_at > NOW() - INTERVAL '5 minutes'
  AND latitude IS NOT NULL
  AND longitude IS NOT NULL
ORDER BY updated_at DESC
LIMIT 10;

-- 8. Verify Realtime is enabled for all required tables
SELECT 
  tablename,
  CASE 
    WHEN tablename IN ('profiles', 'trips', 'zones_postgis') THEN '✅ Required'
    ELSE 'Optional'
  END as status
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename IN ('profiles', 'trips', 'zones_postgis')
ORDER BY tablename;

-- 9. Check for any triggers that might interfere
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table,
  action_statement
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'profiles';

-- 10. Count online drivers with valid coordinates
SELECT 
  COUNT(*) as online_drivers_with_location,
  COUNT(*) FILTER (WHERE latitude IS NOT NULL AND longitude IS NOT NULL) as with_coordinates,
  COUNT(*) FILTER (WHERE latitude IS NULL OR longitude IS NULL) as missing_coordinates
FROM profiles
WHERE role = 'driver'
  AND is_online = true;

