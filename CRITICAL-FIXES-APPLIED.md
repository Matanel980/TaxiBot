# Critical Fixes Applied - Session Persistence & RLS Recursion

## 🔴 Issues Fixed

### 1. **Cookie Persistence & Project Mismatch**
- **Problem**: Cookies from multiple Supabase projects were conflicting
- **Problem**: Cookies weren't being set with `path: '/'` causing session loss
- **Fix**: 
  - Added cookie filtering to only keep cookies from current project
  - Explicitly set `path: '/'` on all cookies
  - Proper cookie propagation in redirects

### 2. **RLS Infinite Recursion (42P17)**
- **Problem**: Policies calling functions that query profiles caused recursion
- **Fix**: 
  - Primary policy uses ONLY `auth.uid() = id` (no function calls)
  - Admin policies use JWT metadata instead of table queries
  - Helper functions kept for app code but NOT used in policies

### 3. **Session Initialization**
- **Problem**: `getSession()` was unreliable
- **Fix**: Using `getUser()` exclusively for authentication

---

## 📋 Files Modified

### 1. `middleware.ts` - Complete Overhaul

**Key Changes:**
- ✅ Cookie filtering by project ID
- ✅ Explicit `path: '/'` on all cookies
- ✅ Proper cookie propagation in redirects
- ✅ Using `getUser()` instead of `getSession()`
- ✅ Graceful handling of `station_id` null values

**Cookie Filtering Logic:**
```typescript
// Extracts project ID from Supabase URL
const supabaseProjectId = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1]

// Filters cookies to only keep current project's cookies
const filteredCookies = allCookies.filter(cookie => {
  const projectIdMatch = cookie.name.match(/sb-([^-]+)-/)
  return projectIdMatch?.[1] === supabaseProjectId
})
```

**Cookie Setting:**
```typescript
response.cookies.set(name, value, {
  path: '/', // CRITICAL: Explicit path
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
})
```

### 2. `supabase-fix-rls-recursion-final.sql` - New SQL Script

**Key Features:**
- ✅ Drops ALL existing policies
- ✅ Creates simple `auth.uid() = id` policy (NO recursion)
- ✅ Admin policies use JWT metadata (NO table queries)
- ✅ Trigger to sync role/station_id to JWT metadata
- ✅ Backfills JWT metadata for existing users

**Primary Policy (NO Recursion):**
```sql
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id); -- ONLY direct check, NO functions
```

**Admin Policy (Uses JWT, NO Recursion):**
```sql
CREATE POLICY "profiles_select_station_admin"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
    -- NO table query, NO recursion
  );
```

---

## 🚀 Deployment Steps

### Step 1: Run SQL Migration

1. Open Supabase Dashboard → SQL Editor
2. Copy and paste entire contents of `supabase-fix-rls-recursion-final.sql`
3. Click "Run"
4. Verify no errors appear

**What it does:**
- Drops all existing policies
- Creates non-recursive policies
- Syncs role/station_id to JWT metadata
- Backfills existing users

### Step 2: Verify JWT Metadata

After running SQL, verify users have role in JWT:

```sql
SELECT 
  id,
  email,
  raw_user_meta_data->>'role' as jwt_role,
  raw_user_meta_data->>'station_id' as jwt_station_id
FROM auth.users
WHERE raw_user_meta_data->>'role' IS NOT NULL;
```

### Step 3: Test Login Flow

1. Clear browser cookies (or use Incognito)
2. Navigate to `/login`
3. Enter phone number
4. Complete OTP verification
5. Check terminal logs for:
   - `[Middleware Debug] Profile fetched: ...`
   - No `42P17` errors
   - Cookies being set with `path: '/'`

### Step 4: Verify Cookie Persistence

1. After login, check browser DevTools → Application → Cookies
2. Verify cookies have:
   - `Path: /`
   - `SameSite: Lax`
   - `Secure: true` (in production)
3. Refresh page - should stay logged in

---

## 🔍 Debugging

### Check Cookie Filtering

Look for this in terminal logs:
```
[Middleware] Filtered X cookies from other projects
```

### Check Profile Fetch

Look for this in terminal logs:
```
[Middleware Debug] Profile fetched: {
  id: '...',
  role: 'admin',
  station_id: '...',
  ...
}
```

### Check RLS Errors

If you still see `42P17`:
1. Verify SQL migration ran successfully
2. Check policies exist:
   ```sql
   SELECT policyname, cmd, qual
   FROM pg_policies
   WHERE tablename = 'profiles';
   ```
3. Verify JWT metadata is set:
   ```sql
   SELECT raw_user_meta_data FROM auth.users WHERE id = auth.uid();
   ```

---

## ✅ Verification Checklist

After applying fixes:

- [ ] SQL migration executed without errors
- [ ] JWT metadata synced for existing users
- [ ] Cookies are set with `path: '/'` in browser
- [ ] No `42P17` errors in terminal logs
- [ ] Profile fetch succeeds in middleware
- [ ] Login flow works without redirect loop
- [ ] Session persists across page refreshes
- [ ] Cookies filtered correctly (only current project)

---

## 🎯 Expected Behavior

### Before Fix:
- ❌ Redirect loop to `/login`
- ❌ Cookies not persisting
- ❌ `42P17` recursion errors
- ❌ Multiple project cookies conflicting

### After Fix:
- ✅ Login works smoothly
- ✅ Cookies persist with `path: '/'`
- ✅ No recursion errors
- ✅ Only current project cookies used
- ✅ Session persists across refreshes

---

## 📝 Notes

### Station Isolation
- `station_id` can be `NULL` during transition (warned but not blocked)
- Admin policies use JWT metadata for station matching
- Helper functions (`get_user_station_id()`, `is_user_admin()`) exist for app code but NOT used in RLS policies

### Cookie Security
- Cookies set with `sameSite: 'lax'` for cross-site compatibility
- `secure: true` in production (HTTPS only)
- `httpOnly` preserved if set by Supabase

---

**Ready to test!** Run the SQL migration and test the login flow. 🚀
