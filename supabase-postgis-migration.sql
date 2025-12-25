-- ============================================
-- PostGIS Zone Management Migration
-- Run this in Supabase SQL Editor
-- ============================================

-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create new zones_postgis table with proper geometry
CREATE TABLE IF NOT EXISTS zones_postgis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  geometry GEOMETRY(Polygon, 4326) NOT NULL,
  color TEXT DEFAULT '#F7C948',
  center_lat DOUBLE PRECISION,
  center_lng DOUBLE PRECISION,
  area_sqm DOUBLE PRECISION,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create spatial index (GIST) for fast containment queries
CREATE INDEX IF NOT EXISTS zones_geometry_idx ON zones_postgis USING GIST (geometry);

-- Create index for driver zone lookups
CREATE INDEX IF NOT EXISTS zones_name_idx ON zones_postgis(name);

-- Add trigger for updated_at
CREATE TRIGGER zones_postgis_updated_at 
  BEFORE UPDATE ON zones_postgis
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Function: Check if point is in any zone (for n8n automation)
CREATE OR REPLACE FUNCTION get_zone_for_point(lat DOUBLE PRECISION, lng DOUBLE PRECISION)
RETURNS TABLE(zone_id UUID, zone_name TEXT, zone_color TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT id, name, color
  FROM zones_postgis
  WHERE ST_Contains(geometry, ST_SetSRID(ST_MakePoint(lng, lat), 4326))
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Function: Create zone from WKT
CREATE OR REPLACE FUNCTION create_zone_from_wkt(
  zone_name TEXT,
  wkt_string TEXT,
  zone_color TEXT,
  center_latitude DOUBLE PRECISION,
  center_longitude DOUBLE PRECISION,
  area DOUBLE PRECISION
) RETURNS zones_postgis AS $$
DECLARE
  new_zone zones_postgis;
BEGIN
  INSERT INTO zones_postgis (name, geometry, color, center_lat, center_lng, area_sqm)
  VALUES (
    zone_name,
    ST_GeomFromText(wkt_string, 4326),
    zone_color,
    center_latitude,
    center_longitude,
    area
  )
  RETURNING * INTO new_zone;
  
  RETURN new_zone;
END;
$$ LANGUAGE plpgsql;

-- Function: Update zone from WKT
CREATE OR REPLACE FUNCTION update_zone_from_wkt(
  zone_id UUID,
  zone_name TEXT,
  wkt_string TEXT,
  zone_color TEXT,
  center_latitude DOUBLE PRECISION,
  center_longitude DOUBLE PRECISION,
  area DOUBLE PRECISION
) RETURNS zones_postgis AS $$
DECLARE
  updated_zone zones_postgis;
BEGIN
  UPDATE zones_postgis
  SET 
    name = zone_name,
    geometry = ST_GeomFromText(wkt_string, 4326),
    color = zone_color,
    center_lat = center_latitude,
    center_lng = center_longitude,
    area_sqm = area,
    updated_at = NOW()
  WHERE id = zone_id
  RETURNING * INTO updated_zone;
  
  RETURN updated_zone;
END;
$$ LANGUAGE plpgsql;

-- Function: Get all zones as GeoJSON
CREATE OR REPLACE FUNCTION get_zones_geojson()
RETURNS JSON AS $$
BEGIN
  RETURN (
    SELECT json_build_object(
      'type', 'FeatureCollection',
      'features', json_agg(
        json_build_object(
          'type', 'Feature',
          'id', id,
          'geometry', ST_AsGeoJSON(geometry)::json,
          'properties', json_build_object(
            'name', name,
            'color', color,
            'area_sqm', area_sqm,
            'center_lat', center_lat,
            'center_lng', center_lng,
            'created_at', created_at
          )
        )
      )
    )
    FROM zones_postgis
  );
END;
$$ LANGUAGE plpgsql;

-- Function: Migrate existing zones from JSONB to PostGIS
CREATE OR REPLACE FUNCTION migrate_zones_to_postgis() RETURNS INTEGER AS $$
DECLARE
  zone_record RECORD;
  coord RECORD;
  wkt_coords TEXT;
  migrated_count INTEGER := 0;
BEGIN
  FOR zone_record IN 
    SELECT * FROM zones 
    WHERE polygon_coordinates IS NOT NULL 
    AND polygon_coordinates::jsonb->'coordinates'->0 IS NOT NULL
  LOOP
    -- Build WKT from GeoJSON coordinates
    wkt_coords := '';
    FOR coord IN 
      SELECT 
        jsonb_array_elements(zone_record.polygon_coordinates::jsonb->'coordinates'->0) as point
    LOOP
      IF wkt_coords != '' THEN
        wkt_coords := wkt_coords || ', ';
      END IF;
      wkt_coords := wkt_coords || 
        (coord.point->>0)::text || ' ' || (coord.point->>1)::text;
    END LOOP;
    
    -- Insert into PostGIS table
    BEGIN
      INSERT INTO zones_postgis (id, name, geometry, color, created_at, updated_at)
      VALUES (
        zone_record.id,
        zone_record.name,
        ST_GeomFromText('POLYGON((' || wkt_coords || '))', 4326),
        COALESCE(zone_record.color, '#F7C948'),
        zone_record.created_at,
        zone_record.updated_at
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        geometry = EXCLUDED.geometry,
        color = EXCLUDED.color;
      
      migrated_count := migrated_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Failed to migrate zone %: %', zone_record.id, SQLERRM;
    END;
  END LOOP;
  
  RETURN migrated_count;
END;
$$ LANGUAGE plpgsql;

-- Grant necessary permissions
GRANT SELECT ON zones_postgis TO authenticated;
GRANT INSERT, UPDATE, DELETE ON zones_postgis TO authenticated;

-- Enable RLS for zones_postgis
ALTER TABLE zones_postgis ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Everyone can view zones"
  ON zones_postgis FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage zones"
  ON zones_postgis FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- ============================================
-- Migration Complete!
-- ============================================
-- 
-- To migrate existing zones, run:
-- SELECT migrate_zones_to_postgis();
--
-- Test point-in-polygon:
-- SELECT * FROM get_zone_for_point(32.9270, 35.0830);
-- ============================================

