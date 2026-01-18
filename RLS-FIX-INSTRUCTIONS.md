# 🔧 RLS Power Fix - Instructions

## Critical 406 Error Resolution

The 406 (Not Acceptable) error occurs when:
1. **Schema Mismatch**: The `.select()` query requests columns that don't exist or aren't accessible
2. **RLS Blocking**: Row Level Security policies are too restrictive or incorrectly configured
3. **Cached Schema**: PostgREST is using a cached version of the schema

## Step 1: Run the RLS Power Fix SQL

1. Go to **Supabase Dashboard** → **SQL Editor**
2. Open the file: `supabase-rls-power-fix.sql`
3. **Copy the entire contents** (everything between BEGIN and COMMIT)
4. **Paste into SQL Editor**
5. Click **"Run"** (or press `Ctrl+Enter`)

## Step 2: Verify Your Admin User

After running the SQL, verify your admin user exists and has the correct role:

```sql
-- Check if you have an admin user
SELECT id, phone, full_name, role, is_online
FROM profiles
WHERE role = 'admin';

-- If no admin user exists, create one:
-- First, get your user ID from auth.users:
SELECT id, email, phone FROM auth.users LIMIT 5;

-- Then update/create the profile:
INSERT INTO profiles (id, phone, role, full_name, is_online)
VALUES ('YOUR_USER_ID_HERE', '+972501234567', 'admin', 'Admin User', false)
ON CONFLICT (id) DO UPDATE SET role = 'admin';
```

## Step 3: Test the Fix

After running the SQL, refresh your Admin Dashboard. The 406 errors should be gone.

### Verification Queries

Run these in SQL Editor to verify policies are working:

```sql
-- Check all policies were created
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE tablename IN ('profiles', 'trips', 'zones')
ORDER BY tablename, policyname;

-- Test admin access (should return rows)
SELECT COUNT(*) as admin_count
FROM profiles
WHERE role = 'admin';

-- Test driver access (should return rows if drivers exist)
SELECT COUNT(*) as driver_count
FROM profiles
WHERE role = 'driver';
```

## Step 4: If 406 Errors Persist

### Option A: Temporarily Disable RLS (Testing Only)

**⚠️ WARNING: Only for testing! Re-enable RLS before production!**

```sql
-- Temporarily disable RLS to test
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE trips DISABLE ROW LEVEL SECURITY;
ALTER TABLE zones DISABLE ROW LEVEL SECURITY;

-- Test your queries
-- If they work, the issue is RLS policies
-- If they still fail, the issue is schema mismatch

-- Re-enable RLS
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE zones ENABLE ROW LEVEL SECURITY;
```

### Option B: Check Column Names

Verify the exact column names in your database:

```sql
-- Check profiles table columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'profiles'
ORDER BY ordinal_position;

-- Check trips table columns
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'trips'
ORDER BY ordinal_position;
```

### Option C: Check PostgREST Logs

1. Go to **Supabase Dashboard** → **Logs** → **PostgREST**
2. Look for error messages related to your queries
3. Check for schema validation errors

## Step 5: Code Changes Applied

The following changes were made to `app/admin/dashboard/page.tsx`:

1. **Explicit Column Lists**: Changed from `.select('*')` to explicit column lists
2. **Better Error Handling**: Added specific 406 error detection and fallback
3. **Timeout Prevention**: Simplified queries to avoid complex filters

## Expected Results

After applying the fix:
- ✅ No more 406 errors
- ✅ Drivers load successfully
- ✅ Trips load successfully
- ✅ Zones load successfully
- ✅ Admin dashboard works without timeouts

## Troubleshooting Checklist

- [ ] RLS Power Fix SQL executed successfully
- [ ] Admin user exists with `role = 'admin'`
- [ ] Policies created (check `pg_policies` table)
- [ ] Column names match between code and database
- [ ] PostgREST logs show no errors
- [ ] Browser console shows no 406 errors
- [ ] Data loads in Admin Dashboard

## Next Steps

Once the 406 errors are resolved:
1. Test creating a new trip
2. Test assigning a driver
3. Test route visualization
4. Monitor PostgREST logs for any new issues





