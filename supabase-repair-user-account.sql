-- ============================================================================
-- REPAIR USER ACCOUNT - Phone Format Alignment
-- ============================================================================
-- This script ensures phone numbers in auth.users and public.profiles
-- are in EXACT E.164 format (+972XXXXXXXXX) for user UID:
-- 7a1c065d-fe67-4551-be0e-9b2b7aa3dba8
--
-- Run this in Supabase SQL Editor (Dashboard > SQL Editor)
-- ============================================================================

BEGIN;

-- Step 1: Check current state
DO $$
DECLARE
  user_uid uuid := '7a1c065d-fe67-4551-be0e-9b2b7aa3dba8';
  auth_phone text;
  profile_phone text;
  normalized_phone text;
BEGIN
  -- Get phone from auth.users
  SELECT phone INTO auth_phone
  FROM auth.users
  WHERE id = user_uid;
  
  -- Get phone from public.profiles
  SELECT phone INTO profile_phone
  FROM public.profiles
  WHERE id = user_uid;
  
  RAISE NOTICE 'Current state:';
  RAISE NOTICE '  auth.users.phone: %', COALESCE(auth_phone, 'NULL');
  RAISE NOTICE '  public.profiles.phone: %', COALESCE(profile_phone, 'NULL');
  
  -- Normalize phone (extract digits and add +972 prefix)
  IF auth_phone IS NOT NULL THEN
    -- Extract digits
    normalized_phone := regexp_replace(auth_phone, '[^0-9]', '', 'g');
    
    -- Remove country code if present
    IF normalized_phone LIKE '972%' THEN
      normalized_phone := substring(normalized_phone from 4);
    END IF;
    
    -- Remove leading 0 if present
    IF normalized_phone LIKE '0%' THEN
      normalized_phone := substring(normalized_phone from 2);
    END IF;
    
    -- Add E.164 prefix
    normalized_phone := '+972' || normalized_phone;
    
    RAISE NOTICE '  Normalized phone: %', normalized_phone;
    
    -- Update auth.users if needed
    IF auth_phone != normalized_phone THEN
      UPDATE auth.users
      SET phone = normalized_phone,
          phone_confirmed_at = COALESCE(phone_confirmed_at, now())
      WHERE id = user_uid;
      
      RAISE NOTICE '  ✅ Updated auth.users.phone to: %', normalized_phone;
    ELSE
      RAISE NOTICE '  ✅ auth.users.phone already normalized';
    END IF;
    
    -- Update public.profiles if needed
    IF profile_phone IS NULL OR profile_phone != normalized_phone THEN
      UPDATE public.profiles
      SET phone = normalized_phone,
          updated_at = now()
      WHERE id = user_uid;
      
      RAISE NOTICE '  ✅ Updated public.profiles.phone to: %', normalized_phone;
    ELSE
      RAISE NOTICE '  ✅ public.profiles.phone already normalized';
    END IF;
    
  ELSE
    RAISE WARNING '  ⚠️ No phone found in auth.users for user %', user_uid;
  END IF;
  
  -- Verify station_id is set
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_uid AND station_id IS NOT NULL
  ) THEN
    RAISE NOTICE '  ✅ station_id is set';
  ELSE
    RAISE WARNING '  ⚠️ station_id is NOT set - user may not be able to login';
    
    -- Try to set station_id to Main Station
    UPDATE public.profiles
    SET station_id = (
      SELECT id FROM public.stations
      WHERE name = 'Main Station'
      LIMIT 1
    ),
    updated_at = now()
    WHERE id = user_uid;
    
    IF FOUND THEN
      RAISE NOTICE '  ✅ Set station_id to Main Station';
    END IF;
  END IF;
  
  -- Verify role is admin
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = user_uid AND role = 'admin'
  ) THEN
    RAISE NOTICE '  ✅ role is admin';
  ELSE
    RAISE WARNING '  ⚠️ role is not admin - updating to admin';
    
    UPDATE public.profiles
    SET role = 'admin',
        updated_at = now()
    WHERE id = user_uid;
    
    RAISE NOTICE '  ✅ Updated role to admin';
  END IF;
  
END $$;

-- Step 2: Verify final state
SELECT 
  u.id,
  u.phone as auth_phone,
  p.phone as profile_phone,
  p.role,
  p.station_id,
  s.name as station_name,
  CASE 
    WHEN u.phone = p.phone THEN '✅ MATCH'
    ELSE '❌ MISMATCH'
  END as phone_match,
  CASE 
    WHEN u.phone LIKE '+972%' AND p.phone LIKE '+972%' THEN '✅ E.164 FORMAT'
    ELSE '❌ NOT E.164'
  END as format_check
FROM auth.users u
LEFT JOIN public.profiles p ON u.id = p.id
LEFT JOIN public.stations s ON p.station_id = s.id
WHERE u.id = '7a1c065d-fe67-4551-be0e-9b2b7aa3dba8';

COMMIT;

-- ============================================================================
-- VERIFICATION
-- ============================================================================
-- After running, check:
-- 1. auth_phone and profile_phone should be IDENTICAL
-- 2. Both should start with +972
-- 3. phone_match should show "✅ MATCH"
-- 4. format_check should show "✅ E.164 FORMAT"
-- 5. role should be 'admin'
-- 6. station_id should be set (not NULL)
-- ============================================================================





