-- ============================================================================
-- MIGRATE PROFILE ID FUNCTION
-- ============================================================================
-- Atomic transaction to migrate profile from old ID to new auth user ID
-- This ensures all operations happen atomically, preventing foreign key violations
-- ============================================================================

CREATE OR REPLACE FUNCTION migrate_profile_id(
  old_profile_id uuid,
  new_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  old_profile_record RECORD;
  trips_count integer;
  result jsonb;
BEGIN
  -- Validate inputs
  IF old_profile_id IS NULL OR new_user_id IS NULL THEN
    RAISE EXCEPTION 'Both old_profile_id and new_user_id must be provided';
  END IF;

  -- Check if new profile already exists
  IF EXISTS (SELECT 1 FROM profiles WHERE id = new_user_id) THEN
    RETURN jsonb_build_object(
      'success', true,
      'message', 'Profile already exists with new ID',
      'profile_id', new_user_id
    );
  END IF;

  -- Fetch old profile data
  SELECT * INTO old_profile_record
  FROM profiles
  WHERE id = old_profile_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Profile not found with old ID: %', old_profile_id;
  END IF;

  -- Count trips that need to be updated (for logging)
  SELECT COUNT(*) INTO trips_count
  FROM trips
  WHERE driver_id = old_profile_id;

  -- Step 1: Create new profile with new ID (using old phone temporarily)
  -- Since phone is unique, we need to temporarily set old profile's phone to NULL
  -- This is safe because it's within a transaction
  UPDATE profiles
  SET phone = phone || '_old_' || old_profile_id::text
  WHERE id = old_profile_id;

  -- Step 2: Insert new profile with correct ID and original phone
  INSERT INTO profiles (
    id, phone, role, full_name, vehicle_number, car_type,
    current_zone, station_id, is_online, is_approved,
    latitude, longitude, current_address, heading,
    created_at, updated_at
  ) VALUES (
    new_user_id,
    old_profile_record.phone,
    old_profile_record.role,
    old_profile_record.full_name,
    old_profile_record.vehicle_number,
    old_profile_record.car_type,
    old_profile_record.current_zone,
    old_profile_record.station_id,
    COALESCE(old_profile_record.is_online, false),
    COALESCE(old_profile_record.is_approved, true),
    old_profile_record.latitude,
    old_profile_record.longitude,
    old_profile_record.current_address,
    old_profile_record.heading,
    COALESCE(old_profile_record.created_at, NOW()),
    NOW()
  );

  -- Step 3: Update trips.driver_id to new ID (now profile exists!)
  UPDATE trips
  SET driver_id = new_user_id,
      updated_at = NOW()
  WHERE driver_id = old_profile_id;

  -- Step 4: Verify new profile exists before deleting old one
  IF NOT EXISTS (SELECT 1 FROM profiles WHERE id = new_user_id) THEN
    RAISE EXCEPTION 'New profile was not created successfully';
  END IF;

  -- Step 5: Delete old profile (safe now - trips are updated and new profile exists)
  DELETE FROM profiles
  WHERE id = old_profile_id;

  -- Return success with details
  RETURN jsonb_build_object(
    'success', true,
    'message', 'Profile migrated successfully',
    'old_profile_id', old_profile_id,
    'new_profile_id', new_user_id,
    'trips_updated', trips_count,
    'phone', old_profile_record.phone,
    'role', old_profile_record.role
  );

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'Unique constraint violation: Phone or ID already exists';
  WHEN foreign_key_violation THEN
    RAISE EXCEPTION 'Foreign key constraint violation during migration';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error migrating profile: %', SQLERRM;
END;
$$;

-- Grant execute permission to authenticated users (will be called via service role)
GRANT EXECUTE ON FUNCTION migrate_profile_id(uuid, uuid) TO authenticated;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- Test the function (replace with actual IDs):
-- SELECT migrate_profile_id('old-uuid-here', 'new-uuid-here');
-- ============================================================================

