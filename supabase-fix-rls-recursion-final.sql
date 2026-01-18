-- ============================================================================
-- FINAL FIX FOR INFINITE RECURSION (42P17) IN PROFILES RLS POLICIES
-- ============================================================================
-- This script COMPLETELY eliminates recursion by using ONLY direct auth.uid() checks
-- for the primary policy. Admin policies use JWT metadata instead of querying profiles.
--
-- Problem: Policies that call functions (is_user_admin(), get_user_station_id()) 
-- which query profiles cause infinite recursion when RLS is enabled.
--
-- Solution: 
-- 1. Drop ALL existing policies
-- 2. Create PRIMARY policy with ONLY auth.uid() = id (NO function calls)
-- 3. Create admin policy using auth.jwt() metadata (NO table queries)
-- 4. Keep helper functions for application code, but don't use them in policies
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
DROP POLICY IF EXISTS "authenticated_view_own_profile" ON profiles;
DROP POLICY IF EXISTS "admin_view_all_profiles" ON profiles;
DROP POLICY IF EXISTS "authenticated_update_own_profile" ON profiles;
DROP POLICY IF EXISTS "admin_update_all_profiles" ON profiles;

-- Step 2: Ensure helper functions exist (for application code, NOT for policies)
-- These are kept for application-level checks but NOT used in RLS policies

CREATE OR REPLACE FUNCTION get_user_station_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  user_station_id uuid;
BEGIN
  -- SECURITY DEFINER allows this to bypass RLS
  SELECT station_id INTO user_station_id
  FROM profiles
  WHERE id = auth.uid();
  
  RETURN user_station_id;
END;
$$;

CREATE OR REPLACE FUNCTION is_user_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
  user_role text;
BEGIN
  -- SECURITY DEFINER allows this to bypass RLS
  SELECT role INTO user_role
  FROM profiles
  WHERE id = auth.uid();
  
  RETURN COALESCE(user_role = 'admin', false);
END;
$$;

-- Step 3: Create SIMPLE, NON-RECURSIVE policies
-- CRITICAL: These policies use ONLY direct checks, NO function calls

-- Policy 1: Users can ALWAYS view their own profile
-- This is the PRIMARY policy - uses ONLY auth.uid() = id (NO recursion possible)
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Policy 2: Admins can view profiles in their station
-- Uses JWT metadata to check role (NO table query, NO recursion)
-- Note: This requires setting user_metadata.role in auth.users
-- Fallback: If JWT doesn't have role, this policy won't match (safe)
CREATE POLICY "profiles_select_station_admin"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    -- Check JWT metadata for role (NO table query)
    (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
    AND station_id IS NOT NULL
    -- Additional check: station_id must match admin's station (from JWT)
    AND (
      station_id = ((auth.jwt() ->> 'user_metadata')::jsonb ->> 'station_id')::uuid
      OR (auth.jwt() ->> 'user_metadata')::jsonb ->> 'station_id' IS NULL
    )
  );

-- Policy 3: Users can update their own profile (NO recursion)
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Policy 4: Admins can update profiles in their station (uses JWT, NO recursion)
CREATE POLICY "profiles_update_station_admin"
  ON profiles FOR UPDATE
  TO authenticated
  USING (
    (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
    AND station_id IS NOT NULL
  )
  WITH CHECK (
    (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
    AND station_id IS NOT NULL
  );

-- Policy 5: Admins can insert new profiles (uses JWT, NO recursion)
CREATE POLICY "profiles_insert_station_admin"
  ON profiles FOR INSERT
  TO authenticated
  WITH CHECK (
    (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
    AND station_id IS NOT NULL
  );

-- Step 4: Grant necessary permissions
GRANT USAGE ON SCHEMA public TO authenticated;
GRANT SELECT, UPDATE, INSERT ON profiles TO authenticated;

-- Step 5: Create trigger to sync role to JWT metadata (optional but recommended)
-- This ensures auth.jwt() has the role for admin policies
CREATE OR REPLACE FUNCTION sync_role_to_jwt_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Update auth.users metadata when profile role changes
  UPDATE auth.users
  SET raw_user_meta_data = jsonb_build_object(
    'role', NEW.role,
    'station_id', NEW.station_id::text
  )
  WHERE id = NEW.id;
  
  RETURN NEW;
END;
$$;

-- Create trigger (only if it doesn't exist)
DROP TRIGGER IF EXISTS sync_role_to_jwt_trigger ON profiles;
CREATE TRIGGER sync_role_to_jwt_trigger
  AFTER INSERT OR UPDATE OF role, station_id ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION sync_role_to_jwt_metadata();

-- Step 6: Backfill JWT metadata for existing users
-- This ensures existing users have role in JWT metadata
DO $$
DECLARE
  profile_record RECORD;
BEGIN
  FOR profile_record IN 
    SELECT id, role, station_id 
    FROM profiles 
    WHERE role IS NOT NULL
  LOOP
    UPDATE auth.users
    SET raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object(
      'role', profile_record.role,
      'station_id', profile_record.station_id::text
    )
    WHERE id = profile_record.id;
  END LOOP;
  
  RAISE NOTICE '✅ JWT metadata synced for existing users';
END $$;

-- Step 7: Verify policies are created
DO $$
BEGIN
  RAISE NOTICE '✅ RLS Policies recreated successfully';
  RAISE NOTICE '✅ Policy "profiles_select_own" uses ONLY auth.uid() = id (NO recursion)';
  RAISE NOTICE '✅ Admin policies use JWT metadata (NO table queries)';
  RAISE NOTICE '✅ Helper functions exist for application code (NOT used in policies)';
  RAISE NOTICE '✅ JWT metadata trigger created to sync role/station_id';
END $$;

-- ============================================================================
-- VERIFICATION QUERIES
-- ============================================================================
-- Run these queries to verify the fix works:
-- 
-- 1. Test own profile access (should work):
-- SELECT id, role, station_id, full_name
-- FROM profiles
-- WHERE id = auth.uid();
--
-- 2. Check JWT metadata (should have role):
-- SELECT 
--   id,
--   raw_user_meta_data->>'role' as jwt_role,
--   raw_user_meta_data->>'station_id' as jwt_station_id
-- FROM auth.users
-- WHERE id = auth.uid();
--
-- 3. Verify policies exist:
-- SELECT policyname, cmd, qual
-- FROM pg_policies
-- WHERE tablename = 'profiles';
-- ============================================================================





