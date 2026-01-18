# Multi-Tenant Architecture & Station Isolation Plan

## 🔴 Critical Issue: Infinite Recursion (42P17)

**Root Cause:**
The RLS policies query the `profiles` table to check if a user is an admin, but this query itself triggers the same RLS policy, creating infinite recursion.

**Example of Problematic Policy:**
```sql
CREATE POLICY "admin_view_all_profiles"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles  -- ❌ This queries profiles, triggering the same policy!
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
```

## ✅ Solution Architecture

### 1. **Non-Recursive RLS Helper Function**

Create a `SECURITY DEFINER` function that bypasses RLS to safely check user role and station:

```sql
CREATE OR REPLACE FUNCTION get_user_station_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_station_id uuid;
BEGIN
  -- This function bypasses RLS (SECURITY DEFINER)
  SELECT station_id INTO user_station_id
  FROM profiles
  WHERE id = auth.uid();
  
  RETURN user_station_id;
END;
$$;
```

### 2. **Database Schema Changes**

**Add `station_id` column to all tables:**
- `profiles.station_id` (uuid, NOT NULL for admins, nullable for backward compatibility)
- `trips.station_id` (uuid, NOT NULL)
- `zones.station_id` (uuid, NOT NULL)
- `zones_postgis.station_id` (uuid, NOT NULL)

**Create `stations` table:**
```sql
CREATE TABLE stations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
```

### 3. **RLS Policy Strategy (Non-Recursive)**

**For Profiles:**
- **Own Profile**: `auth.uid() = id` (no recursion)
- **Station Managers**: Use `get_user_station_id()` function (bypasses RLS)
- **Drivers in Same Station**: `station_id = get_user_station_id()`

**For Trips:**
- **Assigned Driver**: `driver_id = auth.uid()`
- **Station Managers**: `station_id = get_user_station_id()`

**For Zones:**
- **Station Managers**: `station_id = get_user_station_id()`

### 4. **Application Layer Changes**

**Admin Dashboard (`app/admin/dashboard/page.tsx`):**
```typescript
// Get current user's station_id first
const { data: currentUser } = await supabase
  .from('profiles')
  .select('station_id')
  .eq('id', userId)
  .single()

// Then filter all queries by station_id
const { data: drivers } = await supabase
  .from('profiles')
  .select('*')
  .eq('role', 'driver')
  .eq('station_id', currentUser.station_id) // ✅ Station isolation
```

**Login Whitelist (`app/login/page.tsx`):**
```typescript
// Check if phone exists AND has a station_id
const { data: profile } = await supabase
  .from('profiles')
  .select('id, role, full_name, station_id')
  .eq('phone', formattedPhone)
  .not('station_id', 'is', null) // ✅ Must have station_id
  .single()
```

**Driver Onboarding (Admin Management):**
```typescript
// When Station Manager adds a driver
const { data: newDriver } = await supabase
  .from('profiles')
  .insert({
    phone: driverPhone,
    role: 'driver',
    station_id: currentUser.station_id, // ✅ Auto-linked to manager's station
    full_name: driverName,
    is_online: false
  })
```

### 5. **Data Flow Summary**

**Station Manager Login:**
1. User logs in with phone
2. System checks `profiles.phone` AND `profiles.station_id IS NOT NULL`
3. If valid, user's `station_id` is stored in session/context

**Admin Dashboard Data Fetching:**
1. Get current user's `station_id` from profile
2. All queries filter by `station_id = currentUser.station_id`
3. RLS policies enforce this at database level (double protection)

**Driver Onboarding:**
1. Station Manager enters driver phone number
2. System creates profile with `station_id = manager.station_id`
3. Driver can now log in (has station_id)

**Trip Creation:**
1. Station Manager creates trip
2. Trip automatically gets `station_id = manager.station_id`
3. Only drivers from same station can see/accept trip

**Zone Management:**
1. Station Manager creates zone
2. Zone gets `station_id = manager.station_id`
3. Only visible to same station's managers/drivers

## 🔒 Security Enforcement Layers

### Layer 1: RLS Policies (Database Level)
- Non-recursive functions bypass RLS safely
- All policies filter by `station_id`
- Prevents cross-station data access

### Layer 2: Application Queries (Code Level)
- All queries explicitly filter by `station_id`
- Current user's `station_id` fetched once, cached in context
- Double protection if RLS is misconfigured

### Layer 3: API Endpoints (Server Level)
- Server-side validation of `station_id`
- Webhook endpoints validate station context

## 📋 Implementation Checklist

### Phase 1: Database Migration
- [ ] Create `stations` table
- [ ] Add `station_id` column to `profiles`
- [ ] Add `station_id` column to `trips`
- [ ] Add `station_id` column to `zones` and `zones_postgis`
- [ ] Create `get_user_station_id()` SECURITY DEFINER function
- [ ] Create indexes on `station_id` columns

### Phase 2: RLS Policy Rewrite
- [ ] Drop all existing recursive policies
- [ ] Create non-recursive policies using helper function
- [ ] Test policies don't cause recursion
- [ ] Verify station isolation works

### Phase 3: Application Updates
- [ ] Update TypeScript interfaces to include `station_id`
- [ ] Update Admin Dashboard to fetch and filter by `station_id`
- [ ] Update Login whitelist to check `station_id`
- [ ] Update Driver Onboarding to auto-assign `station_id`
- [ ] Update Trip creation to include `station_id`
- [ ] Update Zone creation to include `station_id`

### Phase 4: Testing
- [ ] Test Station Manager can only see their station's data
- [ ] Test Driver can only see their station's trips
- [ ] Test Cross-station isolation (no data leakage)
- [ ] Test Login with/without `station_id`

## 🎯 Key Principles

1. **Non-Recursive RLS**: Use SECURITY DEFINER functions to break recursion
2. **Station-First**: Every data operation must include `station_id`
3. **Defense in Depth**: RLS + Application filters + API validation
4. **Backward Compatibility**: Allow NULL `station_id` during migration
5. **Performance**: Index `station_id` columns for fast filtering

## ⚠️ Migration Strategy

1. **Add columns as nullable** (backward compatible)
2. **Create helper function** (non-recursive)
3. **Update RLS policies** (use helper function)
4. **Manually assign `station_id`** to existing admins
5. **Update application code** to filter by `station_id`
6. **Make `station_id` NOT NULL** after migration complete

---

**Next Step:** Review this plan, then I'll provide the complete SQL migration and code updates.





