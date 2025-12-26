-- =====================================================
-- Clean Slate: Seed Test Users for Closed-System Auth
-- =====================================================
-- This script ensures all required columns exist and seeds test users
-- IMPORTANT: For closed-system auth, we need to temporarily drop the FK constraint
-- Run this in Supabase SQL Editor

-- Step 1: Add all missing columns to profiles table
ALTER TABLE profiles 
  ADD COLUMN IF NOT EXISTS car_type TEXT,
  ADD COLUMN IF NOT EXISTS vehicle_number TEXT,
  ADD COLUMN IF NOT EXISTS is_approved BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_online BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS current_zone UUID,
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS current_address TEXT,
  ADD COLUMN IF NOT EXISTS heading DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

-- Step 2: Add unique constraint on phone (if it doesn't exist)
-- First, drop the constraint if it exists to avoid errors
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'profiles_phone_unique'
  ) THEN
    ALTER TABLE profiles DROP CONSTRAINT profiles_phone_unique;
  END IF;
END $$;

-- Now add the unique constraint
ALTER TABLE profiles 
  ADD CONSTRAINT profiles_phone_unique UNIQUE (phone);

-- Step 3: Temporarily drop the foreign key constraint to auth.users
-- This allows us to create profiles BEFORE auth users exist (closed-system model)
DO $$ 
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'profiles_id_fkey'
  ) THEN
    ALTER TABLE profiles DROP CONSTRAINT profiles_id_fkey;
    RAISE NOTICE 'Dropped profiles_id_fkey constraint for closed-system auth';
  END IF;
END $$;

-- Step 4: Delete existing test numbers (if they exist)
DELETE FROM profiles 
WHERE phone IN ('+972526099607', '+972509800301', '972526099607', '972509800301');

-- Step 5: Insert fresh test users with proper UUIDs
-- These UUIDs will be replaced when users log in via OTP (see app/login/page.tsx)
INSERT INTO profiles (
  id,
  phone,
  role,
  full_name,
  is_approved,
  vehicle_number,
  car_type,
  is_online,
  current_zone,
  latitude,
  longitude,
  current_address,
  heading,
  updated_at
)
VALUES 
  (
    gen_random_uuid(),  -- Admin user UUID (will be linked to auth.users on first login)
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
    NULL,
    NULL,
    NOW()
  ),
  (
    gen_random_uuid(),  -- Driver user UUID (will be linked to auth.users on first login)
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
    NULL,
    NULL,
    NOW()
  )
ON CONFLICT (phone) DO NOTHING;

-- Step 6: Verify the seed worked
SELECT 
  id,
  phone,
  role,
  full_name,
  vehicle_number,
  car_type,
  is_approved,
  is_online
FROM profiles 
WHERE phone IN ('+972526099607', '+972509800301')
ORDER BY role;

-- Expected output: 2 rows (1 admin, 1 driver)
-- 
-- NOTE: The foreign key constraint profiles_id_fkey has been dropped.
-- This is intentional for the closed-system model where profiles are created
-- BEFORE auth users exist. When a user logs in via OTP, their profile.id
-- will be updated to match their auth.users.id (see app/login/page.tsx).
-- 
-- If you need to restore the FK constraint later, run:
-- ALTER TABLE profiles 
--   ADD CONSTRAINT profiles_id_fkey 
--   FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
