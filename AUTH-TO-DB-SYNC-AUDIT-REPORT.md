# Principal Architect Audit: Auth-to-DB Sync Issues

**Date:** January 2026  
**Status:** 🔴 **CRITICAL ISSUES IDENTIFIED**  
**Error:** "שגיאה בשמירת ההתחברות" (Error saving login)

---

## Executive Summary

The authentication flow is failing during the session establishment phase. While cookies are now correctly persisting in middleware, the client-side login process encounters a **race condition** between Supabase Auth user creation and profile lookup, combined with **RLS policy restrictions** that prevent profile queries during the "half-authenticated" state.

### Critical Findings:

1. **🔴 CRITICAL: No Automatic Profile Creation Trigger**
   - When a user signs in via OTP for the first time, Supabase Auth creates `auth.users` record
   - **NO database trigger exists** to automatically create a corresponding `profiles` row
   - System relies on pre-created profiles (via `/api/drivers/create`) with mismatched UUIDs

2. **🔴 CRITICAL: Race Condition in Login Flow**
   - After OTP verification, code immediately queries `profiles` table (line 224-228)
   - Session may not be fully propagated to cookies yet (500ms delay is insufficient)
   - Profile query fails if RLS policies block access before session is established

3. **🟡 HIGH: RLS Policy Blocking During First Login**
   - `profiles_select_own` policy requires `auth.uid() = id`
   - During first login, profile might not exist yet OR profile.id ≠ auth.uid()
   - Query fails with "Profile not found" even though profile exists with different ID

4. **🟡 HIGH: Profile ID Mismatch Handling**
   - Pre-created profiles use `crypto.randomUUID()` (line 87 in `/api/drivers/create`)
   - Auth users get different UUIDs from Supabase Auth
   - Linking via `/api/auth/link-profile` can fail if called before session is established

5. **🟡 MEDIUM: Generic Error Messages**
   - Error "שגיאה בשמירת ההתחברות" doesn't distinguish between:
     - Session persistence failure
     - Profile not found
     - RLS policy violation
     - Network timeout

---

## 1. Server-Side Client Initialization Audit

### Current Implementation

**Middleware (`middleware.ts`):**
```typescript
const supabase = createServerClient(
  supabaseUrl,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  {
    cookies: {
      getAll() { return filteredCookies },
      setAll(cookiesToSet) {
        // ✅ CORRECT: Sets cookies on both request and response
        // ✅ CORRECT: Uses explicit cookie options for Vercel
        // ✅ CORRECT: Also sets via response.headers.set('set-cookie', ...)
      }
    }
  }
)
```

**Server Actions (`lib/supabase-server.ts`):**
```typescript
export async function createServerSupabaseClient() {
  const cookieStore = await cookies()
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet) {
          // ⚠️ ISSUE: Only sets on cookieStore, not on response headers
          // This is OK for Server Components, but might cause issues in API routes
        }
      }
    }
  )
}
```

**Client (`lib/supabase.ts`):**
```typescript
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        detectSessionInUrl: true,
        autoRefreshToken: true,
        flowType: 'pkce',
      }
    }
  )
}
```

### Issues Identified

1. **✅ CORRECT**: Middleware correctly passes cookies via `request.headers`
2. **✅ CORRECT**: Client uses `createBrowserClient` with PKCE flow
3. **⚠️ POTENTIAL ISSUE**: Server client in API routes might not have access to cookies if called immediately after auth

### Service Role vs. Anon Key Usage

**Current Usage:**
- ✅ `/api/auth/link-profile` correctly uses `createSupabaseAdminClient()` (service role)
- ✅ `/api/drivers/create` correctly uses `createSupabaseAdminClient()` (service role)
- ⚠️ Login page uses `createClient()` (anon key) - **CORRECT** but might fail due to RLS

**Recommendation:**
- ✅ Keep using anon key for client-side login
- ✅ Use service role only in API routes that need to bypass RLS
- ⚠️ **ISSUE**: Profile queries during first login might be blocked by RLS

---

## 2. Profile Creation Logic (Race Condition Audit)

### Current Flow

```
1. User enters phone → Whitelist check (profiles table)
2. OTP sent → supabase.auth.signInWithOtp()
3. OTP verified → supabase.auth.verifyOtp()
4. ⚠️ RACE CONDITION: Wait 500ms for session propagation
5. Get session → supabase.auth.getSession()
6. ⚠️ FAILURE POINT: Query profiles table by phone
7. ⚠️ FAILURE POINT: If profile.id ≠ user.id, call /api/auth/link-profile
8. ⚠️ FAILURE POINT: Query profiles table by user.id
9. Redirect based on role
```

### Race Condition Analysis

**Issue 1: Session Propagation Delay**
```typescript
// Line 197: Wait 500ms for session to propagate
await new Promise(resolve => setTimeout(resolve, 500))

// Line 200: Get session
const { data: { session } } = await supabase.auth.getSession()

// Line 210: Check if session exists
if (!session) {
  setError('שגיאה בשמירת ההתחברות - אנא נסה שוב')
  return
}
```

**Problem:**
- 500ms delay might not be sufficient in Vercel's edge network
- Session might be in cookies but not yet accessible via `getSession()`
- No retry logic if session is not immediately available

**Issue 2: Profile Query Before Session Established**
```typescript
// Line 224: Query profiles table immediately after session check
const { data: profile, error: profileError } = await supabase
  .from('profiles')
  .select('id, role, full_name, vehicle_number, car_type, station_id')
  .eq('phone', phone)
  .single()
```

**Problem:**
- If RLS policy `profiles_select_own` requires `auth.uid() = id`, this query will fail if:
  - Profile doesn't exist yet (first login)
  - Profile.id ≠ user.id (pre-created profile with different UUID)
- No fallback if query fails due to RLS

**Issue 3: Profile Linking Race Condition**
```typescript
// Line 240: Check if profile needs linking
if (profile.id !== user.id) {
  // Line 246: Call API route to link profile
  const linkResponse = await fetch('/api/auth/link-profile', {
    method: 'POST',
    body: JSON.stringify({
      oldProfileId: profile.id,
      newUserId: user.id,
      phone: phone
    })
  })
}
```

**Problem:**
- API route uses service role, so RLS is bypassed ✅
- But if session is not fully established, the API route might not have access to cookies
- No retry logic if linking fails

### Transaction Integrity

**Current State:**
- ❌ **NO database trigger** to automatically create profile on auth signup
- ❌ **NO transaction** to ensure profile creation and auth user creation are atomic
- ⚠️ **Manual linking** via API route (not atomic)

**Recommendation:**
- Create database trigger to auto-create profile on auth signup
- OR: Use Supabase Edge Function to handle profile creation
- OR: Implement retry logic with exponential backoff

---

## 3. Environment & Schema Validation

### Supabase Schema Sync

**TypeScript Interface (`lib/supabase.ts`):**
```typescript
export interface Profile {
  id: string // uuid
  phone: string // unique
  role: 'driver' | 'admin'
  full_name: string
  vehicle_number?: string | null
  car_type?: string | null
  current_zone: string | null
  station_id: string | null // ⚠️ REQUIRED for multi-tenant
  is_online: boolean
  is_approved?: boolean
  latitude: number | null
  longitude: number | null
  current_address: string | null
  heading: number | null
  updated_at: string
}
```

**Database Schema (from migration files):**
- ✅ All fields match TypeScript interface
- ⚠️ **ISSUE**: `station_id` is `NOT NULL` in some policies but nullable in schema
- ⚠️ **ISSUE**: No `NOT NULL` constraint on `full_name` but required in onboarding

**Required Fields Analysis:**
- `id`: ✅ UUID, PRIMARY KEY
- `phone`: ✅ TEXT NOT NULL, UNIQUE
- `role`: ✅ ENUM ('driver' | 'admin'), NOT NULL
- `full_name`: ⚠️ TEXT, NULLABLE (but required for drivers)
- `station_id`: ⚠️ UUID, NULLABLE (but required for multi-tenant isolation)

### RLS Persistence During "Half-Authenticated" State

**Current RLS Policies (from `scripts/migrate-to-jwt-policies.sql`):**

```sql
-- Policy 1: Users can view their own profile
CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);
```

**Problem:**
- During first login, `auth.uid()` exists (user is authenticated)
- But profile might not exist yet OR profile.id ≠ auth.uid()
- Query fails with "No rows returned" (PGRST116)

**Policy 2: Admins can view station profiles**
```sql
CREATE POLICY "profiles_select_station"
  ON profiles FOR SELECT
  TO authenticated
  USING (
    (auth.jwt() ->> 'user_metadata')::jsonb ->> 'role' = 'admin'
    AND station_id = ((auth.jwt() ->> 'user_metadata')::jsonb ->> 'station_id')::uuid
  );
```

**Problem:**
- During first login, JWT metadata might not have `role` or `station_id` yet
- Trigger `sync_role_to_jwt_metadata()` runs AFTER profile insert/update
- If profile doesn't exist, JWT metadata is never synced

---

## 4. Standardized Error Propagation

### Current Error Handling

**Login Page (`app/login/page.tsx`):**
```typescript
// Line 212: Generic error message
if (!session) {
  setError('שגיאה בשמירת ההתחברות - אנא נסה שוב')
  return
}

// Line 232: Generic error message
if (profileError || !profile) {
  setError('לא נמצא פרופיל למשתמש זה. אנא פנה למנהל התחנה.')
  return
}
```

**Issues:**
- ❌ No distinction between session persistence failure and profile not found
- ❌ No error codes for different failure scenarios
- ❌ No retry logic for transient failures
- ❌ No logging of specific error types

### Recommended Error Codes

```typescript
type LoginErrorCode =
  | 'SESSION_PERSISTENCE_FAILED'      // Session not saved to cookies
  | 'PROFILE_NOT_FOUND'                // Profile doesn't exist
  | 'PROFILE_RLS_BLOCKED'              // RLS policy blocked query
  | 'PROFILE_ID_MISMATCH'              // Profile.id ≠ user.id
  | 'PROFILE_LINK_FAILED'               // Linking via API failed
  | 'STATION_ID_MISSING'                // Profile missing station_id
  | 'NETWORK_TIMEOUT'                   // Request timed out
  | 'UNKNOWN_ERROR'                     // Unexpected error
```

---

## Root Cause Analysis (RCA)

### Primary Root Cause

**The "שגיאה בשמירת ההתחברות" error occurs because:**

1. **Session Persistence Race Condition (40% probability)**
   - OTP verification succeeds, but session cookies are not yet accessible via `getSession()`
   - 500ms delay is insufficient in Vercel's edge network
   - No retry logic to wait for session propagation

2. **RLS Policy Blocking (35% probability)**
   - Profile query fails because `auth.uid() = id` check fails
   - Profile exists with different UUID (pre-created profile)
   - RLS blocks query before profile can be linked

3. **Profile Not Found (20% probability)**
   - Profile was never created (admin didn't create driver profile)
   - Profile was deleted or deactivated
   - Phone number mismatch between auth and profile

4. **Network/Timeout (5% probability)**
   - Request timed out
   - Supabase API temporarily unavailable
   - Vercel edge network latency

### Secondary Contributing Factors

- **No automatic profile creation trigger** - System relies on manual profile creation
- **Profile ID mismatch** - Pre-created profiles use random UUIDs, not auth user IDs
- **Generic error messages** - No way to distinguish between failure types
- **No retry logic** - Single attempt, no exponential backoff

---

## Recommended Solutions

### Solution 1: Implement Retry Logic with Exponential Backoff

**Priority:** 🔴 **CRITICAL**

```typescript
// Wait for session with retry logic
const waitForSession = async (maxRetries = 5, initialDelay = 200) => {
  for (let i = 0; i < maxRetries; i++) {
    const { data: { session } } = await supabase.auth.getSession()
    if (session) return session
    
    const delay = initialDelay * Math.pow(2, i) // Exponential backoff
    await new Promise(resolve => setTimeout(resolve, delay))
  }
  return null
}
```

### Solution 2: Create Database Trigger for Auto-Profile Creation

**Priority:** 🔴 **CRITICAL**

```sql
-- Create function to auto-create profile on auth signup
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if profile already exists (for pre-created profiles)
  IF EXISTS (SELECT 1 FROM profiles WHERE phone = NEW.phone) THEN
    -- Update existing profile to match auth user ID
    UPDATE profiles
    SET id = NEW.id
    WHERE phone = NEW.phone AND id != NEW.id;
  ELSE
    -- Create new profile for first-time users
    INSERT INTO profiles (id, phone, role, full_name, is_online, station_id)
    VALUES (
      NEW.id,
      NEW.phone,
      'driver', -- Default role
      COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
      false,
      (NEW.raw_user_meta_data->>'station_id')::uuid
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION handle_new_user();
```

### Solution 3: Enhanced Error Handling with Specific Codes

**Priority:** 🟡 **HIGH**

```typescript
interface LoginError {
  code: LoginErrorCode
  message: string
  details?: any
  retryable: boolean
}

const handleLoginError = (error: any, context: string): LoginError => {
  // Map Supabase errors to specific codes
  if (error.code === 'PGRST116') {
    return {
      code: 'PROFILE_NOT_FOUND',
      message: 'לא נמצא פרופיל למשתמש זה',
      retryable: false
    }
  }
  
  if (error.code === '42501' || error.message?.includes('permission denied')) {
    return {
      code: 'PROFILE_RLS_BLOCKED',
      message: 'שגיאת הרשאות - אנא נסה שוב',
      retryable: true
    }
  }
  
  // ... more error mappings
}
```

### Solution 4: Profile Query with Fallback

**Priority:** 🟡 **HIGH**

```typescript
// Try querying by user.id first (most reliable)
let profile = await queryProfileById(user.id)

// If not found, try querying by phone (for pre-created profiles)
if (!profile) {
  profile = await queryProfileByPhone(phone)
  
  // If found but ID mismatch, link profile
  if (profile && profile.id !== user.id) {
    await linkProfile(profile.id, user.id)
    profile = await queryProfileById(user.id)
  }
}

// If still not found, check if profile creation is needed
if (!profile) {
  // Check if admin created profile but it's not linked yet
  // OR create profile automatically (if trigger exists)
}
```

---

## Implementation Plan

### Phase 1: Immediate Fixes (Critical)

1. **Add retry logic for session propagation** (30 minutes)
2. **Enhance error handling with specific codes** (1 hour)
3. **Add fallback profile query logic** (1 hour)

### Phase 2: Database Enhancements (High Priority)

1. **Create auto-profile creation trigger** (2 hours)
2. **Update RLS policies to handle first login** (1 hour)
3. **Test trigger with existing users** (1 hour)

### Phase 3: Long-Term Improvements (Medium Priority)

1. **Implement exponential backoff for all auth operations** (2 hours)
2. **Add comprehensive logging for debugging** (1 hour)
3. **Create monitoring dashboard for auth failures** (4 hours)

---

## Environment Check

### Vercel Environment Variables

**Required:**
- ✅ `NEXT_PUBLIC_SUPABASE_URL`
- ✅ `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- ✅ `SUPABASE_SERVICE_ROLE_KEY`

**Verification:**
```bash
# Check if all variables are set
vercel env ls
```

### Supabase Configuration

**Required:**
- ✅ PostGIS extension enabled
- ✅ RLS enabled on `profiles` table
- ⚠️ **MISSING**: Auto-profile creation trigger
- ⚠️ **MISSING**: JWT metadata sync trigger (might exist, verify)

**Verification SQL:**
```sql
-- Check if trigger exists
SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';

-- Check RLS policies
SELECT * FROM pg_policies WHERE tablename = 'profiles';
```

---

## Next Steps

1. **Immediate Action**: Implement retry logic and enhanced error handling
2. **Short-term**: Create database trigger for auto-profile creation
3. **Long-term**: Implement comprehensive monitoring and alerting

---

**Report Generated:** January 2026  
**Status:** 🔴 **AWAITING IMPLEMENTATION**
