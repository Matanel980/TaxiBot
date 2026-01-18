# Multi-Tenant Migration Deployment Guide

## 🚀 Quick Start

### Step 1: Run the SQL Migration

1. Go to **Supabase Dashboard** → **SQL Editor**
2. Open `supabase-multi-tenant-migration.sql`
3. **Copy the entire contents** (everything between `BEGIN;` and `COMMIT;`)
4. **Paste into SQL Editor**
5. Click **"Run"** (or press `Ctrl+Enter`)

### Step 2: Verify Your Setup

After running the migration, verify your account is linked:

```sql
-- Check your profile has station_id
SELECT id, phone, full_name, role, station_id 
FROM profiles 
WHERE id = '7a1c065d-fe67-4551-be0e-9b2b7aa3dba8';

-- Should show:
-- - role = 'admin'
-- - station_id = (UUID of Main Station)
```

### Step 3: Test Login

1. Go to `http://localhost:3000/login`
2. Enter your phone number
3. The infinite recursion error should be **GONE**
4. Login should work successfully

## ✅ What Was Fixed

### 1. Infinite Recursion (42P17) - FIXED ✅

**Before:**
```sql
-- ❌ Recursive: Queries profiles while evaluating profiles policy
CREATE POLICY "admin_view_all_profiles"
  USING (EXISTS (SELECT 1 FROM profiles WHERE ...))
```

**After:**
```sql
-- ✅ Non-recursive: Uses SECURITY DEFINER function
CREATE POLICY "profiles_select_station"
  USING (is_user_admin() = true AND station_id = get_user_station_id())
```

### 2. Station Isolation - IMPLEMENTED ✅

- **Stations Table**: Created for multi-tenant isolation
- **station_id Columns**: Added to profiles, trips, zones, zones_postgis
- **RLS Policies**: All policies now filter by `station_id`
- **Helper Functions**: `get_user_station_id()` and `is_user_admin()` bypass RLS safely

### 3. Super-Admin Setup - COMPLETE ✅

- **Main Station**: Created automatically
- **Your Account**: Linked to Main Station (UID: `7a1c065d-fe67-4551-be0e-9b2b7aa3dba8`)
- **Role**: Set to 'admin'

## 📋 Database Changes Summary

### New Tables
- `stations` - Station metadata

### New Columns
- `profiles.station_id` (uuid, nullable)
- `trips.station_id` (uuid, nullable)
- `zones.station_id` (uuid, nullable)
- `zones_postgis.station_id` (uuid, nullable)

### New Functions
- `get_user_station_id()` - Returns current user's station_id (non-recursive)
- `is_user_admin()` - Returns true if current user is admin (non-recursive)

### New Indexes
- `idx_profiles_station_id`
- `idx_trips_station_id`
- `idx_zones_station_id`
- `idx_zones_postgis_station_id`

### New RLS Policies (All Non-Recursive)
- **Profiles**: `profiles_select_own`, `profiles_select_station`, `profiles_update_own`, `profiles_update_station`, `profiles_insert_station`
- **Trips**: `trips_select_driver`, `trips_select_station`, `trips_insert_station`, `trips_update_station`, `trips_update_driver`
- **Zones**: `zones_select_station`, `zones_manage_station`
- **Zones PostGIS**: `zones_postgis_select_station`, `zones_postgis_manage_station`
- **Stations**: `stations_select_own`

## 🔒 Security Model

### Station Isolation Enforcement

**Layer 1: RLS Policies (Database Level)**
- All policies filter by `station_id = get_user_station_id()`
- Prevents cross-station data access at database level

**Layer 2: Helper Functions (Non-Recursive)**
- `get_user_station_id()` - SECURITY DEFINER, bypasses RLS
- `is_user_admin()` - SECURITY DEFINER, bypasses RLS
- No infinite recursion possible

**Layer 3: Application Queries (Code Level)**
- Will be implemented in Phase 3
- Explicit `station_id` filters in all queries

## 🧪 Testing Checklist

After running the migration:

- [ ] Login works (no infinite recursion error)
- [ ] Your profile has `station_id` set
- [ ] Your role is 'admin'
- [ ] Main Station exists in `stations` table
- [ ] Helper functions work: `SELECT get_user_station_id()`
- [ ] Helper functions work: `SELECT is_user_admin()`
- [ ] No 42P17 errors in console
- [ ] No 406 errors in console

## 🚨 Troubleshooting

### Error: "User not found in profiles table"

**Solution:**
```sql
-- Create your profile first
INSERT INTO profiles (id, phone, role, full_name, is_online, station_id)
SELECT 
  '7a1c065d-fe67-4551-be0e-9b2b7aa3dba8',
  '+972526099607', -- Your phone
  'admin',
  'Your Name',
  false,
  (SELECT id FROM stations WHERE name = 'Main Station' LIMIT 1)
ON CONFLICT (id) DO UPDATE 
SET 
  role = 'admin',
  station_id = (SELECT id FROM stations WHERE name = 'Main Station' LIMIT 1);
```

### Error: "Function get_user_station_id() does not exist"

**Solution:**
- Re-run the migration
- Check that the function was created: `SELECT get_user_station_id();`

### Still Getting 42P17 Errors

**Solution:**
1. Verify all old policies were dropped:
   ```sql
   SELECT policyname FROM pg_policies WHERE tablename = 'profiles';
   ```
2. Should only see new policies (profiles_select_own, profiles_select_station, etc.)
3. If old policies exist, drop them manually and re-run migration

## 📝 Next Steps (Phase 3)

Once database migration is complete and verified:

1. **Update TypeScript Interfaces** - Add `station_id` to Profile, Trip, Zone types
2. **Update Admin Dashboard** - Fetch and filter by `station_id`
3. **Update Login Whitelist** - Check `station_id IS NOT NULL`
4. **Update Driver Onboarding** - Auto-assign `station_id`
5. **Update Trip Creation** - Auto-assign `station_id`
6. **Update Zone Creation** - Auto-assign `station_id`

---

**Ready to proceed?** Run the SQL migration, verify your setup, then we'll move to Phase 3!





