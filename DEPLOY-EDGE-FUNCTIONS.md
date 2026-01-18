# 🚀 Edge Functions Deployment Guide - Production

**Project ID:** `zfzahgxrmlwotdzpjvhz`  
**Date:** January 2026

---

## 📋 Pre-Deployment Checklist

- [ ] Supabase CLI installed (`npm install -g supabase`)
- [ ] `.env.local` file has all required VAPID keys
- [ ] Database migrations applied (push_tokens table exists)
- [ ] PostGIS extension enabled in Supabase

---

## Step 1: Login to Supabase CLI

```bash
supabase login
```

This will open your browser for authentication. After login, you'll be authenticated.

---

## Step 2: Link Project to Your Supabase Project

```bash
supabase link --project-ref zfzahgxrmlwotdzpjvhz
```

**Expected Output:**
```
Linked to zfzahgxrmlwotdzpjvhz
```

---

## Step 3: Set Edge Function Secrets

Run these commands to set the secrets (replace with your actual values from `.env.local`):

```bash
# Get values from .env.local first, then run:

supabase secrets set VAPID_PUBLIC_KEY="your-vapid-public-key-here"
supabase secrets set VAPID_PRIVATE_KEY="your-vapid-private-key-here"
supabase secrets set VAPID_SUBJECT="mailto:your-email@example.com"
```

**Note:** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically available to Edge Functions, so you don't need to set them explicitly.

**Verify secrets are set:**
```bash
supabase secrets list
```

---

## Step 4: Deploy Edge Functions

Deploy both functions:

```bash
# Deploy auto-assign-trip function
supabase functions deploy auto-assign-trip

# Deploy send-push-notification function
supabase functions deploy send-push-notification
```

**Expected Output:**
```
Deploying function auto-assign-trip...
Function auto-assign-trip deployed successfully.
Deploying function send-push-notification...
Function send-push-notification deployed successfully.
```

**Function URLs:**
- `https://zfzahgxrmlwotdzpjvhz.supabase.co/functions/v1/auto-assign-trip`
- `https://zfzahgxrmlwotdzpjvhz.supabase.co/functions/v1/send-push-notification`

---

## Step 5: Run Database Function (PostGIS Helper)

**IMPORTANT:** Run this SQL in Supabase SQL Editor BEFORE testing:

```sql
-- ============================================
-- Database Function: Find Nearest Driver
-- Used by auto-assign-trip Edge Function
-- ============================================

-- Function to find nearest driver using PostGIS ST_Distance
CREATE OR REPLACE FUNCTION find_nearest_driver(
  pickup_lat DOUBLE PRECISION,
  pickup_lng DOUBLE PRECISION,
  zone_id_filter UUID DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  full_name TEXT,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  distance_meters DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT 
    p.id,
    p.full_name,
    p.latitude,
    p.longitude,
    ST_Distance(
      ST_SetSRID(ST_MakePoint(p.longitude, p.latitude), 4326)::geography,
      ST_SetSRID(ST_MakePoint(pickup_lng, pickup_lat), 4326)::geography
    ) AS distance_meters
  FROM profiles p
  WHERE p.role = 'driver'
    AND p.is_online = true
    AND p.is_approved = true
    AND p.latitude IS NOT NULL
    AND p.longitude IS NOT NULL
    AND (zone_id_filter IS NULL OR p.current_zone = zone_id_filter)
    AND p.id NOT IN (
      SELECT t.driver_id 
      FROM trips t
      WHERE t.status IN ('pending', 'active') 
        AND t.driver_id IS NOT NULL
    )
  ORDER BY distance_meters ASC
  LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION find_nearest_driver TO authenticated;
GRANT EXECUTE ON FUNCTION find_nearest_driver TO service_role;
```

**Run in:** Supabase Dashboard → SQL Editor → New Query → Paste → Run

---

## Step 6: PostGIS Verification

Run this SQL to verify PostGIS is enabled and the function works:

```sql
-- ============================================
-- PostGIS Verification & Permission Check
-- ============================================

-- 1. Check if PostGIS extension is enabled
SELECT * FROM pg_extension WHERE extname = 'postgis';

-- Expected: Should return at least one row with extname = 'postgis'

-- 2. Verify PostGIS functions are available
SELECT ST_Distance(
  ST_SetSRID(ST_MakePoint(32.9, 35.1), 4326)::geography,
  ST_SetSRID(ST_MakePoint(32.91, 35.11), 4326)::geography
) AS test_distance_meters;

-- Expected: Should return a distance in meters (~1388 meters)

-- 3. Verify find_nearest_driver function exists
SELECT 
  p.proname AS function_name,
  pg_get_function_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS return_type
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE n.nspname = 'public' 
  AND p.proname = 'find_nearest_driver';

-- Expected: Should return function definition

-- 4. Test function permissions (this should work if you're admin/service_role)
-- Note: This requires at least one online driver in the database
SELECT * FROM find_nearest_driver(32.9, 35.1, NULL) LIMIT 1;

-- Expected: Either returns a driver (if available) or empty result (if no drivers)
```

**If any check fails:**
- PostGIS not enabled → Enable it in Supabase Dashboard → Database → Extensions
- Function not found → Re-run Step 5 SQL
- Permission denied → Check RLS policies (service_role should have access)

---

## Step 7: Set Up Database Webhooks (Recommended)

Go to **Supabase Dashboard → Database → Webhooks**

### Webhook 1: Auto-Assign Trip (on INSERT)

- **Name:** `auto_assign_on_insert` (or `auto-assign-trip`)
- **Table:** `trips`
- **Events:** `INSERT`
- **HTTP Request:**
  - **URL:** `https://zfzahgxrmlwotdzpjvhz.supabase.co/functions/v1/auto-assign-trip`
  - **Method:** `POST`
  - **Headers:**
    ```
    Authorization: Bearer [YOUR_SERVICE_ROLE_KEY]
    Content-Type: application/json
    ```
    ⚠️ **CRITICAL:** The `Authorization` header is REQUIRED! Without it, the function will reject the request.
  - **Body (JSON):** 
    - **Leave empty** (default) - Database Webhooks automatically send the full record in format:
      ```json
      {
        "type": "INSERT",
        "table": "trips",
        "record": {
          "id": "trip-uuid",
          "status": "pending",
          "driver_id": null,
          ...
        }
      }
      ```
    - The Edge Function automatically extracts `trip_id` from `record.id`
- **Filter (Optional but Recommended):**
  ```sql
  status = 'pending' AND driver_id IS NULL AND pickup_lat IS NOT NULL AND pickup_lng IS NOT NULL
  ```
  This ensures the webhook only triggers for trips that need assignment.

### Webhook 2: Send Push Notification (on UPDATE)

- **Name:** `send-push-notification`
- **Table:** `trips`
- **Events:** `UPDATE`
- **HTTP Request:**
  - **URL:** `https://zfzahgxrmlwotdzpjvhz.supabase.co/functions/v1/send-push-notification`
  - **Method:** `POST`
  - **Headers:**
    ```
    Authorization: Bearer [YOUR_SERVICE_ROLE_KEY]
    Content-Type: application/json
    ```
  - **Body (JSON):**
    ```json
    {
      "trip_id": "{{ $1.id }}",
      "driver_id": "{{ $1.driver_id }}"
    }
    ```
- **Filter:**
  - Trigger when `driver_id` changes from NULL to a value

**Get Service Role Key:** Supabase Dashboard → Settings → API → `service_role` key (keep it secret!)

---

## Step 8: Test Deployment

### Test auto-assign-trip Function

```bash
# First, create a test trip via webhook or admin panel
# Then invoke the function (replace TRIP_UUID with actual trip ID):

supabase functions invoke auto-assign-trip \
  --body '{"trip_id": "TRIP_UUID_HERE"}'
```

Or using curl:

```bash
curl -X POST \
  'https://zfzahgxrmlwotdzpjvhz.supabase.co/functions/v1/auto-assign-trip' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"trip_id": "TRIP_UUID_HERE"}'
```

### Test send-push-notification Function

```bash
supabase functions invoke send-push-notification \
  --body '{"trip_id": "TRIP_UUID", "driver_id": "DRIVER_UUID"}'
```

### View Function Logs

```bash
# View logs for auto-assign-trip
supabase functions logs auto-assign-trip

# View logs for send-push-notification
supabase functions logs send-push-notification

# Follow logs (real-time)
supabase functions logs auto-assign-trip --follow
```

Or view in: **Supabase Dashboard → Edge Functions → [Function Name] → Logs**

---

## ✅ Deployment Complete Checklist

- [ ] Supabase CLI logged in
- [ ] Project linked to `zfzahgxrmlwotdzpjvhz`
- [ ] Secrets set (VAPID keys)
- [ ] Both functions deployed successfully
- [ ] Database function `find_nearest_driver` created
- [ ] PostGIS verified and working
- [ ] Database webhooks configured
- [ ] Functions tested and logs reviewed

---

## 🔍 Troubleshooting

### Function Deployment Fails

- **Error:** "Function not found"
  - **Solution:** Make sure you're in the project root directory (`C:\Dev\TaxiBot`)

- **Error:** "Authentication failed"
  - **Solution:** Run `supabase login` again

### Function Execution Fails

- **Error:** "VAPID keys not configured"
  - **Solution:** Verify secrets with `supabase secrets list`

- **Error:** "Trip not found" or "No available drivers"
  - **Solution:** Check function logs for details, verify database has test data

### PostGIS Errors

- **Error:** "function ST_Distance does not exist"
  - **Solution:** Enable PostGIS extension in Supabase Dashboard → Database → Extensions

- **Error:** "permission denied for function"
  - **Solution:** Re-run Step 5 SQL to grant permissions

---

## 📝 Next Steps After Deployment

1. **Test End-to-End Flow:**
   - Create trip via webhook → Auto-assign → Push notification → Accept/Decline

2. **Monitor Function Logs:**
   - Check for errors in first few days
   - Monitor execution time and costs

3. **Set Up Alerts (Optional):**
   - Supabase Dashboard → Edge Functions → Alerts
   - Set up alerts for function failures

---

**Status:** Ready for Production Deployment  
**Last Updated:** January 2026

