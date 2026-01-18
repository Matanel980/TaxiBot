# Exact Deployment Commands

**Project ID:** `zfzahgxrmlwotdzpjvhz`  
**Status:** Secrets configured in Dashboard ✅

---

## Step 1: Link Project

```bash
supabase link --project-ref zfzahgxrmlwotdzpjvhz
```

**Expected Output:**
```
✓ Linked to zfzahgxrmlwotdzpjvhz
```

---

## Step 2: Deploy auto-assign-trip Function

```bash
supabase functions deploy auto-assign-trip
```

**Expected Output:**
```
Deploying function auto-assign-trip...
✓ Deployed function auto-assign-trip (version: 1.0.0)
```

---

## Step 3: Deploy send-push-notification Function

```bash
supabase functions deploy send-push-notification
```

**Expected Output:**
```
Deploying function send-push-notification...
✓ Deployed function send-push-notification (version: 1.0.0)
```

---

## ✅ Verification: Secret Names

Your code uses these exact secret names (all match your Dashboard configuration):

### auto-assign-trip function:
- `SUPABASE_URL` (automatically available)
- `SUPABASE_SERVICE_ROLE_KEY` (automatically available)

### send-push-notification function:
- `SUPABASE_URL` (automatically available)
- `SUPABASE_SERVICE_ROLE_KEY` (automatically available)
- `VAPID_PUBLIC_KEY` ✅ (matches your Dashboard)
- `VAPID_PRIVATE_KEY` ✅ (matches your Dashboard)
- `VAPID_SUBJECT` (optional, has default fallback)

**Note:** `WEBHOOK_SECRET_KEY` is used by Next.js API routes (`/api/webhooks/trips/create`), not by Edge Functions, so it doesn't need to be set for Edge Functions.

---

## Quick One-Liner (All Commands)

```bash
supabase link --project-ref zfzahgxrmlwotdzpjvhz && supabase functions deploy auto-assign-trip && supabase functions deploy send-push-notification
```

---

## After Deployment

Once deployed, your functions will be available at:
- `https://zfzahgxrmlwotdzpjvhz.supabase.co/functions/v1/auto-assign-trip`
- `https://zfzahgxrmlwotdzpjvhz.supabase.co/functions/v1/send-push-notification`

Next step: Set up Database Webhooks in Supabase Dashboard.





