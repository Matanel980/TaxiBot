# Push Notifications & Webhooks - Quick Reference Guide

**Quick Start Guide for Implementation Team**

---

## 🎯 Core Objective

Enable drivers to receive **loud, reliable notifications** for new trip assignments **even when the app is in the background**, triggered by external webhooks (WhatsApp Chatbot, AI Voice Assistant).

---

## 📊 Current State Summary

### ✅ What Works
- Supabase Realtime subscriptions (trips, queue)
- PostGIS zone detection (`/api/zones/check-point`)
- Driver dashboard with real-time updates
- Geolocation tracking (4-second updates)
- Trip acceptance flow (via UI)

### ❌ Critical Gaps
- ❌ No service worker (no background notifications)
- ❌ No push token storage (`push_tokens` table missing)
- ❌ No webhook endpoints for external services
- ❌ No geocoding utility (address → coordinates)
- ❌ `trips` table missing: `zone_id`, `pickup_lat`, `pickup_lng`
- ❌ No Edge Functions for auto-assignment

---

## 🗂️ Files to Create (25 files)

### Database (1 file)
- `supabase-push-notifications-migration.sql` - Schema changes + push_tokens table

### Service Worker & PWA (4 files)
- `public/sw.js` - Service worker (push events, notifications, actions)
- `public/manifest.json` - PWA manifest
- `lib/sw-register.ts` - Service worker registration
- `lib/push-config.ts` - VAPID/FCM configuration

### API Endpoints (4 files)
- `app/api/push/register/route.ts` - Register push token
- `app/api/push/unregister/route.ts` - Remove push token
- `app/api/webhooks/trips/create/route.ts` ⚠️ **CRITICAL** - External trip creation
- `app/api/webhooks/trips/update/route.ts` - External trip updates

### Utilities (3 files)
- `lib/webhook-auth.ts` - HMAC signature verification
- `lib/geocoding.ts` - Google Geocoding API wrapper
- `lib/notification-actions.ts` - Notification button handlers

### React Hooks & Components (2 files)
- `lib/hooks/usePushNotifications.ts` - Push notification hook
- `components/driver/PushNotificationPrompt.tsx` - Permission prompt UI

### Edge Functions (2 files)
- `supabase/functions/auto-assign-trip/index.ts` - Auto-assign to nearest driver
- `supabase/functions/send-push-notification/index.ts` - Send push notification

### Files to Modify (9 files)
- `lib/supabase.ts` - Add `PushToken` interface, update `Trip` interface
- `app/layout.tsx` - Add manifest link, service worker registration
- `app/driver/layout.tsx` - Register service worker
- `app/driver/dashboard/page.tsx` - Integrate push notifications
- `components/admin/NewTripModal.tsx` - Add geocoding + zone detection
- `components/driver/OnboardingFlow.tsx` - Add notification prompt
- Plus 3 more files (see full plan)

---

## 🔐 Security Requirements

### Webhook Authentication
- **Method:** API Key + HMAC-SHA256 signature
- **Headers:** `X-API-Key`, `X-Signature`
- **Rate Limit:** 100 requests/minute per API key
- **Storage:** Environment variables (MVP) or Supabase Vault (Production)

### Environment Variables Needed

```env
# Push Notifications
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:your-email@example.com

# Webhooks
WEBHOOK_API_KEYS=key1,key2,key3
WEBHOOK_SECRET_KEY=your-hmac-secret
```

---

## 🚀 Implementation Phases

### Phase 1: Foundation (Week 1-2)
1. Database migration (`push_tokens` table, trip schema updates)
2. Service worker setup (`public/sw.js`, `manifest.json`)
3. Push token registration API
4. Basic notification display

### Phase 2: Webhooks (Week 3-4)
1. Webhook endpoints (`/api/webhooks/trips/create`)
2. Authentication (API Key + HMAC)
3. Geocoding utility
4. Zone detection integration

### Phase 3: Edge Functions (Week 5-6)
1. Auto-assignment Edge Function
2. Push notification sending Edge Function
3. Retry logic

### Phase 4: Frontend & Testing (Week 7-8)
1. Driver UI integration
2. Notification actions (Accept/Decline)
3. End-to-end testing
4. Performance optimization

---

## 🔄 Notification Flow

```
External Service (WhatsApp/AI)
    ↓
POST /api/webhooks/trips/create (API Key + HMAC)
    ↓
Geocode address → Detect zone → Create trip
    ↓
Edge Function: auto-assign-trip
    ↓
Edge Function: send-push-notification
    ↓
Browser Push Service
    ↓
Service Worker: Display notification (sound + actions)
    ↓
Driver clicks "Accept"
    ↓
POST /api/trips/accept → Trip assigned
    ↓
Driver Dashboard (Real-time update)
```

---

## 📦 Dependencies to Add

```json
{
  "dependencies": {
    "web-push": "^3.6.6",
    "zod": "^3.22.4"
  }
}
```

---

## 🧪 Testing Checklist

- [ ] Request notification permissions
- [ ] Create trip via webhook → Receive push notification
- [ ] Accept trip via notification button
- [ ] Test with app in background
- [ ] Test with app closed (service worker active)
- [ ] Test offline → Background sync
- [ ] Test on Android Chrome, iOS Safari, Desktop browsers

---

## 💰 Cost Estimate

**MVP (100 drivers, 1,000 trips/month):**
- FCM/Web Push: Free
- Supabase Edge Functions: Free (within limits)
- Google Geocoding: ~$5/month
- **Total: ~$5/month**

**Production (1,000 drivers, 10,000 trips/month):**
- Google Geocoding: ~$50/month
- **Total: ~$50-100/month**

---

## 📚 Full Documentation

See `PUSH-NOTIFICATIONS-AUDIT-AND-IMPLEMENTATION.md` for:
- Detailed gap analysis
- Complete file-by-file implementation strategy
- Security recommendations
- Code examples
- Risk mitigation strategies

---

## ⚡ Quick Commands

```bash
# Generate VAPID keys
npx web-push generate-vapid-keys

# Install dependencies
npm install web-push zod

# Run database migration
# Copy supabase-push-notifications-migration.sql to Supabase SQL Editor
```

---

**Status:** Ready to implement  
**Timeline:** 2-month MVP  
**Next Step:** Review full plan → Begin Phase 1 (Database + Service Worker)





