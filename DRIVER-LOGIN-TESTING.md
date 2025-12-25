# Driver Login Testing Guide

## 📍 Route Verification

**Login URL:** `http://localhost:3000/login`

Both drivers and admins use the same login page. The system automatically redirects based on the user's role after successful authentication.

---

## 🔐 Authentication Flow

### Step 1: Phone Number Entry
1. Navigate to `/login`
2. Enter the driver's phone number: `0509800301` (or `+972509800301`)
3. The system automatically formats it to E.164: `+972509800301`
4. Click "שלח קוד אימות" (Send Verification Code)

### Step 2: OTP Verification
1. Enter the OTP code (see Test OTP setup below)
2. Click "אימות" (Verify)
3. System checks the user's role from the `profiles` table
4. Redirects based on role:
   - **Driver** → `/driver/dashboard`
   - **Admin** → `/admin/dashboard`

---

## ✅ Role-Based Redirection Verification

The redirection logic is in `app/login/page.tsx` (lines 90-96):

```typescript
if (profile?.role === 'driver') {
  router.push('/driver/dashboard')
} else if (profile?.role === 'admin') {
  router.push('/admin/dashboard')
} else {
  setError('לא נמצא תפקיד למשתמש זה')
}
```

**Middleware Protection:** The `middleware.ts` file also ensures:
- Drivers can only access `/driver/*` routes
- Admins can only access `/admin/*` routes
- Unauthenticated users are redirected to `/login`

---

## 🧪 Test OTP Setup (No Real SMS Required)

### Option 1: Supabase Test Phone Numbers (Recommended)

Supabase allows you to use test phone numbers that automatically verify with a specific OTP code.

1. **Go to Supabase Dashboard:**
   - Navigate to: **Authentication** → **Phone Auth** → **Settings**

2. **Enable Test Phone Numbers:**
   - Look for "Test Phone Numbers" or "Development Mode"
   - Add test phone numbers with their OTP codes

3. **Configure Test Phone:**
   ```
   Phone: +972509800301
   OTP: 123456 (or any 6-digit code you choose)
   ```

4. **Alternative: Use Supabase's Built-in Test Numbers:**
   - Supabase provides test numbers like `+15555551234`
   - But you'll need to update the driver's phone in the database to match

### Option 2: Set Test OTP via Supabase SQL

Run this SQL in Supabase SQL Editor to set a test OTP for your driver:

```sql
-- Note: Supabase doesn't allow direct OTP manipulation via SQL
-- Instead, use the Dashboard method above or the API method below
```

### Option 3: Use Supabase Admin API (Programmatic)

Create a test script or API route to set test OTP:

```typescript
// This would be in a test utility file
import { createClient } from '@supabase/supabase-js'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Set test OTP (Supabase Admin API)
// Note: This requires Supabase's test mode to be enabled
```

### Option 4: Supabase Development Mode (Easiest)

1. **In Supabase Dashboard:**
   - Go to **Authentication** → **Settings**
   - Enable **"Enable phone provider"**
   - Look for **"Test Mode"** or **"Development Mode"**
   - When enabled, Supabase will accept any OTP code for test numbers

2. **For Development:**
   - Use phone: `+972509800301`
   - Use any 6-digit OTP: `123456` or `000000`

---

## 🚀 Complete Testing Steps

### Prerequisites
1. Driver "Mister Clutchy" exists in `profiles` table
2. Phone number: `+972509800301` (stored in E.164 format)
3. Role: `driver` (verified in profiles table)

### Test Flow

1. **Start the Dev Server:**
   ```bash
   npm run dev
   ```

2. **Navigate to Login:**
   ```
   http://localhost:3000/login
   ```

3. **Enter Phone Number:**
   - Input: `0509800301` or `+972509800301`
   - System formats to: `+972509800301`
   - Click "שלח קוד אימות"

4. **Enter OTP:**
   - If using Supabase Test Mode: Enter `123456` (or your configured test OTP)
   - If using real SMS: Enter the code received via SMS

5. **Verify Redirection:**
   - Should redirect to: `http://localhost:3000/driver/dashboard`
   - Should NOT redirect to `/admin/dashboard`
   - Should show driver's name and dashboard interface

6. **Verify Middleware Protection:**
   - Try accessing `/admin/dashboard` directly
   - Should redirect back to `/login` (driver cannot access admin routes)

---

## 🔍 Debugging Tips

### Check Console Logs
The login page includes debug logs:
- `[DEBUG] Login - Original phone: ... Formatted: ...`
- Check browser console for any errors

### Verify Database
```sql
-- Check driver profile
SELECT id, phone, role, full_name, is_approved 
FROM profiles 
WHERE phone = '+972509800301';

-- Should return:
-- role: 'driver'
-- full_name: 'מיסטר קלאצי' (or 'Mister Clutchy')
```

### Verify Auth User
```sql
-- Check auth.users table (requires admin access)
SELECT id, phone, email, phone_confirmed_at
FROM auth.users
WHERE phone = '+972509800301';
```

### Common Issues

1. **"Phone number not found":**
   - Verify the phone in `profiles` table matches exactly (E.164 format)
   - Check for leading/trailing spaces

2. **"Invalid OTP":**
   - Ensure Supabase Test Mode is enabled
   - Or use the correct OTP from SMS
   - Check OTP hasn't expired (usually 5-10 minutes)

3. **"No role found":**
   - Verify `profiles.role = 'driver'` for this user
   - Check the profile was created correctly

4. **Wrong Redirect:**
   - Check `profiles.role` value in database
   - Verify middleware.ts is working correctly
   - Clear browser cookies and try again

---

## 📝 Quick Test Checklist

- [ ] Dev server running (`npm run dev`)
- [ ] Navigate to `/login`
- [ ] Enter phone: `0509800301`
- [ ] Click "שלח קוד אימות"
- [ ] Enter test OTP: `123456` (or configured test code)
- [ ] Click "אימות"
- [ ] ✅ Redirected to `/driver/dashboard`
- [ ] ✅ Driver name displayed
- [ ] ✅ Cannot access `/admin/dashboard` (redirects to login)

---

## 🎯 Expected Behavior

**Successful Login:**
1. Phone number accepted and formatted
2. OTP sent (or test mode accepts any code)
3. OTP verified successfully
4. User session created
5. Profile role checked: `driver`
6. Redirect to `/driver/dashboard`
7. Driver dashboard loads with:
   - Driver's name
   - Status toggle
   - Map view
   - Queue position (if online and in zone)

**Failed Login:**
- Invalid phone format → Error message in Hebrew
- Invalid OTP → "קוד אימות שגוי"
- No role found → "לא נמצא תפקיד למשתמש זה"
- Wrong role → Middleware redirects to `/login`

---

## 🔗 Related Files

- **Login Page:** `app/login/page.tsx`
- **Middleware:** `middleware.ts`
- **Driver Dashboard:** `app/driver/dashboard/page.tsx`
- **Phone Formatting:** `lib/toast-utils.ts` (formatPhoneNumber function)

