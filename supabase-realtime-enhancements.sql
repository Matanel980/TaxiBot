-- ============================================
-- TaxiFlow Real-Time Operation Center Enhancements
-- Run this after the main migration
-- ============================================

-- Function to automatically update driver's current_zone based on their GPS position
-- This runs in PostgreSQL and uses PostGIS-like functionality
CREATE OR REPLACE FUNCTION update_driver_zone()
RETURNS TRIGGER AS $$
DECLARE
  zone_record RECORD;
  point_lat DOUBLE PRECISION;
  point_lng DOUBLE PRECISION;
  new_zone_id UUID;
BEGIN
  -- Only process if latitude/longitude changed and driver is online
  IF (NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL AND NEW.is_online = true) THEN
    point_lat := NEW.latitude;
    point_lng := NEW.longitude;
    new_zone_id := NULL;

    -- Check each zone to see if the driver is within it
    FOR zone_record IN 
      SELECT id, polygon_coordinates 
      FROM zones 
      WHERE polygon_coordinates IS NOT NULL
    LOOP
      -- Note: This is a simplified check. For production, consider using PostGIS extension
      -- for proper geographic calculations with ST_Contains
      -- For now, we'll let the frontend handle precise zone detection
      NULL;
    END LOOP;

    -- Update the current_zone if needed
    -- NEW.current_zone := new_zone_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for automatic zone detection (optional - can be handled in app)
-- DROP TRIGGER IF EXISTS trigger_update_driver_zone ON profiles;
-- CREATE TRIGGER trigger_update_driver_zone
--   BEFORE UPDATE ON profiles
--   FOR EACH ROW
--   WHEN (OLD.latitude IS DISTINCT FROM NEW.latitude OR OLD.longitude IS DISTINCT FROM NEW.longitude)
--   EXECUTE FUNCTION update_driver_zone();

-- Add index for faster zone lookups
CREATE INDEX IF NOT EXISTS profiles_location_idx ON profiles(latitude, longitude) WHERE is_online = true;

-- Add composite index for active drivers
CREATE INDEX IF NOT EXISTS profiles_active_drivers_idx ON profiles(role, is_online, latitude, longitude) WHERE role = 'driver' AND is_online = true;

-- Function to get drivers in a specific zone (useful for analytics)
CREATE OR REPLACE FUNCTION get_drivers_in_zone(zone_uuid UUID)
RETURNS TABLE (
  driver_id UUID,
  driver_name TEXT,
  phone TEXT,
  vehicle_number TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.full_name,
    p.phone,
    p.vehicle_number,
    p.latitude,
    p.longitude
  FROM profiles p
  WHERE p.current_zone = zone_uuid
    AND p.role = 'driver'
    AND p.is_online = true;
END;
$$ LANGUAGE plpgsql;

-- View for real-time dashboard statistics
CREATE OR REPLACE VIEW dashboard_stats AS
SELECT
  COUNT(*) FILTER (WHERE role = 'driver') as total_drivers,
  COUNT(*) FILTER (WHERE role = 'driver' AND is_online = true) as online_drivers,
  COUNT(*) FILTER (WHERE role = 'driver' AND is_online = true AND current_zone IS NOT NULL) as drivers_in_zones,
  COUNT(DISTINCT current_zone) FILTER (WHERE is_online = true) as active_zones,
  (SELECT COUNT(*) FROM trips WHERE status = 'pending') as pending_trips,
  (SELECT COUNT(*) FROM trips WHERE status = 'active') as active_trips,
  (SELECT COUNT(*) FROM trips WHERE status = 'completed' AND DATE(created_at) = CURRENT_DATE) as completed_today
FROM profiles;

-- Grant permissions (adjust based on your RLS setup)
GRANT SELECT ON dashboard_stats TO authenticated;

-- Add comments for documentation
COMMENT ON TABLE zones IS 'Geographic zones for taxi operations in Acre, Israel. Polygons stored as GeoJSON.';
COMMENT ON COLUMN profiles.current_zone IS 'Automatically updated based on driver GPS location and defined zones.';
COMMENT ON COLUMN profiles.vehicle_number IS 'License plate number of the taxi.';
COMMENT ON COLUMN profiles.is_online IS 'Whether the driver is currently available for dispatch.';
COMMENT ON COLUMN profiles.latitude IS 'Real-time GPS latitude, updated every 30 seconds when online.';
COMMENT ON COLUMN profiles.longitude IS 'Real-time GPS longitude, updated every 30 seconds when online.';

-- ============================================
-- Zone Detection Notes
-- ============================================
-- 
-- For production deployments with high accuracy requirements:
-- 1. Consider installing PostGIS extension:
--    CREATE EXTENSION IF NOT EXISTS postgis;
-- 
-- 2. Then convert polygon_coordinates to proper geometry:
--    ALTER TABLE zones ADD COLUMN geom geometry(Polygon, 4326);
--    UPDATE zones SET geom = ST_GeomFromGeoJSON(polygon_coordinates::text);
--    CREATE INDEX zones_geom_idx ON zones USING GIST (geom);
-- 
-- 3. Use ST_Contains for accurate point-in-polygon:
--    SELECT * FROM zones WHERE ST_Contains(geom, ST_SetSRID(ST_MakePoint(longitude, latitude), 4326));
-- 
-- For this implementation, zone detection is handled in the React app
-- using Google Maps Geometry library for simplicity and real-time performance.
-- ============================================

