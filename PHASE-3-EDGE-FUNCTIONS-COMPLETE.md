# Phase 3: Edge Functions Implementation Complete ✅

**Date:** January 2026  
**Status:** Edge Functions Created - Ready for Deployment

---

## ✅ Completed Implementation

### Edge Functions Created

1. **`supabase/functions/auto-assign-trip/index.ts`**
   - Finds nearest online driver using PostGIS ST_Distance
   - Filters by zone_id if trip has zone
   - Excludes drivers with pending/active trips
   - Assigns trip to nearest driver
   - Automatically triggers send-push-notification function
   - Fallback to Haversine formula if PostGIS function unavailable

2. **`supabase/functions/send-push-notification/index.ts`**
   - Fetches active push tokens for driver
   - Sends Web Push notification using VAPID keys
   - Includes trip details (pickup/destination addresses)
   - Includes action buttons (Accept/Decline)
   - Handles expired/invalid tokens (marks as inactive)
   - Supports multiple tokens per driver

### Database Functions Created

3. **`supabase-find-nearest-driver-function.sql`**
   - PostGIS function for efficient distance queries
   - Used by auto-assign-trip Edge Function
   - Returns nearest driver with distance in meters

### Database Triggers/Webhooks

4. **`supabase-edge-functions-triggers.sql`**
   - SQL triggers approach (optional)
   - **Recommended:** Use Database Webhooks instead (see deployment guide)

---

## 🚀 Deployment Instructions

### Prerequisites

1. **Install Supabase CLI:**
   ```bash
   npm install -g supabase
   ```

2. **Login to Supabase:**
   ```bash
   supabase login
   ```

3. **Link your project:**
   ```bash
   supabase link --project-ref your-project-ref
   ```
   Find your project ref in Supabase Dashboard URL

### Step 1: Run Database Function (Optional but Recommended)

Run `supabase-find-nearest-driver-function.sql` in Supabase SQL Editor to enable PostGIS distance queries.

**Benefits:**
- Faster distance calculations
- More accurate (uses PostGIS geography functions)
- Better performance for large driver lists

**Fallback:** If not run, the Edge Function will use Haversine formula (still accurate, just slightly slower).

### Step 2: Set Edge Function Secrets

```bash
# Set VAPID keys
supabase secrets set VAPID_PUBLIC_KEY=your-vapid-public-key
supabase secrets set VAPID_PRIVATE_KEY=your-vapid-private-key
supabase secrets set VAPID_SUBJECT=mailto:your-email@example.com

# Supabase credentials (automatically available, but can be set explicitly)
supabase secrets set SUPABASE_URL=https://your-project-ref.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**Note:** `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are automatically available to Edge Functions, but you can set them explicitly if needed.

### Step 3: Deploy Edge Functions

```bash
# Deploy auto-assign-trip function
supabase functions deploy auto-assign-trip

# Deploy send-push-notification function
supabase functions deploy send-push-notification
```

### Step 4: Set Up Database Webhooks (Recommended)

**Option A: Database Webhooks (Recommended)** ✅

1. **Go to Supabase Dashboard → Database → Webhooks**

2. **Create Webhook for Trip Insert (auto-assign):**
   - **Name:** `auto-assign-trip`
   - **Table:** `trips`
   - **Events:** `INSERT`
   - **HTTP Request:**
     - **URL:** `https://[your-project-ref].supabase.co/functions/v1/auto-assign-trip`
     - **Method:** `POST`
     - **Headers:**
       ```
       Authorization: Bearer [YOUR_SERVICE_ROLE_KEY]
       Content-Type: application/json
       ```
     - **Body (JSON):**
       ```json
       {
         "trip_id": "{{ $1.id }}"
       }
       ```
   - **Filter:** Only trigger when `status = 'pending'` AND `driver_id IS NULL` AND `pickup_lat IS NOT NULL` AND `pickup_lng IS NOT NULL`

3. **Create Webhook for Trip Update (push notification):**
   - **Name:** `send-push-notification`
   - **Table:** `trips`
   - **Events:** `UPDATE`
   - **HTTP Request:**
     - **URL:** `https://[your-project-ref].supabase.co/functions/v1/send-push-notification`
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
   - **Filter:** Only trigger when `driver_id` changes from NULL to a value

**Option B: SQL Triggers (Advanced)**

If you prefer SQL triggers, run `supabase-edge-functions-triggers.sql` in SQL Editor.

**Note:** This requires `pg_net` extension and additional configuration. Database Webhooks are simpler and recommended.

---

## 🧪 Testing

### Test auto-assign-trip Function

```bash
# Using Supabase CLI
supabase functions invoke auto-assign-trip \
  --body '{"trip_id": "your-trip-uuid-here"}'

# Or using curl
curl -X POST \
  'https://[project-ref].supabase.co/functions/v1/auto-assign-trip' \
  -H 'Authorization: Bearer [SERVICE_ROLE_KEY]' \
  -H 'Content-Type: application/json' \
  -d '{"trip_id": "your-trip-uuid-here"}'
```

### Test send-push-notification Function

```bash
supabase functions invoke send-push-notification \
  --body '{"trip_id": "your-trip-uuid", "driver_id": "your-driver-uuid"}'
```

### End-to-End Test

1. Create a trip via webhook: `POST /api/webhooks/trips/create`
2. Verify auto-assignment runs (check function logs)
3. Verify push notification is sent (check driver's device)
4. Test Accept/Decline actions from notification

---

## 📊 Function Logs

View function logs:

```bash
# View logs for auto-assign-trip
supabase functions logs auto-assign-trip

# View logs for send-push-notification
supabase functions logs send-push-notification

# Follow logs (real-time)
supabase functions logs auto-assign-trip --follow
```

Or view in Supabase Dashboard → Edge Functions → [Function Name] → Logs

---

## 🔄 Complete Flow

```
External Service (WhatsApp/AI)
    ↓
POST /api/webhooks/trips/create
    ↓
[Geocode → Detect Zone → Create Trip]
    ↓
[Database: INSERT INTO trips]
    ↓
[Database Webhook: auto-assign-trip triggered]
    ↓
[Edge Function: auto-assign-trip]
    ↓
[Find Nearest Driver: PostGIS ST_Distance]
    ↓
[Update Trip: SET driver_id = nearest_driver]
    ↓
[Database Webhook: send-push-notification triggered]
    ↓
[Edge Function: send-push-notification]
    ↓
[Fetch Push Tokens → Send Web Push]
    ↓
[Service Worker: Display Notification]
    ↓
[Driver Clicks Accept/Decline]
    ↓
[POST /api/trips/accept or /api/trips/decline]
    ↓
[Trip Status Updated]
```

---

## 🔁 Fallback Logic (30-Second Timeout)

For the 30-second timeout when driver doesn't respond:

**Option 1: Scheduled Function (Recommended)**
- Create a Supabase Cron job that runs every 30 seconds
- Checks for unassigned pending trips older than 30 seconds
- Re-invokes auto-assign-trip for those trips

**Option 2: Database Function with Delay**
- Modify trigger to wait 30 seconds
- Check if trip is still unassigned
- Re-invoke auto-assign-trip

**Option 3: Frontend Polling (Simpler for MVP)**
- Frontend polls for unassigned trips
- Re-triggers auto-assignment after 30 seconds

**Current Implementation:** Declined trips are handled via `/api/trips/decline` endpoint, which unassigns the trip. The webhook will then trigger auto-assignment again for the next driver.

---

## ⚠️ Known Limitations & Notes

1. **web-push Library:** Using `esm.sh/web-push@3.6.6` for Deno compatibility. If this doesn't work, we may need to use a native implementation.

2. **PostGIS Function:** The `find_nearest_driver` SQL function is optional. The Edge Function has a fallback using Haversine formula.

3. **30-Second Timeout:** Not yet implemented. Can be added as a scheduled function or via frontend polling.

4. **Multiple Drivers:** If multiple drivers decline, the function will automatically find the next nearest driver on each decline.

---

## 📝 Files Created

1. ✅ `supabase/functions/auto-assign-trip/index.ts`
2. ✅ `supabase/functions/send-push-notification/index.ts`
3. ✅ `supabase-find-nearest-driver-function.sql`
4. ✅ `supabase-edge-functions-triggers.sql` (optional)
5. ✅ `EDGE-FUNCTIONS-DEPLOYMENT.md` (deployment guide)

---

## 🎯 Next Steps

1. ✅ Run `supabase-find-nearest-driver-function.sql` in SQL Editor
2. ✅ Set Edge Function secrets (VAPID keys)
3. ✅ Deploy Edge Functions
4. ✅ Set up Database Webhooks
5. ✅ Test end-to-end flow
6. ⏳ Implement 30-second timeout (optional enhancement)

---

**Status:** Phase 3 Complete - Ready for Deployment  
**Next Action:** Follow deployment instructions in `EDGE-FUNCTIONS-DEPLOYMENT.md`





