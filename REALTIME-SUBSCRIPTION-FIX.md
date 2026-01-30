# Realtime Subscription Error Fix Guide

## Error Message
```
❌ Error subscribing to driver updates. Check Supabase Realtime publications.
```

## Root Cause
The `profiles` table is not enabled in the Supabase Realtime publication, which prevents real-time subscriptions from working.

## Quick Fix

### Step 1: Run Diagnostic Script
1. Open **Supabase Dashboard** → **SQL Editor**
2. Run the diagnostic script: `scripts/verify-realtime-setup.sql`
3. Check the results to see what's missing

### Step 2: Enable Realtime for Required Tables
Run this SQL in Supabase SQL Editor:

```sql
-- Enable profiles table (CRITICAL for driver location updates)
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;

-- Enable trips table (for trip status updates)
ALTER PUBLICATION supabase_realtime ADD TABLE trips;

-- Enable zones_postgis table (for zone updates)
ALTER PUBLICATION supabase_realtime ADD TABLE zones_postgis;

-- Set REPLICA IDENTITY FULL (required for full row updates)
ALTER TABLE profiles REPLICA IDENTITY FULL;
ALTER TABLE trips REPLICA IDENTITY FULL;
ALTER TABLE zones_postgis REPLICA IDENTITY FULL;
```

### Step 3: Verify Setup
Run this query to verify:

```sql
SELECT 
  tablename,
  CASE 
    WHEN tablename IN ('profiles', 'trips', 'zones_postgis') THEN '✅ Enabled'
    ELSE 'Optional'
  END as status
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename IN ('profiles', 'trips', 'zones_postgis');
```

**Expected Result:** All three tables should show `✅ Enabled`

### Step 4: Refresh Admin Dashboard
1. Hard refresh the admin dashboard (Ctrl+Shift+R or Cmd+Shift+R)
2. Check browser console - should see: `✅ Successfully subscribed to driver location updates`

## Alternative: Use Automated Script

Run the complete setup script:
```sql
-- Run: scripts/enable-all-realtime-tables.sql
```

This script:
- ✅ Checks if tables are already enabled (idempotent)
- ✅ Enables all required tables
- ✅ Verifies the setup
- ✅ Provides status summary

## Common Issues

### Issue 1: "Table already exists" error
**Solution:** The script is idempotent - it checks before adding. This is normal.

### Issue 2: RLS Policy blocking
**Solution:** Ensure admin RLS policy allows SELECT on profiles:
```sql
-- Check admin SELECT policy
SELECT policyname, cmd, qual 
FROM pg_policies 
WHERE tablename = 'profiles' AND cmd = 'SELECT';
```

### Issue 3: REPLICA IDENTITY not FULL
**Solution:** Run:
```sql
ALTER TABLE profiles REPLICA IDENTITY FULL;
```

## Verification Checklist

- [ ] `profiles` table in `supabase_realtime` publication
- [ ] `trips` table in `supabase_realtime` publication  
- [ ] `zones_postgis` table in `supabase_realtime` publication
- [ ] `profiles` table has `REPLICA IDENTITY FULL`
- [ ] Admin RLS policy allows SELECT on `profiles`
- [ ] Browser console shows `✅ Successfully subscribed`

## After Fix

Once fixed, you should see:
- ✅ Real-time driver location updates on admin map
- ✅ Instant driver status changes (online/offline)
- ✅ Real-time trip status updates
- ✅ Zone updates when admin creates/edits zones

---

**Quick Reference:**
- Diagnostic Script: `scripts/verify-realtime-setup.sql`
- Fix Script: `scripts/enable-all-realtime-tables.sql`
- Supabase Dashboard: Database → Replication → Check tables
