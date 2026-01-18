# Edge Functions Deployment Guide

**Complete guide for deploying Supabase Edge Functions for Push Notifications**

---

## Prerequisites

1. **Supabase CLI** installed globally:
   ```bash
   npm install -g supabase
   ```

2. **Deno** (Edge Functions runtime) - automatically installed with Supabase CLI

3. **Supabase Project** - Your project URL and service role key

---

## Step 1: Initialize Supabase (if not already done)

If you haven't initialized Supabase in your project:

```bash
cd C:\Dev\TaxiBot
supabase init
```

This creates a `supabase/config.toml` file. **Do not commit this file** if it contains secrets.

---

## Step 2: Link to Your Supabase Project

Link your local project to your Supabase project:

```bash
supabase link --project-ref your-project-ref
```

You can find your project ref in the Supabase Dashboard URL:
- URL: `https://app.supabase.com/project/abcdefghijklmnop`
- Project ref: `abcdefghijklmnop`

Or use:
```bash
supabase link
```
This will prompt you to select your project interactively.

---

## Step 3: Set Environment Secrets

Set the required secrets for Edge Functions:

```bash
# VAPID keys (from .env.local)
supabase secrets set VAPID_PUBLIC_KEY=your-vapid-public-key
supabase secrets set VAPID_PRIVATE_KEY=your-vapid-private-key
supabase secrets set VAPID_SUBJECT=mailto:your-email@example.com

# Supabase credentials (automatically available, but can be set explicitly)
supabase secrets set SUPABASE_URL=https://your-project-ref.supabase.co
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

**Note:** Secrets are stored securely in Supabase and are available to Edge Functions via `Deno.env.get()`.

---

## Step 4: Deploy Edge Functions

Deploy both functions:

```bash
# Deploy auto-assign-trip function
supabase functions deploy auto-assign-trip

# Deploy send-push-notification function
supabase functions deploy send-push-notification
```

---

## Step 5: Set Up Database Triggers (Choose One Approach)

### Option A: Database Webhooks (Recommended) ✅

Database Webhooks are simpler and more reliable than SQL triggers.

1. **Go to Supabase Dashboard → Database → Webhooks**

2. **Create Webhook for Trip Insert (auto-assign):**
   - Name: `auto-assign-trip`
   - Table: `trips`
   - Events: `INSERT`
   - HTTP Request:
     - URL: `https://your-project-ref.supabase.co/functions/v1/auto-assign-trip`
     - Method: `POST`
     - Headers:
       - `Authorization: Bearer YOUR_SERVICE_ROLE_KEY`
       - `Content-Type: application/json`
     - Body:
       ```json
       {
         "trip_id": "{{ $1.id }}"
       }
       ```
   - Filter: Only trigger when `status = 'pending'` AND `driver_id IS NULL`

3. **Create Webhook for Trip Update (push notification):**
   - Name: `send-push-notification`
   - Table: `trips`
   - Events: `UPDATE`
   - HTTP Request:
     - URL: `https://your-project-ref.supabase.co/functions/v1/send-push-notification`
     - Method: `POST`
     - Headers:
       - `Authorization: Bearer YOUR_SERVICE_ROLE_KEY`
       - `Content-Type: application/json`
     - Body:
       ```json
       {
         "trip_id": "{{ $1.id }}",
         "driver_id": "{{ $1.driver_id }}"
       }
       ```
   - Filter: Only trigger when `driver_id` changes from NULL to a value

### Option B: SQL Triggers (Advanced)

If you prefer SQL triggers, run `supabase-edge-functions-triggers.sql` in the SQL Editor.

**Note:** This requires `pg_net` extension and environment variables setup. Database Webhooks are recommended.

---

## Step 6: Test the Functions

### Test auto-assign-trip:

```bash
# Using Supabase CLI
supabase functions invoke auto-assign-trip \
  --body '{"trip_id": "your-trip-uuid-here"}'

# Or using curl
curl -X POST \
  'https://your-project-ref.supabase.co/functions/v1/auto-assign-trip' \
  -H 'Authorization: Bearer YOUR_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"trip_id": "your-trip-uuid-here"}'
```

### Test send-push-notification:

```bash
supabase functions invoke send-push-notification \
  --body '{"trip_id": "your-trip-uuid", "driver_id": "your-driver-uuid"}'
```

---

## Step 7: Monitor Function Logs

View function logs in real-time:

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

## Function URLs

After deployment, your functions will be available at:

- **auto-assign-trip:** `https://[project-ref].supabase.co/functions/v1/auto-assign-trip`
- **send-push-notification:** `https://[project-ref].supabase.co/functions/v1/send-push-notification`

---

## Troubleshooting

### Function Not Invoking

1. **Check webhook configuration:**
   - Verify URL is correct
   - Verify Authorization header has service_role_key
   - Check webhook is enabled

2. **Check function logs:**
   ```bash
   supabase functions logs auto-assign-trip
   ```

3. **Verify secrets are set:**
   ```bash
   supabase secrets list
   ```

### Push Notification Not Sending

1. **Check VAPID keys:**
   - Verify keys are set correctly
   - Keys must match the ones used in the frontend

2. **Check push tokens:**
   - Verify driver has active push tokens
   - Check tokens haven't expired

3. **Check function logs for errors:**
   ```bash
   supabase functions logs send-push-notification
   ```

### Auto-Assignment Not Finding Drivers

1. **Check PostGIS extension:**
   ```sql
   SELECT * FROM pg_extension WHERE extname = 'postgis';
   ```

2. **Verify driver locations:**
   - Drivers must have `latitude` and `longitude` set
   - Drivers must be `is_online = true`
   - Drivers must be `is_approved = true`

3. **Check zone matching:**
   - Verify trip has `zone_id` set
   - Verify drivers have `current_zone` matching trip's `zone_id`

---

## Fallback Logic (30-Second Timeout)

The auto-assignment function will be triggered again if:
- Driver declines the trip (via `/api/trips/decline`)
- Trip remains unassigned after 30 seconds

To implement the 30-second timeout, you can:

1. **Use a scheduled function** (Supabase Cron):
   - Create a cron job that runs every 30 seconds
   - Check for unassigned pending trips
   - Re-invoke auto-assign-trip for those trips

2. **Use a database function with delay:**
   - Modify the trigger to wait 30 seconds
   - Check if trip is still unassigned
   - Re-invoke auto-assign-trip

3. **Frontend polling** (simpler):
   - Frontend can poll for unassigned trips
   - Re-trigger auto-assignment after 30 seconds

**Recommended:** For MVP, use Database Webhooks with retry logic. The 30-second timeout can be implemented later as an enhancement.

---

## Cost Considerations

- **Edge Functions:** Free tier includes 500K invocations/month
- **Database Webhooks:** Included in database plan
- **Function Execution Time:** First 500K seconds/month are free

For 1,000 trips/day:
- ~30K invocations/month (well within free tier)
- Estimated cost: **$0/month**

---

## Next Steps

After deployment:

1. ✅ Test trip creation via webhook
2. ✅ Verify auto-assignment works
3. ✅ Verify push notifications are sent
4. ✅ Test notification actions (Accept/Decline)
5. ✅ Monitor function logs for errors

---

## Support

- **Supabase Edge Functions Docs:** https://supabase.com/docs/guides/functions
- **Database Webhooks Docs:** https://supabase.com/docs/guides/database/webhooks
- **Function Logs:** View in Dashboard or via CLI

---

**Status:** Ready for deployment  
**Last Updated:** January 2026





