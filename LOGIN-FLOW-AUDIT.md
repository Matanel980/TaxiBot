# Login Flow End-to-End Audit Report

## Executive Summary

**Issue**: Driver (+972509800301) receives "שגיאה בקישור הפרופיל" (Profile Link Error) during login, while Admin (+972526099607) logs in successfully.

**Root Cause**: The error occurs at line 261 in `app/login/page.tsx` when the `/api/auth/link-profile` API route fails. The API route attempts to migrate a profile from an old `id` to a new `auth.user.id`, but the operation can fail due to:
1. Missing `station_id` validation during profile migration
2. Potential RLS policy blocking during the migration process
3. Foreign key constraint issues (recently fixed)

**Critical Finding**: The profile is queried by `phone` in step 2 (line 223), but this query **does NOT filter by `station_id`**, creating an inconsistency with step 1 which requires `station_id`.

---

## 1. Auth Logic: Phone Verification & Profile Fetching

### Step 1: Phone Submission (`handlePhoneSubmit`)

**File**: `app/login/page.tsx` (lines 25-169)

**Flow**:
1. ✅ Normalizes phone to E.164 format (`+972XXXXXXXXX`)
2. ✅ Extracts phone digits for format-agnostic matching
3. ✅ **Fetches profiles WITH `station_id` filter**:
   ```typescript
   .select('id, role, full_name, station_id, phone')
   .not('station_id', 'is', null) // ⚠️ ONLY profiles with station_id
   ```
4. ✅ Matches profile by phone digits (client-side comparison)
5. ✅ **Validates `station_id` exists** (lines 79-85):
   ```typescript
   if (!profile.station_id) {
     setError('המשתמש לא משויך לתחנה...')
     return
   }
   ```
6. ✅ Sends OTP via `supabase.auth.signInWithOtp()`

**Status**: ✅ **Working correctly** - Enforces `station_id` requirement

---

### Step 2: OTP Verification (`handleOtpSubmit`)

**File**: `app/login/page.tsx` (lines 171-315)

**Flow**:
1. ✅ Verifies OTP via `supabase.auth.verifyOtp()`
2. ✅ Waits 500ms for session propagation
3. ⚠️ **Fetches profile by phone WITHOUT `station_id` filter** (lines 223-227):
   ```typescript
   const { data: profile, error: profileError } = await supabase
     .from('profiles')
     .select('id, role, full_name, vehicle_number, car_type')
     .eq('phone', phone)  // ⚠️ NO station_id filter!
     .single()
   ```
4. ✅ Checks if `profile.id !== user.id` (line 239)
5. ⚠️ **If mismatch, calls `/api/auth/link-profile`** (lines 245-264)
6. ✅ Verifies profile exists by `user.id` (lines 271-282)

**Critical Issues**:
- ❌ **Profile query at line 223 doesn't include `station_id` in SELECT or WHERE**
- ❌ **No `station_id` validation after profile link**
- ⚠️ If linking fails, error message is "שגיאה בקישור הפרופיל" (line 261)

---

## 2. Tenant Verification: `station_id` Retrieval During Login

### Phone Step (Step 1)
- ✅ **Fetches profiles with `station_id`**: Line 53 includes `station_id` in SELECT
- ✅ **Filters out profiles without `station_id`**: Line 54 `.not('station_id', 'is', null)`
- ✅ **Validates `station_id` exists**: Lines 79-85 check and reject if null

### OTP Step (Step 2)
- ❌ **Profile query excludes `station_id`**: Line 225 SELECT doesn't include `station_id`
- ❌ **No `station_id` validation after OTP verification**
- ⚠️ **Profile link API preserves `station_id`**: Line 92 in `link-profile/route.ts` copies `station_id` from old profile

### After Redirect (Middleware)
- ✅ **Middleware fetches profile with `station_id`**: Line 196 in `middleware.ts` includes `station_id`
- ⚠️ **Warns but doesn't block if `station_id` is null**: Lines 274-276 allow null during transition

---

## 3. Error Handling: "שגיאה בקישור הפרופיל"

### Error Location
**File**: `app/login/page.tsx`  
**Line**: 261  
**Function**: `handleOtpSubmit`

### Trigger Condition
```typescript
if (!linkResponse.ok || !linkResult.success) {
  console.error('[ERROR] Failed to link profile to auth user:', linkResult.error)
  setError('שגיאה בקישור הפרופיל. אנא פנה למנהל התחנה.')  // ← ERROR HERE
  setLoading(false)
  return
}
```

### When It Triggers
1. HTTP error: `linkResponse.ok === false` (non-2xx status)
2. API returns `success: false`: `linkResult.success === false`

### Possible API Route Failures
**File**: `app/api/auth/link-profile/route.ts`

**Failure Points**:
1. **Line 29**: Profile not found with old ID (404)
2. **Line 59**: Failed to update trips references (500)
3. **Line 76**: Failed to delete old profile (500) - **Foreign key constraint violations**
4. **Line 115**: Failed to create new profile (500) - **Insert constraint violations**

### Root Cause Analysis

The API route can fail if:
- ❌ Old profile doesn't exist
- ❌ Foreign key constraints block deletion (recently fixed for `trips`)
- ❌ **Missing `station_id` causes insert to fail** (if there's a NOT NULL constraint)
- ❌ Unique constraint on `phone` if phone format differs
- ❌ RLS policy blocks admin client operations

---

## 4. Role Logic: Admin vs Driver Differences

### Phone Step (Step 1)
- ✅ **Same logic for both roles**: Both admin and driver must have `station_id`
- ✅ **Same whitelist check**: Both roles require profile to exist with `station_id`

### OTP Step (Step 2)
- ✅ **Same linking logic**: Both roles go through same profile linking process
- ✅ **Same verification**: Both roles verify profile by `user.id` after linking
- ✅ **Different redirects**: Admin → `/admin/dashboard`, Driver → `/driver/dashboard` or `/onboarding`

### Middleware
- ✅ **Same profile fetch**: Both roles fetch profile with `station_id`
- ⚠️ **Role-based route protection**: Admin paths require `role === 'admin'` (line 279)
- ⚠️ **Driver onboarding check**: Drivers must have `vehicle_number` and `car_type` (line 289)

### Key Finding
**No role-specific difference in tenant/station verification during login**. Both admin and driver follow the same `station_id` validation in step 1, but step 2 doesn't validate `station_id` after linking.

---

## 5. Root Cause & Recommendations

### Root Cause

The "שגיאה בקישור הפרופיל" error occurs when `/api/auth/link-profile` fails. The most likely causes are:

1. **Missing `station_id` preservation**: If the old profile's `station_id` is null or missing during migration, the new profile insert might fail (if NOT NULL constraint exists)

2. **RLS policy blocking**: The admin client should bypass RLS, but if there are issues with `SECURITY DEFINER` functions, RLS might still block

3. **Foreign key constraint violations**: Already fixed for `trips`, but other tables might reference `profiles.id`

4. **Query inconsistency**: Step 1 requires `station_id`, but step 2 queries without `station_id`, potentially finding a different profile

### Recommendations

#### Immediate Fixes

1. **Include `station_id` in OTP step profile query** (Line 225):
   ```typescript
   .select('id, role, full_name, vehicle_number, car_type, station_id')  // Add station_id
   ```

2. **Validate `station_id` after profile link** (After line 282):
   ```typescript
   if (!verifiedProfile.station_id) {
     setError('המשתמש לא משויך לתחנה. אנא פנה למנהל התחנה.')
     setLoading(false)
     return
   }
   ```

3. **Add error logging in API route** to capture exact failure reason:
   ```typescript
   console.error('[Link Profile] Full error details:', {
     error,
     oldProfileId,
     newUserId,
     oldProfile,
     phone
   })
   ```

#### Long-term Improvements

1. **Consistent `station_id` filtering**: Use `station_id` in all profile queries during login
2. **Better error messages**: Return specific error codes from API route for different failure scenarios
3. **Transaction support**: Wrap profile migration in a database transaction to ensure atomicity
4. **Prevent ID mismatches**: Ensure profiles are created with `id = auth.user.id` from the start

---

## 6. Verification Checklist for Manual Driver Creation

When an admin manually adds a driver, ensure:

- ✅ Profile has `station_id` matching admin's `station_id`
- ✅ Profile `id` matches `auth.users.id` (if auth user already exists)
- ✅ Profile `phone` matches auth user's phone in exact format
- ✅ Profile `role` is set to `'driver'`
- ✅ No foreign key constraints reference the profile's old `id` if migrating

---

## 7. Testing Scenarios

### Scenario 1: Admin Login (✅ Working)
- Phone: `+972526099607`
- Expected: Should have profile with `station_id` and `role='admin'`
- Result: ✅ Login succeeds

### Scenario 2: Driver Login (❌ Failing)
- Phone: `+972509800301`
- Expected: Should have profile with `station_id` and `role='driver'`
- Current Issue: Profile linking fails with "שגיאה בקישור הפרופיל"
- **Action Required**: Check browser console and server logs for exact API error

### Scenario 3: Driver Without station_id (Should Fail)
- Phone: `+972XXXXXXXXX` (driver without `station_id`)
- Expected: Should fail at step 1 with "המשתמש לא משויך לתחנה"
- Result: ✅ Correctly rejected at phone step

---

## Conclusion

The login flow has **two critical inconsistencies**:

1. **Step 1 enforces `station_id`, but Step 2 doesn't validate it**
2. **Profile query in Step 2 excludes `station_id` from SELECT**

The error "שגיאה בקישור הפרופיל" is a symptom of the profile linking API failing. To diagnose further, check:
- Browser console for the exact API error response
- Server logs in `/api/auth/link-profile` for the failure point
- Database to verify driver profile has `station_id` before login

**Recommended immediate action**: Add `station_id` to the profile query in step 2 and validate it after linking to ensure consistency with step 1.

