-- ============================================================================
-- Enhanced Database Function: Find Nearest Driver (Station-Aware)
-- ============================================================================
-- This function finds the nearest available driver using PostGIS ST_Distance
-- with automatic station_id detection and multi-tenant isolation
--
-- Features:
-- - Filters by station_id (multi-tenant isolation)
-- - PostGIS spatial distance calculation
-- - Excludes busy drivers (with pending/active trips)
-- - Returns clean JSON format for n8n integration
-- ============================================================================

-- Drop old function if exists
DROP FUNCTION IF EXISTS find_nearest_driver(DOUBLE PRECISION, DOUBLE PRECISION, UUID);
DROP FUNCTION IF EXISTS find_nearest_driver(DOUBLE PRECISION, DOUBLE PRECISION, UUID, UUID);

-- Enhanced function with station_id support
CREATE OR REPLACE FUNCTION find_nearest_driver(
  pickup_lat DOUBLE PRECISION,
  pickup_lng DOUBLE PRECISION,
  zone_id_filter UUID DEFAULT NULL,
  station_id_filter UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  phone TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  distance_meters DOUBLE PRECISION,
  station_id UUID,
  vehicle_number TEXT,
  car_type TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.full_name,
    p.phone,
    p.latitude,
    p.longitude,
    ST_Distance(
      ST_SetSRID(ST_MakePoint(p.longitude, p.latitude), 4326)::geography,
      ST_SetSRID(ST_MakePoint(pickup_lng, pickup_lat), 4326)::geography
    ) AS distance_meters,
    p.station_id,
    p.vehicle_number,
    p.car_type
  FROM profiles p
  WHERE p.role = 'driver'
    AND p.is_online = true
    AND p.is_approved = true
    AND p.latitude IS NOT NULL
    AND p.longitude IS NOT NULL
    -- CRITICAL: Station filter for multi-tenant isolation
    AND (station_id_filter IS NULL OR p.station_id = station_id_filter)
    -- Zone filter (optional)
    AND (zone_id_filter IS NULL OR p.current_zone = zone_id_filter)
    -- Exclude busy drivers
    AND p.id NOT IN (
      SELECT t.driver_id 
      FROM trips t
      WHERE t.status IN ('pending', 'active') 
        AND t.driver_id IS NOT NULL
        -- CRITICAL: Also filter busy trips by station_id
        AND (station_id_filter IS NULL OR t.station_id = station_id_filter)
    )
  ORDER BY distance_meters ASC
  LIMIT 10; -- Return top 10 nearest drivers (n8n can choose)
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION find_nearest_driver(DOUBLE PRECISION, DOUBLE PRECISION, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION find_nearest_driver(DOUBLE PRECISION, DOUBLE PRECISION, UUID, UUID) TO service_role;

-- ============================================================================
-- Helper Function: Auto-Detect Station from Coordinates
-- ============================================================================
-- This function automatically identifies which station a trip belongs to
-- by checking which station's zones contain the pickup point
-- ============================================================================

CREATE OR REPLACE FUNCTION detect_station_from_coordinates(
  pickup_lat DOUBLE PRECISION,
  pickup_lng DOUBLE PRECISION
)
RETURNS UUID AS $$
DECLARE
  detected_station_id UUID;
BEGIN
  -- Try to find station by checking which zone contains the pickup point
  SELECT DISTINCT z.station_id INTO detected_station_id
  FROM zones_postgis z
  WHERE z.station_id IS NOT NULL
    AND ST_Contains(
      z.geometry::geometry,
      ST_SetSRID(ST_MakePoint(pickup_lng, pickup_lat), 4326)
    )
  LIMIT 1;
  
  -- If no zone match, try to find station by proximity to station center
  -- (This is a fallback if zones don't cover all areas)
  IF detected_station_id IS NULL THEN
    SELECT s.id INTO detected_station_id
    FROM stations s
    WHERE EXISTS (
      SELECT 1 FROM zones_postgis z
      WHERE z.station_id = s.id
      LIMIT 1
    )
    ORDER BY (
      SELECT MIN(
        ST_Distance(
          ST_SetSRID(ST_MakePoint(pickup_lng, pickup_lat), 4326)::geography,
          ST_Centroid(z.geometry::geometry)::geography
        )
      )
      FROM zones_postgis z
      WHERE z.station_id = s.id
    ) ASC
    LIMIT 1;
  END IF;
  
  RETURN detected_station_id;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION detect_station_from_coordinates(DOUBLE PRECISION, DOUBLE PRECISION) IS 
  'Automatically detects station_id from pickup coordinates by checking which station zone contains the point';

GRANT EXECUTE ON FUNCTION detect_station_from_coordinates(DOUBLE PRECISION, DOUBLE PRECISION) TO authenticated;
GRANT EXECUTE ON FUNCTION detect_station_from_coordinates(DOUBLE PRECISION, DOUBLE PRECISION) TO service_role;

-- ============================================================================
-- Enhanced Function: Find Nearest Drivers with Auto Station Detection
-- ============================================================================
-- This is the main function for n8n integration
-- Automatically detects station_id and returns nearest drivers
-- ============================================================================

CREATE OR REPLACE FUNCTION find_nearest_drivers_auto(
  pickup_lat DOUBLE PRECISION,
  pickup_lng DOUBLE PRECISION,
  zone_id_filter UUID DEFAULT NULL,
  station_id_override UUID DEFAULT NULL
)
RETURNS JSON AS $$
DECLARE
  detected_station_id UUID;
  drivers_result JSON;
BEGIN
  -- Auto-detect station_id if not provided
  IF station_id_override IS NOT NULL THEN
    detected_station_id := station_id_override;
  ELSE
    detected_station_id := detect_station_from_coordinates(pickup_lat, pickup_lng);
  END IF;
  
  -- Find nearest drivers
  SELECT json_agg(
    json_build_object(
      'id', id,
      'full_name', full_name,
      'phone', phone,
      'latitude', latitude,
      'longitude', longitude,
      'distance_meters', ROUND(distance_meters::numeric, 2),
      'distance_km', ROUND((distance_meters / 1000.0)::numeric, 2),
      'station_id', station_id,
      'vehicle_number', vehicle_number,
      'car_type', car_type
    )
    ORDER BY distance_meters ASC
  ) INTO drivers_result
  FROM find_nearest_driver(
    pickup_lat,
    pickup_lng,
    zone_id_filter,
    detected_station_id
  );
  
  -- Return clean JSON format for n8n
  RETURN json_build_object(
    'success', true,
    'station_id', detected_station_id,
    'pickup_location', json_build_object(
      'latitude', pickup_lat,
      'longitude', pickup_lng
    ),
    'drivers', COALESCE(drivers_result, '[]'::json),
    'driver_count', json_array_length(COALESCE(drivers_result, '[]'::json))
  );
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION find_nearest_drivers_auto(DOUBLE PRECISION, DOUBLE PRECISION, UUID, UUID) IS 
  'Finds nearest drivers with automatic station detection. Returns clean JSON for n8n integration.';

GRANT EXECUTE ON FUNCTION find_nearest_drivers_auto(DOUBLE PRECISION, DOUBLE PRECISION, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION find_nearest_drivers_auto(DOUBLE PRECISION, DOUBLE PRECISION, UUID, UUID) TO service_role;

-- ============================================================================
-- Verification Queries
-- ============================================================================
-- Run these to verify the functions work:
--
-- 1. Test station detection:
-- SELECT detect_station_from_coordinates(32.9, 35.1);
--
-- 2. Test nearest drivers (with station):
-- SELECT * FROM find_nearest_driver(32.9, 35.1, NULL, 'your-station-id');
--
-- 3. Test auto function (n8n format):
-- SELECT find_nearest_drivers_auto(32.9, 35.1);
-- ============================================================================
