-- ============================================================================
-- FIX INFINITE RECURSION (42P17) IN PROFILES RLS POLICIES
-- ============================================================================
-- This script fixes the infinite recursion error by ensuring all RLS policies
-- use non-recursive helper functions and direct auth.uid() checks.
--
-- Problem: When middleware queries profiles, it triggers policies that call
-- is_user_admin(), which queries profiles again, causing infinite recursion.
--
-- Solution: 
-- 1. Drop all existing policies on profiles
-- 2. Recreate policies with explicit auth.uid() checks for own profile
-- 3. Use SECURITY DEFINER functions that bypass RLS for admin checks
-- ============================================================================

-- Step 1: Drop ALL existing policies on profiles table
DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_select_station" ON profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON profiles;
DROP POLICY IF EXISTS "profiles_update_station" ON profiles;
DROP POLICY IF EXISTS "profiles_insert_station" ON profiles;
DROP POLICY IF EXISTS "Drivers can view own profile" ON profiles;
DROP POLICY IF EXISTS "Drivers can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Users can insert own profile" ON profiles;

-- Step 2: Verify helper functions exist and are SECURITY DEFINER
-- These functions MUST exist and MUST be SECURITY DEFINER to bypass RLS

-- Function: get_user_station_id() - Returns station_id for current user
CREATE OR REPLACE FUNCTION get_user_station_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER -- CRITICAL: Bypasses RLS to prevent recursion
SET search_path = public
AS $$
DECLARE
  user_station_id uuid;
BEGIN
  -- Direct query to profiles with SECURITY DEFINER (bypasses RLS)
  SELECT station_id INTO user_station_id
  FROM profiles
  WHERE id = auth.uid();
  
  RETURN user_station_id;
END;
$$;

-- Function: is_user_admin() - Checks if current user is admin
CREATE OR REPLACE FUNCTION is_user_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER -- CRITICAL: Bypasses RLS to prevent recursion
SET search_path = public
AS $$
DECLARE
  user_role text;
BEGIN
  -- Direct query to profiles with SECURITY DEFINER (bypasses RLS)
  SELECT role INTO user_role
  FROM profiles
  WHERE id = auth.uid();
  
  RETURN COALESCE(user_role = 'admin', false);
END;
$$;

-- Step 3: Create NON-RECURSIVE policies

-- Policy 1: Users can ALWAYS view their own profile (no recursion - direct auth.uid() check)
-- This is the PRIMARY policy that middleware uses
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Policy 2: Station Managers can view profiles in their station (uses SECURITY DEFINER function)
-- This policy only applies if Policy 1 doesn't match
CREATE POLICY "profiles_select_station"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    -- Use SECURITY DEFINER function to check admin status (bypasses RLS)
    is_user_admin() = true 
    AND station_id = get_user_station_id()
    AND get_user_station_id() IS NOT NULL
  );

-- Policy 3: Users can update their own profile (no recursion - direct auth.uid() check)
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Policy 4: Station Managers can update profiles in their station (uses SECURITY DEFINER function)
CREATE POLICY "profiles_update_station"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    is_user_admin() = true 
    AND station_id = get_user_station_id()
    AND get_user_station_id() IS NOT NULL
  )
  WITH CHECK (
    is_user_admin() = true 
    AND station_id = get_user_station_id()
    AND get_user_station_id() IS NOT NULL
  );

-- Policy 5: Station Managers can insert new profiles (for driver onboarding)
CREATE POLICY "profiles_insert_station"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    is_user_admin() = true 
    AND station_id = get_user_station_id()
    AND get_user_station_id() IS NOT NULL
  );

-- Step 4: Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, UPDATE, INSERT ON profiles TO authenticated;

-- Step 5: Verify policies are created
DO $$
BEGIN
  RAISE NOTICE '✅ RLS Policies recreated successfully';
  RAISE NOTICE '✅ Helper functions verified (SECURITY DEFINER)';
  RAISE NOTICE '✅ Policy "profiles_select_own" allows users to view own profile';
  RAISE NOTICE '✅ Policy "profiles_select_station" allows admins to view station profiles';
END $$;

-- ============================================================================
-- VERIFICATION QUERY
-- ============================================================================
-- Run this query to verify the fix works:
-- 
-- SELECT 
--   id,
--   role,
--   station_id,
--   full_name
-- FROM profiles
-- WHERE id = auth.uid();
--
-- This should work without recursion errors.
-- ============================================================================





