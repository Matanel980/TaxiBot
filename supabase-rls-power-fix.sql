-- ============================================================================
-- MISSION-CRITICAL: RLS Power Fix for 406 Errors
-- ============================================================================
-- This script fixes Row Level Security policies to ensure authenticated users
-- (especially admins) can access all necessary data without 406 errors.
--
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================================

BEGIN;

-- Step 1: Drop ALL existing policies to start fresh (clean slate)
DROP POLICY IF EXISTS "Drivers can view own profile" ON profiles;
DROP POLICY IF EXISTS "Drivers can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Service role can manage all profiles" ON profiles;

DROP POLICY IF EXISTS "Drivers can view own trips" ON trips;
DROP POLICY IF EXISTS "Admins can view all trips" ON trips;
DROP POLICY IF EXISTS "Admins can insert trips" ON trips;
DROP POLICY IF EXISTS "Admins can update trips" ON trips;
DROP POLICY IF EXISTS "Drivers can update own trips" ON trips;
DROP POLICY IF EXISTS "Service role can manage all trips" ON trips;

DROP POLICY IF EXISTS "Everyone can view zones" ON zones;
DROP POLICY IF EXISTS "Admins can manage zones" ON zones;
DROP POLICY IF EXISTS "Service role can manage all zones" ON zones;

-- Step 2: Ensure RLS is enabled (required for policies to work)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;

-- Step 3: Create HIGH-PERFORMANCE policies for profiles table
-- These policies use simple, fast checks (no complex subqueries)

-- Policy 1: Authenticated users can view their own profile
CREATE POLICY "authenticated_view_own_profile"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Policy 2: Admins can view ALL profiles (high-performance check)
CREATE POLICY "admin_view_all_profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policy 3: Authenticated users can update their own profile
CREATE POLICY "authenticated_update_own_profile"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Policy 4: Admins can update ALL profiles
CREATE POLICY "admin_update_all_profiles"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Step 4: Create HIGH-PERFORMANCE policies for trips table

-- Policy 1: Drivers can view trips assigned to them
CREATE POLICY "driver_view_own_trips"
  ON trips FOR SELECT
  TO authenticated
  USING (driver_id = auth.uid());

-- Policy 2: Admins can view ALL trips (high-performance check)
CREATE POLICY "admin_view_all_trips"
  ON trips FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policy 3: Admins can insert trips
CREATE POLICY "admin_insert_trips"
  ON trips FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policy 4: Admins can update ALL trips
CREATE POLICY "admin_update_all_trips"
  ON trips FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Policy 5: Drivers can update trips assigned to them (for status changes)
CREATE POLICY "driver_update_own_trips"
  ON trips FOR UPDATE
  TO authenticated
  USING (driver_id = auth.uid())
  WITH CHECK (driver_id = auth.uid());

-- Step 5: Create HIGH-PERFORMANCE policies for zones table

-- Policy 1: Everyone (authenticated) can view zones
CREATE POLICY "authenticated_view_zones"
  ON zones FOR SELECT
  TO authenticated
  USING (true);

-- Policy 2: Admins can manage zones
CREATE POLICY "admin_manage_zones"
  ON zones FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Step 6: Grant explicit permissions (backup safety)
GRANT SELECT, UPDATE ON profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON trips TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON zones TO authenticated;

-- Step 7: Create index for fast admin role checks (performance optimization)
CREATE INDEX IF NOT EXISTS idx_profiles_role_id 
ON profiles(role, id) 
WHERE role = 'admin';

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (Run these after migration to verify)
-- ============================================================================

-- Check policies were created:
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
-- FROM pg_policies
-- WHERE tablename IN ('profiles', 'trips', 'zones')
-- ORDER BY tablename, policyname;

-- Test admin access (replace 'YOUR_ADMIN_USER_ID' with actual UUID):
-- SELECT id, full_name, role, is_online
-- FROM profiles
-- WHERE role = 'admin'
-- LIMIT 1;

-- Test driver access:
-- SELECT id, customer_phone, status, driver_id
-- FROM trips
-- WHERE status = 'pending'
-- LIMIT 5;

-- ============================================================================
-- TROUBLESHOOTING
-- ============================================================================
-- If you still get 406 errors:
-- 1. Verify the user is authenticated: Check auth.uid() returns a value
-- 2. Verify the user has role = 'admin' in profiles table
-- 3. Check PostgREST logs in Supabase Dashboard > Logs > PostgREST
-- 4. Ensure all columns in SELECT queries exist in the table schema
-- ============================================================================





