# Geolocation Sync Fix - Driver Location Broadcasting

## Issues Fixed

### 1. ✅ Enhanced Geolocation Error Handling
**File**: `lib/hooks/useGeolocation.ts`

**Changes**:
- Added detailed error messages for each geolocation error code
- Added user-friendly warnings for permission denied, position unavailable, and timeout
- Error handler now logs full context including `driverId` and `enabled` state
- Errors are logged but don't crash the app (graceful degradation)

**Error Codes Handled**:
- `1`: PERMISSION_DENIED - User needs to enable location in browser settings
- `2`: POSITION_UNAVAILABLE - GPS might be temporarily unavailable
- `3`: TIMEOUT - GPS request timed out (network/GPS issue)

### 2. ✅ Profile ID Verification
**File**: `lib/hooks/useGeolocation.ts` (line 110)

**Verification**:
- `writeLocationToDatabase` uses `driverId` which should be the migrated UUID
- Added validation check: `if (!driverId)` before attempting write
- Changed from `.upsert()` to `.update()` since profile must exist after migration
- Logs the exact `driverId` UUID being used in error messages

**How it works**:
- `driverId` comes from `profile?.id` in `app/driver/dashboard/page.tsx` (line 102)
- `profile.id` is fetched using `user.id` (line 157), which is the migrated UUID
- ✅ **Correct UUID is being used**

### 3. ✅ Station Manager Realtime Subscription
**File**: `app/admin/dashboard/page.tsx` (lines 302-323)

**Changes**:
- Enhanced subscription logging with detailed event information
- Added subscription status callbacks (SUBSCRIBED, CHANNEL_ERROR, TIMED_OUT)
- Improved filtering logic to handle location updates correctly
- Added debug logging for filtered-out updates

**How it works**:
1. Subscribes to ALL driver profile updates (`role=eq.driver`)
2. Filters by `station_id` in the callback (can't filter by station_id in subscription filter)
3. Processes INSERT, UPDATE, DELETE events
4. Refetches driver data when location updates are detected

**Subscription Filter**:
```typescript
filter: `role=eq.driver` // All drivers
// Then filters by station_id in callback
```

**Callback Logic**:
- Checks if `newStationId === stationId` (for INSERT/UPDATE)
- Checks if `oldStationId === stationId` (for DELETE/UPDATE that changed station)
- Logs location updates with coordinates for debugging

### 4. ✅ RLS Policy Verification
**File**: `supabase-fix-rls-recursion-final.sql` (lines 103-107)

**Policy**: `profiles_update_own`
```sql
CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
```

**Status**: ✅ **Policy allows updates to all columns including latitude, longitude, current_address, heading**

**Verification**:
- Policy uses `auth.uid() = id` which matches the migrated UUID
- No column restrictions - allows updating any column
- Should work correctly with migrated profile IDs

### 5. ✅ Driver ID Format Verification
**File**: `app/admin/dashboard/page.tsx` (lines 147-156)

**Added**:
- UUID format validation for driver IDs
- Warning log if driver ID is not UUID format (indicates migration issue)
- Enhanced logging shows driver IDs in sample output

## Debugging Checklist

### If Driver Location Not Updating:

1. **Check Browser Console**:
   - Look for `[useGeolocation] Location written to database successfully` messages
   - Check for `[useGeolocation] Error updating location` with full error details
   - Verify `driverId` in logs is a UUID (not phone number)

2. **Check Geolocation Permission**:
   - Browser should prompt for location permission
   - Check browser settings if permission was denied
   - Error code `1` indicates permission denied

3. **Check Realtime Subscription**:
   - Look for `[Admin Dashboard] Driver change detected` logs
   - Verify subscription status is `SUBSCRIBED`
   - Check if updates are being filtered out (different station_id)

4. **Verify Profile ID**:
   - Check `[Admin Dashboard] ✅ Initial drivers loaded` log
   - Verify driver IDs are UUIDs (not phone numbers)
   - Check if any drivers show migration warnings

5. **Check RLS Policy**:
   - Run `verify-geolocation-rls.sql` in Supabase SQL Editor
   - Verify `profiles_update_own` policy exists
   - Check if RLS is enabled on profiles table

## Testing Steps

1. **Driver Side**:
   - Log in as driver
   - Enable location permission in browser
   - Go online (toggle switch)
   - Check console for location update logs
   - Verify location is being written to database

2. **Manager Side**:
   - Log in as station manager
   - Open admin dashboard
   - Check console for subscription status
   - Verify driver appears on map with location
   - Check console for realtime update logs when driver moves

## Expected Console Output

### Driver Console:
```
[useGeolocation] Location written to database successfully: {
  driverId: "528acd55-a227-45e4-ad41-6259f1546913",
  latitude: 32.9297,
  longitude: 35.0695,
  timestamp: "2025-01-XX..."
}
```

### Manager Console:
```
[Admin Dashboard] Drivers subscription status: SUBSCRIBED
✅ Successfully subscribed to driver location updates
[Admin Dashboard] Driver change detected: {
  eventType: "UPDATE",
  driverId: "528acd55-a227-45e4-ad41-6259f1546913",
  stationId: "d42b3b24-ae63-4778-88c7-1f6cc16a884f",
  hasLocation: true,
  latitude: 32.9297,
  longitude: 35.0695
}
```

## Common Issues & Solutions

### Issue: "Profile not found" error
**Solution**: Profile migration may have failed. Check `/api/auth/link-profile` logs.

### Issue: "RLS policy violation" error
**Solution**: Verify `profiles_update_own` policy exists and uses `auth.uid() = id`.

### Issue: Manager doesn't see driver location
**Solution**: 
1. Check subscription status (should be SUBSCRIBED)
2. Verify driver's `station_id` matches manager's `station_id`
3. Check if driver has valid latitude/longitude in database

### Issue: Geolocation permission denied
**Solution**: User must enable location permission in browser settings. Error code `1` indicates this.

