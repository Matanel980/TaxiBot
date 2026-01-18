-- ============================================================================
-- VERIFY GEOLOCATION RLS POLICIES
-- ============================================================================
-- This script verifies that RLS policies allow drivers to update their own
-- latitude, longitude, current_address, heading, and updated_at columns
-- ============================================================================

-- Step 1: Check if profiles_update_own policy exists
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'profiles'
  AND policyname = 'profiles_update_own';

-- Step 2: Verify policy allows updating location columns
-- The policy should use: USING (auth.uid() = id) AND WITH CHECK (auth.uid() = id)
-- This allows updating ANY column including latitude, longitude, current_address, heading

-- Step 3: Check current auth user and their profile
-- (Run this while logged in as a driver)
SELECT 
  auth.uid() as current_user_id,
  id as profile_id,
  role,
  phone,
  latitude,
  longitude,
  current_address,
  heading,
  updated_at
FROM profiles
WHERE id = auth.uid();

-- Step 4: Test UPDATE permission (this should work if RLS is correct)
-- Uncomment and run as driver to test:
-- UPDATE profiles
-- SET latitude = 32.9297, longitude = 35.0695, updated_at = NOW()
-- WHERE id = auth.uid()
-- RETURNING id, latitude, longitude, updated_at;

-- Step 5: Verify RLS is enabled
SELECT 
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename = 'profiles';

-- ============================================================================
-- EXPECTED RESULTS:
-- ============================================================================
-- 1. profiles_update_own policy should exist with:
--    - cmd = 'UPDATE'
--    - qual = '(auth.uid() = id)'
--    - with_check = '(auth.uid() = id)'
--
-- 2. Current user profile should have:
--    - profile_id = current_user_id (same UUID after migration)
--    - role = 'driver'
--    - Non-null latitude/longitude if location was updated
--
-- 3. RLS should be enabled (rowsecurity = true)
-- ============================================================================

