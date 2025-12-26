# Location Sync Diagnostic Report

## Issue
Drivers are not appearing live on the Admin Map despite Realtime being enabled for `profiles`, `trips`, and `zones_postgis` tables.

## Investigation Findings

### ✅ 1. Realtime Subscription Setup
**Status:** CORRECTLY CONFIGURED
- Location: `app/admin/dashboard/page.tsx` lines 270-360
- Subscription channel: `admin-dashboard-drivers`
- Table: `profiles`
- Event: `UPDATE`
- Filter: `role=eq.driver`
- **Issue Found:** The filter `'role=eq.driver'` is a string filter, but Realtime subscriptions may require the filter to match the actual column value. This could prevent UPDATE events from being received.

### ⚠️ 2. RLS Policy for Admin Viewing Drivers
**Status:** POTENTIAL ISSUE
- Location: `supabase-migration.sql` lines 123-130
- Policy: `"Admins can view all profiles"`
- Logic: Uses subquery `EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')`
- **Potential Issue:** This subquery might cause performance issues or fail if the admin's own profile is not properly loaded. Also, Realtime subscriptions respect RLS policies, so if the admin can't SELECT the driver's row, they won't receive UPDATE events.

### ⚠️ 3. Driver Location Update Flow
**Status:** CORRECTLY IMPLEMENTED
- Location: `lib/hooks/useGeolocation.ts` lines 99-109
- Updates: `latitude`, `longitude`, `heading`, `current_address`
- **Verification Needed:** Check if updates are actually reaching the database (check browser console for `[Geolocation] ✅` logs)

### ⚠️ 4. Admin Dashboard State Update
**Status:** CORRECTLY IMPLEMENTED
- Location: `app/admin/dashboard/page.tsx` lines 344-359
- Logic: Updates `drivers` array when UPDATE event received
- **Potential Issue:** The subscription might not be receiving events due to:
  1. RLS policy blocking the subscription
  2. Filter not matching correctly
  3. Realtime publication not including all columns

### ⚠️ 5. AdminLiveMapClient Marker Rendering
**Status:** CORRECTLY IMPLEMENTED
- Location: `components/admin/AdminLiveMapClient.tsx` lines 574-595
- Logic: Renders markers for `drivers` prop when `is_online` and has coordinates
- **DriverMarker Component:** Uses `useEffect` with `driver.latitude, driver.longitude` dependencies (lines 82-125)
- **Potential Issue:** If `drivers` prop is not updating, markers won't re-render

### ⚠️ 6. Realtime Publication Column Selection
**Status:** NEEDS VERIFICATION
- From screenshot: `profiles` table shows `attnames: {id, phone, role, full_name, current_zone, is_online, latitude, longitude, u...}`
- **Critical:** The `attnames` (attribute names) in the publication determine which columns are replicated. If `latitude` and `longitude` are truncated (shown as `u...`), they might not be fully included.
- **Action Required:** Verify that `latitude`, `longitude`, `heading`, and `updated_at` are all in the publication's `attnames`.

## Root Cause Analysis

### Most Likely Issues (Priority Order):

1. **RLS Policy Blocking Realtime Subscription** (HIGH PRIORITY)
   - The admin RLS policy uses a subquery that might fail or be slow
   - Realtime subscriptions respect RLS - if admin can't SELECT, they can't receive UPDATE events
   - **Test:** Try querying `SELECT * FROM profiles WHERE role = 'driver'` as admin in Supabase SQL Editor

2. **Realtime Publication Column Selection** (HIGH PRIORITY)
   - The `attnames` in the publication might not include all location columns
   - If `latitude`/`longitude` are not in the publication, UPDATE events won't include them
   - **Test:** Check the full `attnames` array in `pg_publication_tables`

3. **Subscription Filter Issue** (MEDIUM PRIORITY)
   - The filter `'role=eq.driver'` might not work correctly with Realtime
   - Realtime filters might need to be applied differently
   - **Test:** Try removing the filter temporarily to see if events are received

4. **Driver Updates Not Reaching Database** (MEDIUM PRIORITY)
   - Check browser console on driver side for `[Geolocation] ✅` logs
   - If no logs, location updates aren't being sent
   - If error logs, RLS policy is blocking UPDATE

## Diagnostic Steps

### Step 1: Verify Realtime Publication Columns
Run in Supabase SQL Editor:
```sql
SELECT 
  tablename,
  attnames
FROM pg_publication_tables
WHERE pubname = 'supabase_realtime'
  AND tablename = 'profiles';
```

**Expected:** `attnames` should include: `{id, phone, role, full_name, vehicle_number, car_type, current_zone, is_online, latitude, longitude, current_address, heading, updated_at}`

**If missing columns:** The publication needs to be recreated or columns need to be added.

### Step 2: Test RLS Policy
Run as Admin user in Supabase SQL Editor:
```sql
-- This should return all drivers
SELECT id, full_name, latitude, longitude, is_online 
FROM profiles 
WHERE role = 'driver';
```

**If this fails:** The RLS policy is blocking admin access, which will also block Realtime subscriptions.

### Step 3: Check Driver Update Logs
On Driver Dashboard:
- Open browser console
- Go online (enable location tracking)
- Look for: `[Geolocation] ✅ Location updated successfully`
- If you see errors, check for RLS policy violations

### Step 4: Check Admin Subscription Logs
On Admin Dashboard:
- Open browser console
- Look for: `[Realtime] ✅ Received UPDATE event for driver:`
- If no logs appear, the subscription is not receiving events

### Step 5: Test Realtime Connection
In browser console on Admin Dashboard:
```javascript
// Check subscription status
const channel = supabase.channel('admin-dashboard-drivers')
channel.subscribe((status) => {
  console.log('Subscription status:', status)
})
```

**Expected:** Status should be `SUBSCRIBED`

## Recommended Fixes (Without Code Changes Yet)

### Fix 1: Verify Realtime Publication Includes All Columns
If `attnames` is truncated or missing columns:
```sql
-- Drop and recreate publication with all columns
ALTER PUBLICATION supabase_realtime DROP TABLE profiles;
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;
```

### Fix 2: Simplify RLS Policy
The current admin policy uses a subquery. Consider testing with a simpler policy:
```sql
-- Test policy (temporary)
CREATE POLICY "Admins can view all profiles - TEST"
  ON profiles FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );
```

### Fix 3: Remove Subscription Filter Temporarily
To test if filter is the issue, temporarily remove the filter in the subscription:
```typescript
// In app/admin/dashboard/page.tsx line 278
// Change from:
filter: 'role=eq.driver'
// To:
// filter: undefined (remove filter line)
```

## Next Steps

1. **Run Diagnostic Steps 1-5** to identify the exact issue
2. **Check Browser Console** on both driver and admin sides
3. **Verify Realtime Publication** includes all location columns
4. **Test RLS Policy** with direct SQL query
5. **Report findings** before applying code fixes

## Files to Check

1. `app/admin/dashboard/page.tsx` - Subscription setup (lines 270-360)
2. `lib/hooks/useGeolocation.ts` - Driver location updates (lines 99-109)
3. `components/admin/AdminLiveMapClient.tsx` - Marker rendering (lines 574-595)
4. `supabase-migration.sql` - RLS policies (lines 123-130)

