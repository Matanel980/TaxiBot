# Local Testing Guide

**Project ID:** `zfzahgxrmlwotdzpjvhz`  
**Purpose:** Test UI, authentication, and location services locally before cloud deployment

---

## 📋 Pre-Flight Checklist

- [ ] `.env.local` file exists and is configured
- [ ] Dependencies installed (`node_modules` exists)
- [ ] Supabase project URL matches `zfzahgxrmlwotdzpjvhz`
- [ ] Google Maps API key is set

---

## Step 1: Verify .env.local Configuration

Your `.env.local` file should contain these variables:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://zfzahgxrmlwotdzpjvhz.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# Google Maps API Key
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-api-key-here

# VAPID Keys (for push notifications - optional for local testing)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=your-vapid-public-key
VAPID_PRIVATE_KEY=your-vapid-private-key
VAPID_SUBJECT=mailto:your-email@example.com

# Webhook Secrets (optional for local testing)
WEBHOOK_SECRET_KEY=your-webhook-secret-key
```

**To verify your Supabase URL matches project ID:**
- Project ID: `zfzahgxrmlwotdzpjvhz`
- URL should be: `https://zfzahgxrmlwotdzpjvhz.supabase.co`

**To get your Supabase keys:**
1. Go to: https://app.supabase.com/project/zfzahgxrmlwotdzpjvhz/settings/api
2. Copy:
   - **Project URL** → `NEXT_PUBLIC_SUPABASE_URL`
   - **anon public** key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** key → `SUPABASE_SERVICE_ROLE_KEY` (keep secret!)

---

## Step 2: Install Dependencies

If `node_modules` doesn't exist, install dependencies:

```bash
npm install
```

**Expected output:**
```
added X packages, and audited Y packages in Zs
```

---

## Step 3: Verify Google Maps API Key

The Google Maps API key is used in these components:
- Driver map (real-time location tracking)
- Admin map (fleet tracking)
- Zone editor (drawing polygons)
- Geocoding (address to coordinates conversion)

**To verify the key is set:**
```bash
# PowerShell
$env:NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

# Or check in .env.local file
```

**To get/verify your Google Maps API Key:**
1. Go to: https://console.cloud.google.com/apis/credentials
2. Find your API key or create a new one
3. Ensure these APIs are enabled:
   - Maps JavaScript API
   - Geocoding API
   - Places API (optional, for address autocomplete)

**Important:** Make sure your API key has these restrictions (for security):
- Application restrictions: HTTP referrers
- Add: `http://localhost:3000/*`
- Add: `http://localhost:3001/*` (if using different port)

---

## Step 4: Start Development Server

Run the development server:

```bash
npm run dev
```

**Expected output:**
```
> taxibot@1.0.0 dev
> next dev

   ▲ Next.js 16.1.1
   - Local:        http://localhost:3000
   - Network:      http://192.168.x.x:3000

 ✓ Ready in Xs
```

**If you see errors:**
- **Port 3000 in use:** Next.js will automatically use 3001, 3002, etc.
- **Module not found:** Run `npm install` again
- **Environment variables not found:** Check `.env.local` file exists and has correct values

---

## Step 5: Test Application

### 5.1 Test Authentication

1. Open browser: `http://localhost:3000`
2. You should be redirected to `/login`
3. Test driver login with phone authentication
4. Test admin login (if configured)

### 5.2 Test Driver Dashboard

1. Login as a driver
2. Verify:
   - Map loads (Google Maps should render)
   - Location permission prompt appears
   - "Go Online" toggle works
   - Push notification permission prompt appears (when going online)

### 5.3 Test Admin Dashboard

1. Login as admin
2. Verify:
   - Admin dashboard loads
   - Map shows driver locations
   - Zone editor works
   - Trip creation works

### 5.4 Test Location Services

1. As a driver, enable location services
2. Verify:
   - Browser prompts for location permission
   - Map centers on your location
   - Location updates in real-time
   - Driver position appears on admin map

---

## 🔍 Troubleshooting

### Issue: "Module not found" errors

**Solution:**
```bash
# Delete node_modules and reinstall
rm -r node_modules
npm install
```

### Issue: Google Maps not loading

**Symptoms:**
- Map shows gray/blank area
- Console error: "Google Maps API key not found"

**Solution:**
1. Verify `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` is in `.env.local`
2. Restart dev server (environment variables are loaded at startup)
3. Check browser console for specific API key errors
4. Verify API key is enabled in Google Cloud Console

### Issue: Supabase connection errors

**Symptoms:**
- Authentication fails
- "Invalid API key" errors

**Solution:**
1. Verify `NEXT_PUBLIC_SUPABASE_URL` matches: `https://zfzahgxrmlwotdzpjvhz.supabase.co`
2. Verify `NEXT_PUBLIC_SUPABASE_ANON_KEY` is correct
3. Get fresh keys from: https://app.supabase.com/project/zfzahgxrmlwotdzpjvhz/settings/api

### Issue: Environment variables not loading

**Solution:**
1. Ensure file is named exactly `.env.local` (not `.env` or `.env.local.txt`)
2. Restart dev server (env vars are loaded at startup)
3. Check file is in project root (same directory as `package.json`)

### Issue: Port already in use

**Solution:**
```bash
# Use different port
npm run dev -- -p 3001

# Or kill process using port 3000 (Windows PowerShell)
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

---

## ✅ Success Criteria

Before proceeding to cloud testing, verify:

- [ ] Application starts without errors
- [ ] Driver login works
- [ ] Admin login works
- [ ] Maps load correctly (Google Maps renders)
- [ ] Location services work (browser prompts, location updates)
- [ ] Driver can go online/offline
- [ ] Admin can see drivers on map
- [ ] No console errors in browser DevTools

---

## 📝 Next Steps

After successful local testing:

1. ✅ Verify Edge Functions are deployed (you've already done this)
2. ✅ Set up Database Webhooks in Supabase Dashboard
3. ✅ Test end-to-end flow: Create trip → Auto-assign → Push notification
4. ✅ Test on mobile device (for push notifications)

---

**Status:** Ready for Local Testing  
**Last Updated:** January 2026





