-- ============================================
-- Auto-Profile Creation Trigger
-- Run this in Supabase SQL Editor
-- ============================================
-- 
-- This trigger automatically creates a profile when a new auth user is created
-- It handles both first-time signups and pre-created profiles
-- ============================================

-- Step 1: Create function to handle new user creation
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER -- CRITICAL: Bypasses RLS to allow profile creation
SET search_path = public
AS $$
DECLARE
  existing_profile RECORD;
  default_station_id UUID;
BEGIN
  -- CRITICAL: Check if profile already exists by phone (pre-created profiles)
  -- This handles the case where admin created profile before user signed up
  SELECT * INTO existing_profile
  FROM profiles
  WHERE phone = NEW.phone
  LIMIT 1;
  
  IF existing_profile IS NOT NULL THEN
    -- Profile exists but ID might not match auth user ID
    IF existing_profile.id != NEW.id THEN
      -- Update existing profile to match auth user ID
      -- This requires a migration function to handle foreign key constraints
      -- For now, we'll create a new profile and mark the old one for cleanup
      -- (The link-profile API route will handle the actual migration)
      
      -- Create new profile with auth user ID
      INSERT INTO profiles (
        id,
        phone,
        role,
        full_name,
        vehicle_number,
        car_type,
        station_id,
        is_online,
        is_approved,
        current_zone,
        latitude,
        longitude,
        current_address,
        heading
      )
      VALUES (
        NEW.id,
        NEW.phone,
        COALESCE(existing_profile.role, 'driver'),
        COALESCE(existing_profile.full_name, ''),
        existing_profile.vehicle_number,
        existing_profile.car_type,
        existing_profile.station_id,
        false,
        COALESCE(existing_profile.is_approved, false),
        existing_profile.current_zone,
        existing_profile.latitude,
        existing_profile.longitude,
        existing_profile.current_address,
        existing_profile.heading
      )
      ON CONFLICT (id) DO NOTHING;
      
      -- Note: Old profile will be cleaned up by link-profile API route
      -- which handles foreign key migrations (trips.driver_id, etc.)
    ELSE
      -- Profile already exists with correct ID, just ensure it's synced
      UPDATE profiles
      SET 
        phone = NEW.phone,
        updated_at = NOW()
      WHERE id = NEW.id;
    END IF;
  ELSE
    -- No existing profile - create new one for first-time user
    -- Try to get default station_id from JWT metadata or use NULL
    default_station_id := (NEW.raw_user_meta_data->>'station_id')::uuid;
    
    INSERT INTO profiles (
      id,
      phone,
      role,
      full_name,
      station_id,
      is_online,
      is_approved,
      current_zone,
      latitude,
      longitude,
      current_address,
      heading
    )
    VALUES (
      NEW.id,
      NEW.phone,
      COALESCE((NEW.raw_user_meta_data->>'role')::text, 'driver'),
      COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
      default_station_id,
      false,
      false, -- New users need admin approval
      NULL,
      NULL,
      NULL,
      NULL,
      NULL
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;
  
  -- Sync role and station_id to JWT metadata (if trigger exists)
  -- This ensures RLS policies can read role from JWT
  UPDATE auth.users
  SET raw_user_meta_data = jsonb_build_object(
    'role', COALESCE((SELECT role FROM profiles WHERE id = NEW.id), 'driver'),
    'station_id', COALESCE((SELECT station_id::text FROM profiles WHERE id = NEW.id), NULL)
  )
  WHERE id = NEW.id;
  
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't fail auth user creation
    RAISE WARNING 'Error creating profile for user %: %', NEW.id, SQLERRM;
    RETURN NEW;
END;
$$;

-- Step 2: Create trigger on auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();

-- Step 3: Verify trigger was created
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_trigger 
    WHERE tgname = 'on_auth_user_created'
  ) THEN
    RAISE NOTICE '✅ Auto-profile creation trigger created successfully';
  ELSE
    RAISE EXCEPTION '❌ Failed to create trigger';
  END IF;
END $$;

-- ============================================
-- Notes:
-- ============================================
-- 
-- 1. This trigger runs AFTER auth user is created
-- 2. It checks for existing profiles by phone number
-- 3. If profile exists with different ID, it creates a new profile
--    (The link-profile API route handles the actual migration)
-- 4. If no profile exists, it creates a new one with default values
-- 5. The trigger uses SECURITY DEFINER to bypass RLS
-- 6. Errors are logged but don't fail auth user creation
--
-- ============================================
-- Testing:
-- ============================================
-- 
-- 1. Create a new auth user via Supabase Auth
-- 2. Check if profile was automatically created:
--    SELECT * FROM profiles WHERE id = '<new-user-id>';
-- 3. Verify profile has correct phone, role, and station_id
--
-- ============================================
