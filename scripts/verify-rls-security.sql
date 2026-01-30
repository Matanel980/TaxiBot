-- ============================================================================
-- RLS Security Verification Script
-- Run this in Supabase SQL Editor to verify current security state
-- ============================================================================
-- This script does NOT make any changes - it only reports current state
-- ============================================================================

-- ============================================================================
-- 1. RLS STATUS VERIFICATION
-- ============================================================================

SELECT 
  'RLS Status' as check_type,
  schemaname,
  tablename,
  CASE 
    WHEN rowsecurity THEN '✅ ENABLED'
    ELSE '❌ DISABLED'
  END as rls_status
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'trips', 'zones', 'zones_postgis', 'stations', 'push_tokens')
ORDER BY tablename;

-- ============================================================================
-- 2. CURRENT POLICY LISTING
-- ============================================================================

SELECT 
  'Current Policies' as check_type,
  tablename,
  policyname,
  cmd as operation,
  CASE 
    WHEN qual LIKE '%auth.uid()%' THEN '✅ Direct auth.uid() check'
    WHEN qual LIKE '%is_user_admin%' OR qual LIKE '%get_user_station_id%' THEN '⚠️ Function-based (performance concern)'
    WHEN qual LIKE '%auth.jwt()%' THEN '✅ JWT-based (optimal)'
    ELSE '⚠️ Unknown pattern'
  END as policy_type,
  LEFT(qual, 100) as policy_condition_preview
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'trips', 'zones', 'zones_postgis', 'stations')
ORDER BY tablename, policyname;

-- ============================================================================
-- 3. HELPER FUNCTIONS STATUS
-- ============================================================================

SELECT 
  'Helper Functions' as check_type,
  routine_name as function_name,
  routine_type,
  security_type,
  CASE 
    WHEN security_type = 'DEFINER' THEN '✅ SECURITY DEFINER (bypasses RLS)'
    ELSE '⚠️ INVOKER (may cause recursion)'
  END as security_status
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN ('get_user_station_id', 'is_user_admin')
ORDER BY routine_name;

-- ============================================================================
-- 4. JWT METADATA SYNC STATUS
-- ============================================================================

-- Check if trigger exists
SELECT 
  'JWT Sync Trigger' as check_type,
  trigger_name,
  event_manipulation,
  event_object_table,
  CASE 
    WHEN trigger_name IS NOT NULL THEN '✅ EXISTS'
    ELSE '❌ MISSING'
  END as trigger_status
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table = 'profiles'
  AND trigger_name = 'sync_role_to_jwt_trigger';

-- Check JWT metadata in auth.users
SELECT 
  'JWT Metadata' as check_type,
  COUNT(*) as total_users,
  COUNT(*) FILTER (WHERE raw_user_meta_data->>'role' IS NOT NULL) as users_with_role,
  COUNT(*) FILTER (WHERE raw_user_meta_data->>'station_id' IS NOT NULL) as users_with_station,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE raw_user_meta_data->>'role' IS NOT NULL) / NULLIF(COUNT(*), 0),
    2
  ) as role_sync_percentage,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE raw_user_meta_data->>'station_id' IS NOT NULL) / NULLIF(COUNT(*), 0),
    2
  ) as station_sync_percentage
FROM auth.users;

-- ============================================================================
-- 5. SERVICE ROLE POLICY CHECK
-- ============================================================================

SELECT 
  'Service Role Policies' as check_type,
  tablename,
  policyname,
  cmd,
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ NO SERVICE ROLE POLICIES (Secure)'
    ELSE '⚠️ SERVICE ROLE POLICIES FOUND (Review needed)'
  END as security_status
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual LIKE '%service_role%' OR with_check LIKE '%service_role%')
GROUP BY tablename, policyname, cmd
ORDER BY tablename;

-- If no results, that's good (no service_role policies)

-- ============================================================================
-- 6. STATION ISOLATION VERIFICATION
-- ============================================================================

-- Check if policies filter by station_id
SELECT 
  'Station Isolation' as check_type,
  tablename,
  policyname,
  CASE 
    WHEN qual LIKE '%station_id%' OR with_check LIKE '%station_id%' THEN '✅ Station filter present'
    ELSE '⚠️ No station filter'
  END as isolation_status
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('profiles', 'trips', 'zones', 'zones_postgis')
  AND policyname LIKE '%station%' OR policyname LIKE '%admin%'
ORDER BY tablename, policyname;

-- ============================================================================
-- 7. POLICY RECURSION RISK ASSESSMENT
-- ============================================================================

SELECT 
  'Recursion Risk' as check_type,
  tablename,
  policyname,
  CASE 
    WHEN qual LIKE '%auth.uid()%' AND qual NOT LIKE '%profiles%' THEN '✅ SAFE (direct auth.uid() check)'
    WHEN qual LIKE '%auth.jwt()%' THEN '✅ SAFE (JWT-based, no queries)'
    WHEN qual LIKE '%is_user_admin%' OR qual LIKE '%get_user_station_id%' THEN '⚠️ Uses function (check if SECURITY DEFINER)'
    WHEN qual LIKE '%profiles%' AND qual NOT LIKE '%SECURITY DEFINER%' THEN '❌ RISK (may cause recursion)'
    ELSE '⚠️ Unknown pattern'
  END as recursion_risk
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename = 'profiles'
  AND cmd = 'SELECT'
ORDER BY policyname;

-- ============================================================================
-- 8. CROSS-TENANT ACCESS TEST (Manual - requires user context)
-- ============================================================================

-- This query should be run as an authenticated user to test isolation
-- Replace 'YOUR_USER_ID' with actual UUID

/*
-- Test: Can user see data from other stations?
SELECT 
  'Cross-Tenant Test' as check_type,
  'profiles' as table_name,
  COUNT(*) as visible_profiles,
  COUNT(*) FILTER (WHERE station_id != (SELECT station_id FROM profiles WHERE id = 'YOUR_USER_ID')) as cross_station_profiles
FROM profiles;

-- Expected: cross_station_profiles should be 0 for non-admins
-- Expected: For admins, cross_station_profiles should be 0 (only see own station)
*/

-- ============================================================================
-- SUMMARY REPORT
-- ============================================================================

SELECT 
  'SUMMARY' as report_section,
  'RLS Security Audit Complete' as status,
  'Review results above for security status' as next_steps;

-- ============================================================================
-- INTERPRETATION GUIDE
-- ============================================================================
-- 
-- ✅ ENABLED: RLS is active (good)
-- ❌ DISABLED: RLS is not active (security risk)
-- 
-- ✅ Direct auth.uid() check: Fast, no recursion risk
-- ⚠️ Function-based: Secure but slower (performance concern)
-- ✅ JWT-based: Optimal (fast, no queries)
-- 
-- ✅ SECURITY DEFINER: Function bypasses RLS (prevents recursion)
-- ⚠️ INVOKER: Function respects RLS (may cause recursion)
-- 
-- ✅ EXISTS: JWT sync trigger is active
-- ❌ MISSING: JWT metadata may not be synced
-- 
-- ✅ NO SERVICE ROLE POLICIES: Secure (service role should not have policies)
-- ⚠️ SERVICE ROLE POLICIES FOUND: Review needed
-- 
-- ✅ Station filter present: Cross-tenant isolation enforced
-- ⚠️ No station filter: Potential data leak risk
-- ============================================================================
