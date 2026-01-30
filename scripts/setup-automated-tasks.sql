-- ============================================
-- Automated Tasks Setup (Optional)
-- Run this in Supabase SQL Editor
-- ============================================
-- 
-- This script sets up automated tasks using pg_cron extension
-- for database maintenance and cleanup operations.
--
-- NOTE: pg_cron may not be available on all Supabase plans.
-- Check your plan's features before running this script.
-- ============================================

-- ============================================
-- 1. Enable pg_cron Extension
-- ============================================

-- Check if pg_cron is available
DO $$
BEGIN
  -- Try to enable pg_cron
  CREATE EXTENSION IF NOT EXISTS pg_cron;
  
  RAISE NOTICE 'pg_cron extension enabled successfully';
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'pg_cron extension not available: %', SQLERRM;
  RAISE WARNING 'Skipping automated tasks setup. Consider using Vercel Cron Jobs instead.';
END $$;

-- ============================================
-- 2. Clean Up Old Completed Trips
-- ============================================
-- Runs daily at 2 AM UTC
-- Removes completed trips older than 90 days

DO $$
BEGIN
  -- Check if pg_cron is available
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule if already exists
    PERFORM cron.unschedule('cleanup-old-trips');
    
    -- Schedule cleanup job
    PERFORM cron.schedule(
      'cleanup-old-trips',
      '0 2 * * *', -- Daily at 2 AM UTC
      $$
      DELETE FROM trips
      WHERE status = 'completed'
        AND updated_at < NOW() - INTERVAL '90 days';
      $$
    );
    
    RAISE NOTICE 'Scheduled: cleanup-old-trips (daily at 2 AM UTC)';
  END IF;
END $$;

-- ============================================
-- 3. Clean Up Expired Push Tokens
-- ============================================
-- Runs weekly on Sunday at 3 AM UTC
-- Marks expired push tokens as inactive

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Unschedule if already exists
    PERFORM cron.unschedule('cleanup-expired-tokens');
    
    -- Schedule cleanup job
    PERFORM cron.schedule(
      'cleanup-expired-tokens',
      '0 3 * * 0', -- Weekly on Sunday at 3 AM UTC
      $$
      UPDATE push_tokens
      SET is_active = false
      WHERE expires_at < NOW()
        AND is_active = true;
      $$
    );
    
    RAISE NOTICE 'Scheduled: cleanup-expired-tokens (weekly on Sunday at 3 AM UTC)';
  END IF;
END $$;

-- ============================================
-- 4. Verify Scheduled Jobs
-- ============================================

-- View all scheduled jobs
SELECT 
  jobid,
  schedule,
  command,
  nodename,
  nodeport,
  database,
  username,
  active
FROM cron.job
ORDER BY jobid;

-- ============================================
-- 5. Manual Cleanup (If pg_cron Not Available)
-- ============================================
-- 
-- If pg_cron is not available, you can:
-- 1. Use Vercel Cron Jobs (see vercel.json example)
-- 2. Create API routes and call them via cron
-- 3. Use external cron service (cron-job.org, etc.)
--
-- Example Vercel Cron Job:
-- Create app/api/cron/cleanup-old-trips/route.ts
-- Then add to vercel.json:
-- {
--   "crons": [{
--     "path": "/api/cron/cleanup-old-trips",
--     "schedule": "0 2 * * *"
--   }]
-- }
-- ============================================

-- ============================================
-- Notes:
-- ============================================
-- 
-- 1. pg_cron may not be available on Supabase Free tier
-- 2. Check your Supabase plan's features
-- 3. Alternative: Use Vercel Cron Jobs (see above)
-- 4. Alternative: Use external cron service
-- 5. All cleanup operations are safe to run manually
--
-- To manually run cleanup:
-- DELETE FROM trips WHERE status = 'completed' AND updated_at < NOW() - INTERVAL '90 days';
-- UPDATE push_tokens SET is_active = false WHERE expires_at < NOW() AND is_active = true;
--
-- ============================================
