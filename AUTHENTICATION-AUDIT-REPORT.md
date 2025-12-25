# 🔍 Deep Authentication Architecture Audit Report

**Date:** December 25, 2025  
**Issue:** Session not persisting after OTP verification in Vercel production  
**Symptom:** Middleware logs show `Session: NO | User ID: none` even after successful `verifyOtp()`

---

## 🚨 ROOT CAUSE IDENTIFIED

### **Critical Issue #1: Cookie Name Mismatch**

**Client-Side (lib/supabase.ts):**
```typescript
cookieOptions: {
  name: 'sb-auth-token',  // ❌ CUSTOM NAME
  sameSite: 'lax',
  path: '/',
  secure: process.env.NODE_ENV === 'production',
}
```

**Server-Side (middleware.ts):**
```typescript
// Uses @supabase/ssr's createServerClient
// This expects DEFAULT Supabase cookie names:
// - sb-<project-ref>-auth-token
// - sb-<project-ref>-auth-token-code-verifier
```

**🔥 THE PROBLEM:**
When the client SDK (`createBrowserClient`) saves the session after OTP verification, it writes cookies with the custom name `sb-auth-token`. However, the middleware's `createServerClient` is looking for cookies named with the pattern `sb-<project-ref>-auth-token` (the default Supabase naming convention).

**Result:** The cookies ARE being set by the client, but the middleware CAN'T READ THEM because it's looking for different cookie names.

---

### **Critical Issue #2: Cookie Storage Mechanism Mismatch**

**What's Happening:**

1. **Client-side:** `createBrowserClient` uses **localStorage + cookies** for session persistence
2. **Server-side:** `createServerClient` in middleware ONLY reads **cookies** (no localStorage access)
3. **Vercel Edge:** Runs in a limited environment where localStorage doesn't exist

**The Race Condition:**
```
User clicks "Verify OTP" 
  ↓
verifyOtp() succeeds
  ↓
Session saved to localStorage (✓)
  ↓
Cookies set with custom name 'sb-auth-token' (✓)
  ↓
window.location.replace('/driver/dashboard')
  ↓
Browser navigates to /driver/dashboard
  ↓
Middleware runs on Edge
  ↓
Middleware looks for 'sb-<project>-auth-token' (❌ NOT FOUND)
  ↓
session = null, user = null
  ↓
Redirect back to /login
```

---

### **Critical Issue #3: Storage Persistence Configuration**

In `lib/supabase.ts`, the client is configured with:
```typescript
auth: {
  persistSession: true,  // ✓ Good
  detectSessionInUrl: true,  // ✓ Good
  autoRefreshToken: true,  // ✓ Good
  flowType: 'pkce',  // ✓ Good (secure)
}
```

**BUT:** The default storage for `createBrowserClient` is **localStorage**, which is NOT accessible by middleware.

For phone OTP auth to work with SSR middleware, cookies MUST be the primary storage mechanism, and the cookie names MUST match between client and server.

---

## 🔬 Why This Happens in Production but Not Always Locally

**Local Development:**
- Next.js dev server may cache some auth state
- Browser DevTools keep localStorage alive
- Hot Module Replacement (HMR) can mask the issue

**Vercel Production:**
- True Edge runtime with strict cookie-only access
- No localStorage access in middleware
- Stateless requests (each middleware invocation is fresh)
- Multiple edge regions may cause additional cookie sync delays

---

## 📊 Evidence from Logs

```csv
Path: /admin/dashboard | Session: NO | User ID: none | Phone: none
Path: /login | Session: NO | User ID: none | Phone: none
```

These logs confirm that after OTP verification and redirect, the middleware **cannot detect any session**, which points directly to the cookie name mismatch.

---

## 🛠️ THE FIX (Ready to Implement)

### **Solution: Remove Custom Cookie Name and Use Supabase Defaults**

**Step 1:** Update `lib/supabase.ts` to remove the custom `cookieOptions`:

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
        storage: undefined, // Let Supabase use default (cookies + localStorage)
      },
      // ❌ REMOVE THIS:
      // cookieOptions: {
      //   name: 'sb-auth-token',
      //   ...
      // }
    }
  )
}
```

**Why this works:**
- Supabase will use its default cookie naming convention
- Both client and server will use the same cookie names
- Cookies will be automatically synced via the standard Supabase flow

---

### **Step 2:** Add Explicit Cookie Logging for Debugging

Add this to `middleware.ts` after the `getSession()` call:

```typescript
// DEBUG: Log all cookies to identify what's being sent
console.log('[Middleware] All cookies:', request.cookies.getAll().map(c => c.name))

const { data: { session } } = await supabase.auth.getSession()
console.log('[Middleware] Session object keys:', session ? Object.keys(session) : 'null')
```

---

### **Step 3:** Ensure Proper Cookie Propagation in Middleware

The current `setAll` implementation looks correct, but we should ensure cookies are being written to the response:

```typescript
setAll(cookiesToSet) {
  // Set on request for downstream handlers
  cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
  
  // Recreate response with updated request
  response = NextResponse.next({ request })
  
  // Set on response for browser
  cookiesToSet.forEach(({ name, value, options }) => {
    response.cookies.set(name, value, {
      ...options,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: false, // Allow client-side access
    })
  })
}
```

---

### **Step 4:** Add a Post-Verification Cookie Check

In `app/login/page.tsx`, after the 500ms delay, add this:

```typescript
// Get fresh session
const { data: { session } } = await supabase.auth.getSession()

// DEBUG: Check if cookies were actually set
const allCookies = document.cookie
console.log('[DEBUG] Browser cookies after verification:', allCookies)

if (!session) {
  console.error('[ERROR] Session not persisted after verification!')
  setError('שגיאה בשמירת ההתחברות - אנא נסה שוב')
  setLoading(false)
  return
}
```

---

## 🎯 Expected Outcome After Fix

**Before Fix:**
```
[Middleware] Path: /driver/dashboard | Session: NO | User ID: none
```

**After Fix:**
```
[Middleware] All cookies: ['sb-<project>-auth-token', 'sb-<project>-auth-token-code-verifier']
[Middleware] Path: /driver/dashboard | Session: YES | User ID: abc123 | Phone: +972509800301
```

---

## 🧪 Testing Plan (Before Deployment)

1. **Local Test:**
   ```bash
   # Clear all cookies and localStorage
   npm run dev
   # Login with test phone
   # Verify middleware logs show session
   ```

2. **Vercel Preview Deploy:**
   ```bash
   git checkout -b fix/auth-cookie-sync
   # Apply fixes
   git push origin fix/auth-cookie-sync
   # Test on preview URL
   ```

3. **Production Deploy:**
   - Only after successful preview testing
   - Monitor Vercel logs for first 5 login attempts
   - Have rollback plan ready

---

## 📝 Summary

**The Issue:** Custom cookie name `'sb-auth-token'` doesn't match what the middleware expects  
**The Impact:** Session cookies are written but never read  
**The Fix:** Remove custom cookie configuration and use Supabase defaults  
**Estimated Fix Time:** 5 minutes  
**Risk Level:** LOW (reverting to standard configuration)  

**Status:** ⏸️ Awaiting approval to implement fix


