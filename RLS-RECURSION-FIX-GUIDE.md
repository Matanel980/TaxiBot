# RLS Recursion Fix Guide (42P17 Error)

## 🔴 Problem

The middleware is encountering an **infinite recursion error (42P17)** when querying the `profiles` table:

```
infinite recursion detected in policy for relation "profiles"
```

This happens when RLS policies query the same table they're protecting, creating a circular dependency.

## ✅ Solution

### Step 1: Run the SQL Fix

Execute `supabase-fix-rls-recursion.sql` in your Supabase SQL Editor:

1. Open Supabase Dashboard → SQL Editor
2. Copy and paste the entire contents of `supabase-fix-rls-recursion.sql`
3. Click "Run"
4. Verify no errors appear

**What the script does:**
- Drops all existing policies on `profiles` table
- Recreates `get_user_station_id()` and `is_user_admin()` as `SECURITY DEFINER` functions
- Creates new non-recursive policies:
  - `profiles_select_own`: Direct `auth.uid() = id` check (no recursion)
  - `profiles_select_station`: Uses `SECURITY DEFINER` functions (bypasses RLS)

### Step 2: Verify the Fix

Run this query in Supabase SQL Editor to verify your profile is accessible:

```sql
-- This should work without recursion errors
SELECT 
  id,
  role,
  station_id,
  full_name,
  phone
FROM profiles
WHERE id = '7a1c065d-fe67-4551-be0e-9b2b7aa3dba8';
```

Expected result: Your profile data should be returned without errors.

### Step 3: Test Middleware

After applying the SQL fix:

1. Restart your Next.js dev server
2. Try logging in with your account
3. Check terminal logs - you should see:
   - ✅ `[Middleware] Path: /admin/dashboard | Session: YES`
   - ❌ No more `42P17` errors

## 🔍 How It Works

### Before (Recursive):
```
Middleware queries profiles
  → Triggers RLS policy
    → Policy calls is_user_admin()
      → is_user_admin() queries profiles (WITH RLS)
        → Triggers RLS policy again
          → INFINITE LOOP ❌
```

### After (Non-Recursive):
```
Middleware queries profiles
  → Triggers "profiles_select_own" policy
    → Direct check: auth.uid() = id
      → ✅ Returns immediately (no recursion)

OR

  → Triggers "profiles_select_station" policy
    → Calls is_user_admin() (SECURITY DEFINER)
      → Bypasses RLS, queries profiles directly
        → ✅ Returns immediately (no recursion)
```

## 🛡️ Security Notes

- **`SECURITY DEFINER`**: Functions run with the privileges of the function creator, bypassing RLS
- **Direct `auth.uid()` checks**: No function calls needed for own profile access
- **Policy order**: PostgreSQL evaluates policies in order; `profiles_select_own` is checked first

## 📋 Verification Checklist

After applying the fix:

- [ ] SQL script executed without errors
- [ ] `get_user_station_id()` function exists and is `SECURITY DEFINER`
- [ ] `is_user_admin()` function exists and is `SECURITY DEFINER`
- [ ] `profiles_select_own` policy exists
- [ ] `profiles_select_station` policy exists
- [ ] Test query returns your profile without errors
- [ ] Middleware no longer shows `42P17` errors
- [ ] Login flow works correctly

## 🚨 If Issues Persist

If you still see recursion errors after applying the fix:

1. **Check function definitions**:
   ```sql
   SELECT 
     proname,
     prosecdef, -- Should be 't' (true) for SECURITY DEFINER
     prosrc
   FROM pg_proc
   WHERE proname IN ('get_user_station_id', 'is_user_admin');
   ```

2. **Check policy definitions**:
   ```sql
   SELECT 
     schemaname,
     tablename,
     policyname,
     permissive,
     roles,
     cmd,
     qual
   FROM pg_policies
   WHERE tablename = 'profiles';
   ```

3. **Verify RLS is enabled**:
   ```sql
   SELECT tablename, rowsecurity 
   FROM pg_tables 
   WHERE tablename = 'profiles';
   -- rowsecurity should be 't' (true)
   ```

---

**Ready to apply?** Run `supabase-fix-rls-recursion.sql` now! 🚀





