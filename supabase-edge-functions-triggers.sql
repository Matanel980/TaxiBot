-- ============================================
-- Supabase Edge Functions Database Triggers
-- Run this in Supabase SQL Editor
-- ============================================
--
-- This migration creates database triggers to automatically
-- invoke Edge Functions when trips are created or assigned
--
-- ============================================

-- Step 1: Enable pg_net extension (required for http requests from database)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Step 2: Create function to invoke auto-assign-trip Edge Function
CREATE OR REPLACE FUNCTION invoke_auto_assign_trip(trip_id UUID)
RETURNS void AS $$
DECLARE
  supabase_url TEXT;
  service_role_key TEXT;
BEGIN
  -- Get Supabase URL from environment (set in Supabase dashboard)
  supabase_url := current_setting('app.settings.supabase_url', true);
  
  -- For Edge Functions, we'll use HTTP requests
  -- Note: In production, use Supabase Edge Functions HTTP endpoint
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/auto-assign-trip',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object('trip_id', trip_id)
  );
END;
$$ LANGUAGE plpgsql;

-- Step 3: Create trigger function for new trip assignment
CREATE OR REPLACE FUNCTION trigger_auto_assign_on_trip_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- Only trigger for pending trips without a driver
  IF NEW.status = 'pending' AND NEW.driver_id IS NULL AND NEW.pickup_lat IS NOT NULL AND NEW.pickup_lng IS NOT NULL THEN
    -- Invoke Edge Function asynchronously
    PERFORM invoke_auto_assign_trip(NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 4: Create trigger for trip insert
DROP TRIGGER IF EXISTS trip_insert_auto_assign ON trips;
CREATE TRIGGER trip_insert_auto_assign
  AFTER INSERT ON trips
  FOR EACH ROW
  EXECUTE FUNCTION trigger_auto_assign_on_trip_insert();

-- Step 5: Create function to invoke send-push-notification Edge Function
CREATE OR REPLACE FUNCTION invoke_send_push_notification(trip_id UUID, driver_id UUID)
RETURNS void AS $$
DECLARE
  supabase_url TEXT;
BEGIN
  supabase_url := current_setting('app.settings.supabase_url', true);
  
  PERFORM net.http_post(
    url := supabase_url || '/functions/v1/send-push-notification',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    ),
    body := jsonb_build_object(
      'trip_id', trip_id,
      'driver_id', driver_id
    )
  );
END;
$$ LANGUAGE plpgsql;

-- Step 6: Create trigger function for driver assignment
CREATE OR REPLACE FUNCTION trigger_push_notification_on_assignment()
RETURNS TRIGGER AS $$
BEGIN
  -- Trigger when driver_id is assigned (was NULL, now has a value)
  IF NEW.driver_id IS NOT NULL AND (OLD.driver_id IS NULL OR OLD.driver_id != NEW.driver_id) THEN
    -- Invoke Edge Function asynchronously
    PERFORM invoke_send_push_notification(NEW.id, NEW.driver_id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 7: Create trigger for trip update (driver assignment)
DROP TRIGGER IF EXISTS trip_update_push_notification ON trips;
CREATE TRIGGER trip_update_push_notification
  AFTER UPDATE OF driver_id ON trips
  FOR EACH ROW
  WHEN (NEW.driver_id IS NOT NULL AND (OLD.driver_id IS NULL OR OLD.driver_id != NEW.driver_id))
  EXECUTE FUNCTION trigger_push_notification_on_assignment();

-- ============================================
-- Alternative Approach: Use Database Webhooks
-- ============================================
-- 
-- Instead of using pg_net, you can also use Supabase Database Webhooks
-- which are simpler and more reliable. Set them up in the Supabase Dashboard:
--
-- 1. Go to Database → Webhooks
-- 2. Create webhook for trips INSERT event
-- 3. Point to: https://[project-ref].supabase.co/functions/v1/auto-assign-trip
-- 4. Add Authorization header: Bearer [service_role_key]
--
-- For UPDATE events (driver assignment):
-- 1. Create webhook for trips UPDATE event (when driver_id changes)
-- 2. Point to: https://[project-ref].supabase.co/functions/v1/send-push-notification
-- 3. Add Authorization header: Bearer [service_role_key]
--
-- ============================================
--
-- Note: The pg_net approach above requires setting environment variables:
-- - app.settings.supabase_url
-- - app.settings.service_role_key
--
-- These can be set using:
-- ALTER DATABASE [database_name] SET app.settings.supabase_url = 'https://[project].supabase.co';
-- ALTER DATABASE [database_name] SET app.settings.service_role_key = '[service_role_key]';
--
-- However, for security reasons, Database Webhooks (configured in Dashboard)
-- are recommended over pg_net triggers.
--
-- ============================================





