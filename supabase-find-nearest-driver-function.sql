-- ============================================
-- Database Function: Find Nearest Driver
-- Used by auto-assign-trip Edge Function
-- ============================================

-- Function to find nearest driver using PostGIS ST_Distance
CREATE OR REPLACE FUNCTION find_nearest_driver(
  pickup_lat DOUBLE PRECISION,
  pickup_lng DOUBLE PRECISION,
  zone_id_filter UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  distance_meters DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.full_name,
    p.latitude,
    p.longitude,
    ST_Distance(
      ST_SetSRID(ST_MakePoint(p.longitude, p.latitude), 4326)::geography,
      ST_SetSRID(ST_MakePoint(pickup_lng, pickup_lat), 4326)::geography
    ) AS distance_meters
  FROM profiles p
  WHERE p.role = 'driver'
    AND p.is_online = true
    AND p.is_approved = true
    AND p.latitude IS NOT NULL
    AND p.longitude IS NOT NULL
    AND (zone_id_filter IS NULL OR p.current_zone = zone_id_filter)
    AND p.id NOT IN (
      SELECT t.driver_id 
      FROM trips t
      WHERE t.status IN ('pending', 'active') 
        AND t.driver_id IS NOT NULL
    )
  ORDER BY distance_meters ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION find_nearest_driver TO authenticated;
GRANT EXECUTE ON FUNCTION find_nearest_driver TO service_role;





