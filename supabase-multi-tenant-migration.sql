-- ============================================================================
-- MISSION-CRITICAL: Multi-Tenant Architecture & Station Isolation
-- ============================================================================
-- This migration implements station-based multi-tenancy and fixes infinite
-- recursion (42P17) in RLS policies.
--
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================================

BEGIN;

-- ============================================================================
-- PHASE 1: DATABASE SCHEMA MIGRATION
-- ============================================================================

-- Step 1: Create stations table
CREATE TABLE IF NOT EXISTS stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- Add comment
COMMENT ON TABLE stations IS 'Taxi stations for multi-tenant isolation';

-- Step 2: Add station_id to profiles table (nullable for backward compatibility)
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS station_id uuid REFERENCES stations(id) ON DELETE SET NULL;

-- Add comment
COMMENT ON COLUMN profiles.station_id IS 'Station assignment for multi-tenant isolation. Required for admins, optional for drivers during migration.';

-- Step 3: Add station_id to trips table (nullable initially)
ALTER TABLE trips 
ADD COLUMN IF NOT EXISTS station_id uuid REFERENCES stations(id) ON DELETE SET NULL;

-- Add comment
COMMENT ON COLUMN trips.station_id IS 'Station assignment for trip isolation. Required for new trips.';

-- Step 4: Add station_id to zones table (nullable initially)
ALTER TABLE zones 
ADD COLUMN IF NOT EXISTS station_id uuid REFERENCES stations(id) ON DELETE SET NULL;

-- Add comment
COMMENT ON COLUMN zones.station_id IS 'Station assignment for zone isolation. Required for new zones.';

-- Step 5: Add station_id to zones_postgis table (nullable initially)
ALTER TABLE zones_postgis 
ADD COLUMN IF NOT EXISTS station_id uuid REFERENCES stations(id) ON DELETE SET NULL;

-- Add comment
COMMENT ON COLUMN zones_postgis.station_id IS 'Station assignment for PostGIS zone isolation. Required for new zones.';

-- Step 6: Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_profiles_station_id ON profiles(station_id);
CREATE INDEX IF NOT EXISTS idx_trips_station_id ON trips(station_id);
CREATE INDEX IF NOT EXISTS idx_zones_station_id ON zones(station_id);
CREATE INDEX IF NOT EXISTS idx_zones_postgis_station_id ON zones_postgis(station_id);

-- Step 7: Create SECURITY DEFINER helper function (fixes infinite recursion)
-- This function bypasses RLS to safely get user's station_id
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
  -- This prevents infinite recursion when checking user's station_id
  SELECT station_id INTO user_station_id
  FROM profiles
  WHERE id = auth.uid();
  
  RETURN user_station_id;
END;
$$;

-- Add comment
COMMENT ON FUNCTION get_user_station_id() IS 'Non-recursive helper to get current user station_id. Bypasses RLS to prevent infinite recursion.';

-- Step 8: Create helper function to check if user is admin (non-recursive)
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
  
  RETURN user_role = 'admin';
END;
$$;

-- Add comment
COMMENT ON FUNCTION is_user_admin() IS 'Non-recursive helper to check if current user is admin. Bypasses RLS to prevent infinite recursion.';

-- ============================================================================
-- PHASE 2: RLS POLICY OVERHAUL (NON-RECURSIVE)
-- ============================================================================

-- Step 1: Drop ALL existing policies (clean slate)
DROP POLICY IF EXISTS "authenticated_view_own_profile" ON profiles;
DROP POLICY IF EXISTS "admin_view_all_profiles" ON profiles;
DROP POLICY IF EXISTS "authenticated_update_own_profile" ON profiles;
DROP POLICY IF EXISTS "admin_update_all_profiles" ON profiles;
DROP POLICY IF EXISTS "Drivers can view own profile" ON profiles;
DROP POLICY IF EXISTS "Drivers can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Service role can manage all profiles" ON profiles;

DROP POLICY IF EXISTS "driver_view_own_trips" ON trips;
DROP POLICY IF EXISTS "admin_view_all_trips" ON trips;
DROP POLICY IF EXISTS "admin_insert_trips" ON trips;
DROP POLICY IF EXISTS "admin_update_all_trips" ON trips;
DROP POLICY IF EXISTS "driver_update_own_trips" ON trips;
DROP POLICY IF EXISTS "Drivers can view own trips" ON trips;
DROP POLICY IF EXISTS "Admins can view all trips" ON trips;
DROP POLICY IF EXISTS "Admins can insert trips" ON trips;
DROP POLICY IF EXISTS "Admins can update trips" ON trips;
DROP POLICY IF EXISTS "Drivers can update own trips" ON trips;
DROP POLICY IF EXISTS "Service role can manage all trips" ON trips;

DROP POLICY IF EXISTS "authenticated_view_zones" ON zones;
DROP POLICY IF EXISTS "admin_manage_zones" ON zones;
DROP POLICY IF EXISTS "Everyone can view zones" ON zones;
DROP POLICY IF EXISTS "Admins can manage zones" ON zones;
DROP POLICY IF EXISTS "Service role can manage all zones" ON zones;

-- Drop policies on zones_postgis if they exist
DROP POLICY IF EXISTS "authenticated_view_zones_postgis" ON zones_postgis;
DROP POLICY IF EXISTS "admin_manage_zones_postgis" ON zones_postgis;

-- Step 2: Ensure RLS is enabled
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE zones_postgis ENABLE ROW LEVEL SECURITY;
ALTER TABLE stations ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- PROFILES TABLE POLICIES (NON-RECURSIVE, STATION-AWARE)
-- ============================================================================

-- Policy 1: Users can view their own profile (no recursion - direct auth.uid() check)
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Policy 2: Station Managers can view profiles in their station (non-recursive)
CREATE POLICY "profiles_select_station"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    is_user_admin() = true 
    AND station_id = get_user_station_id()
    AND get_user_station_id() IS NOT NULL
  );

-- Policy 3: Users can update their own profile
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Policy 4: Station Managers can update profiles in their station (non-recursive)
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

-- ============================================================================
-- TRIPS TABLE POLICIES (NON-RECURSIVE, STATION-AWARE)
-- ============================================================================

-- Policy 1: Drivers can view trips assigned to them
CREATE POLICY "trips_select_driver"
  ON trips FOR SELECT
  TO authenticated
  USING (driver_id = auth.uid());

-- Policy 2: Station Managers can view trips in their station (non-recursive)
CREATE POLICY "trips_select_station"
  ON trips FOR SELECT
  TO authenticated
  USING (
    is_user_admin() = true 
    AND station_id = get_user_station_id()
    AND get_user_station_id() IS NOT NULL
  );

-- Policy 3: Station Managers can insert trips in their station
CREATE POLICY "trips_insert_station"
  ON trips FOR INSERT
  TO authenticated
  WITH CHECK (
    is_user_admin() = true 
    AND station_id = get_user_station_id()
    AND get_user_station_id() IS NOT NULL
  );

-- Policy 4: Station Managers can update trips in their station
CREATE POLICY "trips_update_station"
  ON trips FOR UPDATE
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

-- Policy 5: Drivers can update trips assigned to them (for status changes)
CREATE POLICY "trips_update_driver"
  ON trips FOR UPDATE
  TO authenticated
  USING (driver_id = auth.uid())
  WITH CHECK (driver_id = auth.uid());

-- ============================================================================
-- ZONES TABLE POLICIES (NON-RECURSIVE, STATION-AWARE)
-- ============================================================================

-- Policy 1: Station Managers can view zones in their station
CREATE POLICY "zones_select_station"
  ON zones FOR SELECT
  TO authenticated
  USING (
    is_user_admin() = true 
    AND station_id = get_user_station_id()
    AND get_user_station_id() IS NOT NULL
  );

-- Policy 2: Station Managers can manage zones in their station
CREATE POLICY "zones_manage_station"
  ON zones FOR ALL
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

-- ============================================================================
-- ZONES_POSTGIS TABLE POLICIES (NON-RECURSIVE, STATION-AWARE)
-- ============================================================================

-- Policy 1: Station Managers can view zones_postgis in their station
CREATE POLICY "zones_postgis_select_station"
  ON zones_postgis FOR SELECT
  TO authenticated
  USING (
    is_user_admin() = true 
    AND station_id = get_user_station_id()
    AND get_user_station_id() IS NOT NULL
  );

-- Policy 2: Station Managers can manage zones_postgis in their station
CREATE POLICY "zones_postgis_manage_station"
  ON zones_postgis FOR ALL
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

-- ============================================================================
-- STATIONS TABLE POLICIES
-- ============================================================================

-- Policy 1: Station Managers can view their own station
CREATE POLICY "stations_select_own"
  ON stations FOR SELECT
  TO authenticated
  USING (
    is_user_admin() = true 
    AND id = get_user_station_id()
    AND get_user_station_id() IS NOT NULL
  );

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT SELECT, UPDATE ON profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON trips TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON zones TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON zones_postgis TO authenticated;
GRANT SELECT ON stations TO authenticated;

-- ============================================================================
-- PHASE 3: SUPER-ADMIN SETUP
-- ============================================================================

-- Step 1: Create the first station (Main Station)
INSERT INTO stations (id, name)
VALUES (
  gen_random_uuid(),
  'Main Station'
)
ON CONFLICT DO NOTHING
RETURNING id, name;

-- Step 2: Get the station ID (we'll use this in the next step)
-- Note: In production, you'd capture this ID, but for now we'll query it

-- Step 3: Link your UID to the Main Station
-- Replace 'YOUR_STATION_ID' with the actual station ID from Step 1
-- For now, we'll update the profile directly
DO $$
DECLARE
  main_station_id uuid;
  user_uid uuid := '7a1c065d-fe67-4551-be0e-9b2b7aa3dba8';
BEGIN
  -- Get or create Main Station
  SELECT id INTO main_station_id
  FROM stations
  WHERE name = 'Main Station'
  LIMIT 1;
  
  -- If station doesn't exist, create it
  IF main_station_id IS NULL THEN
    INSERT INTO stations (name)
    VALUES ('Main Station')
    RETURNING id INTO main_station_id;
  END IF;
  
  -- Link user to station and ensure they're admin
  UPDATE profiles
  SET 
    station_id = main_station_id,
    role = 'admin'
  WHERE id = user_uid;
  
  -- Verify update
  IF FOUND THEN
    RAISE NOTICE '✅ Successfully linked user % to station % (Main Station)', user_uid, main_station_id;
  ELSE
    RAISE WARNING '⚠️ User % not found in profiles table. Please create profile first.', user_uid;
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (Run these after migration to verify)
-- ============================================================================

-- Check stations were created:
-- SELECT id, name, created_at FROM stations;

-- Check your profile has station_id:
-- SELECT id, phone, full_name, role, station_id 
-- FROM profiles 
-- WHERE id = '7a1c065d-fe67-4551-be0e-9b2b7aa3dba8';

-- Check policies were created (should show new non-recursive policies):
-- SELECT schemaname, tablename, policyname, cmd
-- FROM pg_policies
-- WHERE tablename IN ('profiles', 'trips', 'zones', 'zones_postgis', 'stations')
-- ORDER BY tablename, policyname;

-- Test helper functions:
-- SELECT get_user_station_id() as my_station_id;
-- SELECT is_user_admin() as am_i_admin;

-- Check indexes were created:
-- SELECT indexname, tablename 
-- FROM pg_indexes 
-- WHERE indexname LIKE '%station_id%';

-- ============================================================================
-- TROUBLESHOOTING
-- ============================================================================
-- If you get errors:
-- 1. Verify your UID exists in profiles table
-- 2. Check that stations table was created
-- 3. Verify helper functions were created (get_user_station_id, is_user_admin)
-- 4. Check PostgREST logs for any policy evaluation errors
-- ============================================================================





