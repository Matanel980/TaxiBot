# Push Notifications Setup Instructions

**Quick setup guide for implementing push notifications and webhooks**

---

## Step 1: Generate Credentials ⚠️ **REQUIRED FIRST**

See `CREDENTIALS-CHECKLIST.md` for detailed instructions.

### Quick Commands:

```bash
# Generate VAPID keys
npx web-push generate-vapid-keys

# Generate webhook API key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# Generate HMAC secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Add to `.env.local`:

```env
# Push Notifications (VAPID)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BKx... (from npx command)
VAPID_PRIVATE_KEY=8kX... (from npx command)
VAPID_SUBJECT=mailto:your-email@example.com

# Webhooks
WEBHOOK_API_KEYS=key1-abc123,key2-def456 (from node command)
WEBHOOK_SECRET_KEY=your-64-char-secret (from node command)

# Verify these already exist:
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

---

## Step 2: Run Database Migration

1. Open Supabase Dashboard → SQL Editor
2. Copy contents of `supabase-push-notifications-migration.sql`
3. Paste and click "Run"
4. Verify tables created:
   - `push_tokens` table exists
   - `trips` table has new columns: `zone_id`, `pickup_lat`, `pickup_lng`

---

## Step 3: Install Dependencies (Optional)

If you want to use Zod for webhook validation:

```bash
npm install zod
```

Current implementation uses manual validation, so this is optional.

---

## Step 4: Create PWA Icons

Create these icon files in `/public/`:

- `icon-192x192.png` (192x192 pixels)
- `icon-512x512.png` (512x512 pixels)
- `icon-96x96.png` (96x96 pixels, for shortcuts)

Or update paths in:
- `public/manifest.json`
- `public/sw.js` (notification icons)

---

## Step 5: Integration (Next Steps)

### Files Already Created ✅

- ✅ Database migration SQL
- ✅ Service worker (`public/sw.js`)
- ✅ PWA manifest (`public/manifest.json`)
- ✅ Push configuration (`lib/push-config.ts`)
- ✅ Service worker registration (`lib/sw-register.ts`)
- ✅ Webhook authentication (`lib/webhook-auth.ts`)
- ✅ Geocoding utility (`lib/geocoding.ts`)
- ✅ Push token APIs (`/api/push/register`, `/api/push/unregister`)
- ✅ Webhook endpoint (`/api/webhooks/trips/create`)
- ✅ Push notifications hook (`lib/hooks/usePushNotifications.ts`)
- ✅ TypeScript interfaces updated

### Files Still Needed ⏳

1. **Frontend Components:**
   - `components/driver/PushNotificationPrompt.tsx` - Permission request UI
   - `lib/notification-actions.ts` - Notification action handlers

2. **Integration:**
   - Update `app/layout.tsx` - Add manifest link
   - Update `app/driver/layout.tsx` - Register service worker
   - Update `app/driver/dashboard/page.tsx` - Integrate push notifications
   - Update `components/admin/NewTripModal.tsx` - Add geocoding

3. **Edge Functions (Phase 3):**
   - `supabase/functions/auto-assign-trip/index.ts`
   - `supabase/functions/send-push-notification/index.ts`

---

## Step 6: Testing

### Test Push Token Registration:

```bash
# After starting the app and logging in as a driver
# Check browser console for push notification registration
# Verify token is stored in push_tokens table
```

### Test Webhook Endpoint:

```bash
curl -X POST http://localhost:3000/api/webhooks/trips/create \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key-here" \
  -d '{
    "customer_phone": "+972501234567",
    "pickup_address": "Tel Aviv",
    "destination_address": "Jerusalem"
  }'
```

### Test Service Worker:

1. Open browser DevTools → Application → Service Workers
2. Verify service worker is registered
3. Check "Service Workers" tab shows active worker

---

## Current Implementation Status

✅ **Phase 1 & 2 Core Files:** Complete  
⏳ **Frontend Integration:** Pending  
⏳ **Edge Functions:** Pending (Phase 3)

---

## Next Actions

1. ✅ Generate credentials (Step 1)
2. ✅ Run database migration (Step 2)
3. ⏳ Create PWA icons (Step 4)
4. ⏳ Complete frontend integration
5. ⏳ Test implementation

---

## Troubleshooting

### Service Worker Not Registering
- Check browser console for errors
- Verify `public/sw.js` exists
- Ensure HTTPS (or localhost for development)

### Push Notifications Not Working
- Verify VAPID keys are set in `.env.local`
- Check browser notification permissions
- Verify service worker is active

### Webhook Authentication Failing
- Verify API key is in `WEBHOOK_API_KEYS` env var
- Check HMAC signature if using signature verification
- Verify rate limiting (100 requests/minute)

---

**See `IMPLEMENTATION-PROGRESS.md` for detailed progress tracking**





