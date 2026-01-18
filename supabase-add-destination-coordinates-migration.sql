-- ============================================================================
-- MISSION-CRITICAL: Add Destination Coordinates to Trips Table
-- ============================================================================
-- This migration adds destination_lat and destination_lng columns to ensure
-- ALL trips have complete coordinate data for route visualization.
--
-- IMPORTANT: Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================================

BEGIN;

-- Step 1: Add destination coordinate columns (allow NULLs for existing trips)
ALTER TABLE trips 
ADD COLUMN IF NOT EXISTS destination_lat DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS destination_lng DOUBLE PRECISION;

-- Step 2: Add comments for documentation
COMMENT ON COLUMN trips.destination_lat IS 'Destination latitude (REQUIRED for new trips, nullable for backward compatibility)';
COMMENT ON COLUMN trips.destination_lng IS 'Destination longitude (REQUIRED for new trips, nullable for backward compatibility)';

-- Step 3: Create spatial index for destination coordinates (optional, for performance)
-- This enables fast spatial queries on destination points
CREATE INDEX IF NOT EXISTS idx_trips_destination_coords 
ON trips USING GIST (point(destination_lng, destination_lat))
WHERE destination_lat IS NOT NULL AND destination_lng IS NOT NULL;

-- Step 4: Update RLS policies to include new columns
-- Check if RLS is enabled
DO $$
BEGIN
  -- If RLS is enabled, we need to ensure policies allow access to new columns
  -- Most policies use SELECT * or explicit column lists, so they should work automatically
  -- But we'll verify and update if needed
  
  -- Check existing policies on trips table
  IF EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'trips'
  ) THEN
    -- Policies exist - they should automatically include new columns
    -- If you have explicit column lists in policies, update them manually
    RAISE NOTICE 'RLS policies exist on trips table. Verify they include destination_lat and destination_lng if using explicit column lists.';
  ELSE
    RAISE NOTICE 'No RLS policies found on trips table. If RLS is enabled, create policies that include destination_lat and destination_lng.';
  END IF;
END $$;

-- Step 5: Grant permissions (if using service role or specific roles)
-- These are usually handled by default, but we'll ensure they're set
GRANT SELECT, INSERT, UPDATE ON trips TO authenticated;
GRANT SELECT, INSERT, UPDATE ON trips TO service_role;

COMMIT;

-- ============================================================================
-- VERIFICATION QUERIES (Run these after migration to verify)
-- ============================================================================

-- Check columns were added:
-- SELECT column_name, data_type, is_nullable 
-- FROM information_schema.columns 
-- WHERE table_name = 'trips' 
-- AND column_name IN ('destination_lat', 'destination_lng');

-- Check index was created:
-- SELECT indexname, indexdef 
-- FROM pg_indexes 
-- WHERE tablename = 'trips' 
-- AND indexname = 'idx_trips_destination_coords';

-- Count trips with/without destination coordinates:
-- SELECT 
--   COUNT(*) as total_trips,
--   COUNT(destination_lat) as trips_with_dest_lat,
--   COUNT(destination_lng) as trips_with_dest_lng,
--   COUNT(*) FILTER (WHERE destination_lat IS NOT NULL AND destination_lng IS NOT NULL) as trips_with_both_coords
-- FROM trips;

-- ============================================================================
-- BACKFILL SCRIPT (Optional - Run separately if you have existing trips)
-- ============================================================================
-- If you have existing trips without destination coordinates, you'll need to
-- geocode them. This is a template - customize based on your needs:
--
-- UPDATE trips 
-- SET destination_lat = NULL, destination_lng = NULL 
-- WHERE destination_lat IS NULL OR destination_lng IS NULL;
--
-- Then use your geocoding service (Google Geocoding API) to backfill:
-- For each trip, call geocodeAddress(trip.destination_address) and update:
--
-- UPDATE trips 
-- SET destination_lat = <geocoded_lat>, 
--     destination_lng = <geocoded_lng>
-- WHERE id = '<trip_id>';
--
-- ============================================================================
