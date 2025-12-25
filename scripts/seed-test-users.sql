-- Closed-System Fleet Management: Seed Test Users
-- Run this script in Supabase SQL Editor to whitelist test phone numbers

-- Ensure car_type column exists
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS car_type TEXT;

-- Add unique constraint on phone to prevent duplicates
ALTER TABLE profiles 
ADD CONSTRAINT IF NOT EXISTS profiles_phone_unique UNIQUE (phone);

-- Seed test users to profiles table
INSERT INTO profiles (id, phone, role, full_name, is_approved, vehicle_number, car_type, is_online, current_zone, latitude, longitude, updated_at)
VALUES 
  (
    gen_random_uuid(),
    '+972526099607',
    'admin',
    'Admin Test User',
    true,
    NULL,
    NULL,
    false,
    NULL,
    NULL,
    NULL,
    NOW()
  ),
  (
    gen_random_uuid(),
    '+972509800301',
    'driver',
    'Driver Test User',
    true,
    'TEST-001',
    'Toyota Camry',
    false,
    NULL,
    NULL,
    NULL,
    NOW()
  )
ON CONFLICT (phone) DO NOTHING;

-- Verify the seed worked
SELECT id, phone, role, full_name, vehicle_number, car_type 
FROM profiles 
WHERE phone IN ('+972526099607', '+972509800301');

