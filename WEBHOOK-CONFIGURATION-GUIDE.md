# Database Webhook Configuration Guide

## ⚠️ Important: Database Webhook Payload Format

Supabase Database Webhooks send data in a **different format** than direct function invocations:

### Database Webhook Format (INSERT event)
```json
{
  "type": "INSERT",
  "table": "trips",
  "record": {
    "id": "trip-uuid",
    "customer_phone": "...",
    "pickup_address": "...",
    "destination_address": "...",
    "status": "pending",
    "driver_id": null,
    "pickup_lat": 32.9234,
    "pickup_lng": 35.0812,
    "zone_id": "zone-uuid",
    "created_at": "2026-01-01T12:00:00Z",
    "updated_at": "2026-01-01T12:00:00Z"
  },
  "old_record": null
}
```

### Direct Function Invocation Format
```json
{
  "trip_id": "trip-uuid"
}
```

**The Edge Function has been updated to handle BOTH formats!**

---

## ✅ Correct Webhook Configuration

### Webhook 1: Auto-Assign Trip (on INSERT)

**In Supabase Dashboard → Database → Webhooks:**

1. **Name:** `auto_assign_on_insert`

2. **Table:** `trips`

3. **Events:** `INSERT` only

4. **HTTP Request:**
   - **URL:** `https://zfzahgxrmlwotdzpjvhz.supabase.co/functions/v1/auto-assign-trip`
   - **Method:** `POST`
   - **Headers:**
     ```
     Authorization: Bearer [YOUR_SERVICE_ROLE_KEY]
     Content-Type: application/json
     ```
     ⚠️ **CRITICAL:** Must include `Authorization` header with `service_role` key!

5. **Payload Template:** Leave empty (default) - the webhook will send the full record

6. **Filter (Optional but Recommended):**
   ```sql
   status = 'pending' AND driver_id IS NULL AND pickup_lat IS NOT NULL AND pickup_lng IS NOT NULL
   ```
   
   This ensures the webhook only triggers for trips that need assignment.

---

## 🔍 How to Verify Webhook Configuration

### Step 1: Check Webhook Exists

1. Go to **Supabase Dashboard → Database → Webhooks**
2. Find `auto_assign_on_insert`
3. Verify it's **Enabled** (toggle should be ON)

### Step 2: Verify Headers

Click on the webhook to edit, and verify:

- ✅ **Authorization header exists**
- ✅ **Value starts with `Bearer `**
- ✅ **Uses `service_role` key** (not `anon` key)

**Get Service Role Key:**
- Supabase Dashboard → Settings → API
- Copy the `service_role` key (keep it secret!)

### Step 3: Verify URL

- ✅ URL should be: `https://zfzahgxrmlwotdzpjvhz.supabase.co/functions/v1/auto-assign-trip`
- ✅ Must use `https://` (not `http://`)
- ✅ Must include `/functions/v1/` in the path

### Step 4: Test the Webhook

#### Option A: Create a Test Trip

1. Create a trip in the `trips` table with:
   - `status = 'pending'`
   - `driver_id = NULL`
   - `pickup_lat` and `pickup_lng` set
   
2. Check Edge Function logs:
   ```
   Supabase Dashboard → Edge Functions → auto-assign-trip → Logs
   ```

3. Look for:
   - 🔵 Function invocation logs
   - ✅ Trip processing logs
   - ❌ Any error messages

#### Option B: Manual Test (curl)

Use the provided test script:

**PowerShell:**
```powershell
.\test-auto-assign-trip.ps1 -TripId "your-trip-uuid" -ServiceRoleKey "your-service-role-key"
```

**Bash:**
```bash
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
./test-auto-assign-trip.sh "your-trip-uuid"
```

**Direct curl:**
```bash
curl -X POST \
  'https://zfzahgxrmlwotdzpjvhz.supabase.co/functions/v1/auto-assign-trip' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"trip_id": "your-trip-uuid"}'
```

---

## 🔧 Troubleshooting

### Issue: Function Boots but Immediately Shuts Down

**Symptoms:**
- Function appears in logs
- Shows "booting" then "shutdown"
- No processing logs

**Possible Causes:**

1. **Missing Authorization Header**
   - ✅ Check webhook headers include `Authorization: Bearer [service_role_key]`
   - ✅ Verify service_role key is correct

2. **Invalid Request Body**
   - ✅ Function now handles both webhook format (`{ record: {...} }`) and direct format (`{ trip_id: "..." }`)
   - ✅ Check function logs for request body format

3. **Function Error Before Logging**
   - ✅ Check function logs for errors
   - ✅ Look for "❌" symbols in logs
   - ✅ Check for missing environment variables

### Issue: Function Not Triggered at All

**Symptoms:**
- No function logs when trip is created
- Webhook shows no invocations

**Possible Causes:**

1. **Webhook Not Enabled**
   - ✅ Check webhook toggle is ON
   - ✅ Verify webhook exists in Database → Webhooks

2. **Webhook Filter Too Restrictive**
   - ✅ Check filter conditions match your trip data
   - ✅ Try removing filter temporarily to test

3. **Table Trigger Missing**
   - ✅ Database Webhooks work automatically, no triggers needed
   - ✅ Verify you're using Database Webhooks (not pg_net triggers)

### Issue: 401 Unauthorized Error

**Symptoms:**
- Function logs show authentication error
- HTTP 401 status code

**Solution:**
- ✅ Verify `Authorization` header is set correctly
- ✅ Verify service_role key is correct (get fresh copy from Dashboard)
- ✅ Verify header format: `Bearer [key]` (space after "Bearer")

### Issue: Function Processes but Trip Not Assigned

**Symptoms:**
- Function logs show execution
- No errors in logs
- Trip remains unassigned

**Possible Causes:**

1. **No Available Drivers**
   - ✅ Check logs for "No available drivers found"
   - ✅ Verify drivers exist with `is_online = true`
   - ✅ Verify drivers have `latitude` and `longitude` set
   - ✅ Verify drivers are in the same `zone_id` as trip (if trip has zone_id)

2. **Trip Already Assigned**
   - ✅ Check if trip already has `driver_id` set
   - ✅ Check if trip status is not 'pending'

---

## 📝 Testing Checklist

- [ ] Webhook exists in Database → Webhooks
- [ ] Webhook is enabled (toggle ON)
- [ ] Authorization header is set with service_role key
- [ ] URL is correct (includes `/functions/v1/auto-assign-trip`)
- [ ] Function is deployed (Edge Functions → auto-assign-trip exists)
- [ ] Service role key is correct (get fresh copy)
- [ ] Test trip created with correct format
- [ ] Function logs show invocation
- [ ] Function logs show processing (not just boot/shutdown)

---

## 🔄 Updated Function Code

The Edge Function now:
- ✅ Logs all request details at the start
- ✅ Handles Database Webhook format (`{ record: { id: "..." } }`)
- ✅ Handles direct invocation format (`{ trip_id: "..." }`)
- ✅ Provides detailed error messages
- ✅ Logs every step of processing

Check function logs for detailed debugging information!





