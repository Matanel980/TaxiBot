# Deployment Checklist - Auth & RLS Fixes

## ✅ Status: All Fixes Already Applied

Both `middleware.ts` and `supabase-fix-rls-recursion-final.sql` have been updated with all required fixes.

---

## 📋 Step-by-Step Deployment

### Step 1: Verify Environment Variables

Ensure `.env.local` has the correct Supabase project:

```bash
# Check your .env.local file
NEXT_PUBLIC_SUPABASE_URL=https://zfzahgxrmlwotdzpjvhz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
```

**Important**: The URL should match project ID `zfzahgxrmlwotdzpjvhz` (not `gefrfir...`)

### Step 2: Run SQL Migration

1. Open **Supabase Dashboard** → **SQL Editor**
2. Copy entire contents of `supabase-fix-rls-recursion-final.sql`
3. Click **"Run"**
4. Verify success messages:
   - ✅ RLS Policies recreated successfully
   - ✅ Policy "profiles_select_own" uses ONLY auth.uid() = id (NO recursion)
   - ✅ JWT metadata synced for existing users

### Step 3: Verify JWT Metadata

Run this query in Supabase SQL Editor:

```sql
-- Check if users have role in JWT metadata
SELECT 
  id,
  email,
  raw_user_meta_data->>'role' as jwt_role,
  raw_user_meta_data->>'station_id' as jwt_station_id
FROM auth.users
WHERE id IN (
  '7a1c065d-fe67-4551-be0e-9b2b7aa3dba8', -- Main Admin
  'f0c8bfa8-cd06-4506-9acd-5ed617cf3070'  -- Admin Test User
);
```

**Expected**: Both users should have `jwt_role = 'admin'` and `jwt_station_id` set.

### Step 4: Clear Browser State

**Before testing:**
1. Clear all browser cookies for `localhost:3000`
2. Or use **Incognito/Private mode**
3. Close all browser tabs with the app

### Step 5: Test Login Flow

1. Navigate to `http://localhost:3000/login`
2. Enter phone number (e.g., `0526099607` or `+972526099607`)
3. Complete OTP verification
4. **Check terminal logs** for:
   ```
   [Middleware] Filtered X cookies from other projects
   [Middleware Debug] Profile fetched: { id: '...', role: 'admin', ... }
   ```
5. **Check browser DevTools** → **Application** → **Cookies**:
   - Cookies should have `Path: /`
   - Cookies should have `SameSite: Lax`
   - Should see `sb-zfzahgxrmlwotdzpjvhz-auth-token` (NOT `sb-gefrfir...`)

### Step 6: Verify Session Persistence

1. After successful login, **refresh the page** (F5)
2. Should **NOT** redirect to `/login`
3. Should stay on dashboard
4. Check terminal - should see:
   ```
   [Middleware] Path: /admin/dashboard | User ID: 7a1c065d-... | Phone: +972509800301
   [Middleware Debug] Profile fetched: ...
   ```

---

## 🔍 Troubleshooting

### Issue: Still seeing `42P17` errors

**Solution:**
1. Verify SQL migration ran successfully:
   ```sql
   SELECT policyname, cmd, qual
   FROM pg_policies
   WHERE tablename = 'profiles';
   ```
   Should see `profiles_select_own` with `USING (auth.uid() = id)`

2. Verify JWT metadata is set:
   ```sql
   SELECT raw_user_meta_data FROM auth.users WHERE id = auth.uid();
   ```

### Issue: Cookies not persisting

**Check:**
1. Browser DevTools → Application → Cookies
2. Verify cookies have `Path: /`
3. Check terminal for: `[Middleware] Filtered X cookies from other projects`
4. Verify `NEXT_PUBLIC_SUPABASE_URL` matches current project

### Issue: Redirect loop

**Check:**
1. Terminal logs for `[Middleware Debug] Profile fetched:`
2. If profile fetch fails, check RLS policies
3. Verify user has `station_id` assigned (warned but not blocked)

### Issue: Multiple project cookies

**Solution:**
- Middleware now filters cookies automatically
- Look for: `[Middleware] Filtered X cookies from other projects`
- Only cookies from current project (`zfzahgxrmlwotdzpjvhz`) are kept

---

## ✅ Verification Checklist

After deployment:

- [ ] SQL migration executed without errors
- [ ] JWT metadata synced for all users
- [ ] Cookies have `Path: /` in browser
- [ ] No `42P17` errors in terminal logs
- [ ] Profile fetch succeeds (`[Middleware Debug] Profile fetched:`)
- [ ] Login works without redirect loop
- [ ] Session persists across page refreshes
- [ ] Only current project cookies present
- [ ] Terminal shows filtered cookie count

---

## 📝 Key Features of Fixed Middleware

### Cookie Handling
- ✅ Filters cookies by project ID
- ✅ Sets `path: '/'` explicitly
- ✅ Proper cookie propagation in redirects
- ✅ Preserves `httpOnly` and `maxAge` if set

### Authentication
- ✅ Uses `getUser()` (not `getSession()`)
- ✅ Handles errors gracefully
- ✅ Detailed debug logging

### RLS Integration
- ✅ Uses ONLY `profiles_select_own` policy (no recursion)
- ✅ Handles `42P17` errors with fallback
- ✅ Supports `station_id` null during transition

---

## 🚀 Ready to Deploy

All fixes are in place. Follow the checklist above to deploy and verify.

**Next Action**: Run `supabase-fix-rls-recursion-final.sql` in Supabase SQL Editor.





