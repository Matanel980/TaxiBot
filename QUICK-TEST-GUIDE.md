# Quick Test Guide - Auto-Assign-Trip Function

## 🚀 Quick Test Commands

### Option 1: PowerShell Script (Windows)

```powershell
.\test-auto-assign-trip.ps1 -TripId "your-trip-uuid-here" -ServiceRoleKey "your-service-role-key-here"
```

### Option 2: Bash Script (Linux/Mac)

```bash
export SUPABASE_SERVICE_ROLE_KEY="your-service-role-key-here"
./test-auto-assign-trip.sh "your-trip-uuid-here"
```

### Option 3: Direct curl (Any Platform)

```bash
curl -X POST \
  'https://zfzahgxrmlwotdzpjvhz.supabase.co/functions/v1/auto-assign-trip' \
  -H 'Authorization: Bearer YOUR_SERVICE_ROLE_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"trip_id": "your-trip-uuid-here"}'
```

## 📋 Get Required Values

### 1. Get Service Role Key

1. Go to: **Supabase Dashboard → Settings → API**
2. Copy the `service_role` key (NOT the `anon` key)
3. Keep it secret!

### 2. Get Trip ID

**Option A: From Supabase Dashboard**
1. Go to: **Database → Table Editor → trips**
2. Find a trip with:
   - `status = 'pending'`
   - `driver_id = NULL`
   - `pickup_lat` and `pickup_lng` set
3. Copy the `id` (UUID)

**Option B: From SQL Editor**
```sql
SELECT id, status, driver_id, pickup_lat, pickup_lng 
FROM trips 
WHERE status = 'pending' 
  AND driver_id IS NULL 
  AND pickup_lat IS NOT NULL 
  AND pickup_lng IS NOT NULL
LIMIT 1;
```

## ✅ Expected Output

### Success Response

```json
{
  "success": true,
  "trip": {
    "id": "trip-uuid",
    "driver_id": "driver-uuid",
    "status": "pending",
    ...
  },
  "driver": {
    "id": "driver-uuid",
    "name": "Driver Name",
    "distance_meters": 1234.56
  },
  "push_notification_sent": true
}
```

### Error Response

```json
{
  "error": "Error message",
  "details": "Detailed error information"
}
```

## 🔍 Check Function Logs

After running the test, check the logs:

1. Go to: **Supabase Dashboard → Edge Functions → auto-assign-trip → Logs**
2. Look for logs with prefixes:
   - 🔵 = Information
   - ✅ = Success
   - ❌ = Error

You should see detailed logs showing:
- Function invocation
- Request parsing
- Trip fetching
- Driver search
- Assignment process

## 🐛 Troubleshooting

### Error: "trip_id is required"

**Cause:** Request body format incorrect

**Solution:** 
- For manual test: Use `{ "trip_id": "uuid" }`
- For webhook: Function automatically extracts from `{ record: { id: "uuid" } }`

### Error: "Trip not found"

**Cause:** Trip ID doesn't exist or RLS blocking access

**Solution:**
- Verify trip ID is correct
- Function uses service_role key (bypasses RLS)
- Check trip exists in database

### Error: "No available drivers found"

**Cause:** No online drivers match criteria

**Solution:**
- Verify drivers exist with `is_online = true`
- Verify drivers have `latitude` and `longitude` set
- Verify drivers are in same `zone_id` as trip (if trip has zone_id)
- Verify drivers are `is_approved = true`

### Error: 401 Unauthorized

**Cause:** Missing or incorrect Authorization header

**Solution:**
- Verify service_role key is correct
- Verify header format: `Bearer [key]` (space after "Bearer")
- Get fresh key from Dashboard → Settings → API

### Function Logs Show Nothing

**Cause:** Function not invoked or logs delayed

**Solution:**
- Wait a few seconds for logs to appear
- Check function is deployed: `supabase functions list`
- Verify URL is correct in webhook/request

---

**Need more help?** Check `WEBHOOK-CONFIGURATION-GUIDE.md` for detailed troubleshooting.





