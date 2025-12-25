-- ============================================
-- TaxiFlow Database Migration Script
-- Run this in Supabase SQL Editor
-- ============================================

-- Step 1: Create enum types
CREATE TYPE IF NOT EXISTS user_role AS ENUM ('driver', 'admin');
CREATE TYPE IF NOT EXISTS trip_status AS ENUM ('pending', 'active', 'completed');

-- Step 2: Create zones table FIRST (profiles references it)
CREATE TABLE IF NOT EXISTS zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  polygon_coordinates JSONB,
  color TEXT DEFAULT '#F7C948',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 3: Create profiles table
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone TEXT UNIQUE NOT NULL,
  role user_role NOT NULL,
  full_name TEXT NOT NULL,
  vehicle_number TEXT,
  current_zone UUID REFERENCES zones(id) ON DELETE SET NULL,
  is_online BOOLEAN DEFAULT false,
  is_approved BOOLEAN DEFAULT true,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add vehicle_number column if table already exists
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS vehicle_number TEXT;

-- Add color column to zones if table already exists
ALTER TABLE zones
ADD COLUMN IF NOT EXISTS color TEXT DEFAULT '#F7C948';

-- Create index for vehicle number searches
CREATE INDEX IF NOT EXISTS profiles_vehicle_number_idx ON profiles(vehicle_number);

-- Step 4: Create trips table
CREATE TABLE IF NOT EXISTS trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_phone TEXT NOT NULL,
  pickup_address TEXT NOT NULL,
  destination_address TEXT NOT NULL,
  status trip_status DEFAULT 'pending',
  driver_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Step 5: Create indexes for performance
CREATE INDEX IF NOT EXISTS profiles_phone_idx ON profiles(phone);
CREATE INDEX IF NOT EXISTS profiles_current_zone_idx ON profiles(current_zone);
CREATE INDEX IF NOT EXISTS profiles_role_idx ON profiles(role);
CREATE INDEX IF NOT EXISTS profiles_is_online_idx ON profiles(is_online);
CREATE INDEX IF NOT EXISTS trips_driver_id_idx ON trips(driver_id);
CREATE INDEX IF NOT EXISTS trips_status_idx ON trips(status);
CREATE INDEX IF NOT EXISTS trips_created_at_idx ON trips(created_at DESC);

-- Step 6: Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Step 7: Create triggers for updated_at
DROP TRIGGER IF EXISTS update_profiles_updated_at ON profiles;
CREATE TRIGGER update_profiles_updated_at 
  BEFORE UPDATE ON profiles
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_trips_updated_at ON trips;
CREATE TRIGGER update_trips_updated_at 
  BEFORE UPDATE ON trips
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_zones_updated_at ON zones;
CREATE TRIGGER update_zones_updated_at 
  BEFORE UPDATE ON zones
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();

-- Step 8: Enable Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;

-- Step 9: Drop existing policies if they exist (for clean re-runs)
DROP POLICY IF EXISTS "Drivers can view own profile" ON profiles;
DROP POLICY IF EXISTS "Drivers can update own profile" ON profiles;
DROP POLICY IF EXISTS "Admins can view all profiles" ON profiles;
DROP POLICY IF EXISTS "Admins can update all profiles" ON profiles;
DROP POLICY IF EXISTS "Drivers can view own trips" ON trips;
DROP POLICY IF EXISTS "Admins can view all trips" ON trips;
DROP POLICY IF EXISTS "Admins can insert trips" ON trips;
DROP POLICY IF EXISTS "Admins can update trips" ON trips;
DROP POLICY IF EXISTS "Drivers can update own trips" ON trips;
DROP POLICY IF EXISTS "Everyone can view zones" ON zones;
DROP POLICY IF EXISTS "Admins can manage zones" ON zones;

-- Step 10: Create RLS Policies for profiles
CREATE POLICY "Drivers can view own profile"
  ON profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Drivers can update own profile"
  ON profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update all profiles"
  ON profiles FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Step 11: Create RLS Policies for trips
CREATE POLICY "Drivers can view own trips"
  ON trips FOR SELECT
  USING (driver_id = auth.uid());

CREATE POLICY "Admins can view all trips"
  ON trips FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can insert trips"
  ON trips FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Admins can update trips"
  ON trips FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

CREATE POLICY "Drivers can update own trips"
  ON trips FOR UPDATE
  USING (driver_id = auth.uid());

-- Step 12: Create RLS Policies for zones
CREATE POLICY "Everyone can view zones"
  ON zones FOR SELECT
  USING (true);

CREATE POLICY "Admins can manage zones"
  ON zones FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );

-- Step 13: Enable Realtime for tables (optional but recommended)
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE trips;
ALTER PUBLICATION supabase_realtime ADD TABLE zones;

-- ============================================
-- Migration Complete!
-- ============================================
-- 
-- Next steps:
-- 1. Create a user via Supabase Authentication
-- 2. Insert a profile record for that user:
--    INSERT INTO profiles (id, phone, role, full_name)
--    VALUES (
--      'USER_UUID_FROM_AUTH',
--      '+972501234567',
--      'admin',
--      'Admin Name'
--    );
-- 
-- 3. For testing, you can create a sample zone:
--    INSERT INTO zones (name, polygon_coordinates)
--    VALUES (
--      'מרכז העיר',
--      '{"type": "Polygon", "coordinates": [[[34.2, 29.5], [35.8, 29.5], [35.8, 33.0], [34.2, 33.0], [34.2, 29.5]]]}'::jsonb
--    );
-- ============================================

