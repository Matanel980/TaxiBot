# Push Notifications & Automation Webhooks - Implementation Plan

## Executive Summary

This document provides a comprehensive, end-to-end analysis for implementing production-grade PWA Push Notifications and an Automation Trigger Layer for the TaxiBot system. The goal is to enable drivers to receive loud, reliable notifications for new trip assignments even when the app is in the background, triggered by external webhooks (WhatsApp Chatbot, AI Voice Assistant, etc.).

**Timeline:** 2-month MVP launch  
**Priority:** Critical for production readiness

---

## 1. Current State Analysis

### ✅ What We Have
- **Supabase Realtime:** Real-time database subscriptions for trips and drivers
- **PostGIS Spatial Database:** Zone detection via `ST_Contains()` queries
- **API Infrastructure:** RESTful endpoints with authentication
- **Driver Dashboard:** Real-time trip updates via `useRealtimeTrips` hook
- **Zone Detection API:** `/api/zones/check-point` endpoint for point-in-polygon

### ❌ What's Missing
- **Service Worker:** No `sw.js` or service worker registration
- **PWA Manifest:** No `manifest.json` for installable PWA
- **Push Notification Infrastructure:** No Web Push API setup
- **Push Token Storage:** No `push_tokens` table in database
- **Webhook Endpoints:** No authenticated webhook endpoints for external services
- **Notification Permissions:** No permission request flow in driver UI
- **Background Sync:** No offline/background sync capability
- **Notification Actions:** No "Accept/Decline" action buttons in notifications

---

## 2. Gap Analysis

### 2.1 Service Worker & PWA Layer

**Current State:**
- No service worker file exists
- No PWA manifest configuration
- No offline caching strategy
- No background sync capability

**Required Components:**
1. **Service Worker (`public/sw.js`):**
   - Push event listener
   - Notification display with custom sounds
   - Action button handlers (Accept/Decline)
   - Background sync for offline trip acceptance
   - Cache management for offline support

2. **PWA Manifest (`public/manifest.json`):**
   - App name, icons, theme colors
   - Display mode: `standalone` or `fullscreen`
   - Start URL, scope
   - Shortcuts for quick actions

3. **Service Worker Registration (`lib/sw-register.ts`):**
   - Register service worker on app load
   - Request notification permissions
   - Handle service worker updates

### 2.2 Database & Realtime Layer

**Current State:**
- `trips` table exists but lacks `zone_id` field
- No `push_tokens` table for storing device tokens
- No database triggers for trip creation → push notification

**Required Schema Changes:**
```sql
-- Add zone_id to trips table
ALTER TABLE trips 
ADD COLUMN IF NOT EXISTS zone_id UUID REFERENCES zones(id),
ADD COLUMN IF NOT EXISTS pickup_lat DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS pickup_lng DECIMAL(11, 8);

-- Create push_tokens table
CREATE TABLE IF NOT EXISTS push_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  token TEXT NOT NULL UNIQUE,
  platform TEXT NOT NULL, -- 'web', 'ios', 'android'
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  is_active BOOLEAN DEFAULT true
);

CREATE INDEX idx_push_tokens_driver_id ON push_tokens(driver_id);
CREATE INDEX idx_push_tokens_active ON push_tokens(is_active) WHERE is_active = true;

-- RLS Policies
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Drivers can manage their own push tokens"
  ON push_tokens FOR ALL
  USING (auth.uid() = driver_id);

CREATE POLICY "Service role can manage all push tokens"
  ON push_tokens FOR ALL
  USING (auth.role() = 'service_role');
```

**Database Trigger (Optional - Can use Edge Function instead):**
```sql
-- Function to send push notification when trip is created
CREATE OR REPLACE FUNCTION notify_driver_on_trip_created()
RETURNS TRIGGER AS $$
BEGIN
  -- This will be handled by Supabase Edge Function
  -- Database trigger just logs the event
  PERFORM pg_notify('trip_created', json_build_object(
    'trip_id', NEW.id,
    'zone_id', NEW.zone_id,
    'driver_id', NEW.driver_id
  )::text);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trip_created_notification
  AFTER INSERT ON trips
  FOR EACH ROW
  WHEN (NEW.status = 'pending')
  EXECUTE FUNCTION notify_driver_on_trip_created();
```

### 2.3 API & Webhook Layer

**Current State:**
- No webhook endpoints for external services
- No API key authentication system
- No webhook payload validation

**Required Endpoints:**

1. **`/api/webhooks/trips/create` (POST):**
   - Accept trip data from WhatsApp/AI services
   - Validate payload structure
   - Geocode pickup address → coordinates
   - Detect zone using `/api/zones/check-point`
   - Create trip in database
   - Trigger push notification via Edge Function

2. **`/api/webhooks/trips/update` (PUT):**
   - Update trip status (e.g., from external system)
   - Validate webhook signature (HMAC)

3. **`/api/push/register` (POST):**
   - Register device push token
   - Store in `push_tokens` table
   - Link to driver profile

4. **`/api/push/unregister` (DELETE):**
   - Remove push token on logout/uninstall

**Security:**
- **API Key Authentication:** Store webhook API keys in Supabase Vault
- **HMAC Signature Verification:** Validate webhook payloads using shared secret
- **Rate Limiting:** Prevent abuse (e.g., 100 requests/minute per API key)

### 2.4 Frontend & State Management

**Current State:**
- Driver dashboard uses Supabase Realtime for trip updates
- No push notification permission request flow
- No notification action handlers

**Required Components:**

1. **`lib/hooks/usePushNotifications.ts`:**
   - Request notification permissions
   - Register service worker
   - Subscribe to push service (Firebase Cloud Messaging or native Web Push)
   - Store push token in database
   - Handle notification clicks and actions

2. **`components/driver/PushNotificationPrompt.tsx`:**
   - UI component to request notification permissions
   - Show in onboarding or driver dashboard
   - Explain benefits (background notifications)

3. **Notification Action Handlers:**
   - "Accept Trip" → Call `/api/trips/accept`
   - "Decline Trip" → Log decline (optional: reassign to next driver)

---

## 3. Implementation Strategy

### Phase 1: Foundation (Week 1-2)

#### 3.1 Service Worker Setup
**Files to Create:**
- `public/sw.js` - Service worker with push event listener
- `public/manifest.json` - PWA manifest
- `lib/sw-register.ts` - Service worker registration utility
- `lib/push-config.ts` - Push notification configuration (VAPID keys, etc.)

**Key Features:**
- Push event listener
- Notification display with custom sound
- Action buttons (Accept/Decline)
- Background sync for offline support

#### 3.2 Database Schema Updates
**Files to Modify:**
- `supabase-migration.sql` - Add `push_tokens` table and `zone_id` to trips
- Create migration script: `supabase-push-notifications-migration.sql`

#### 3.3 Push Token Management
**Files to Create:**
- `app/api/push/register/route.ts` - Register push token
- `app/api/push/unregister/route.ts` - Remove push token
- `lib/hooks/usePushNotifications.ts` - React hook for push notifications

### Phase 2: Webhook Infrastructure (Week 3-4)

#### 3.4 Webhook Endpoints
**Files to Create:**
- `app/api/webhooks/trips/create/route.ts` - Create trip from external service
- `app/api/webhooks/trips/update/route.ts` - Update trip status
- `lib/webhook-auth.ts` - HMAC signature verification
- `lib/geocoding.ts` - Address to coordinates conversion (Google Geocoding API)

**Security Implementation:**
- Store API keys in Supabase Vault or environment variables
- HMAC-SHA256 signature verification
- Rate limiting middleware

#### 3.5 Zone Detection Integration
**Files to Modify:**
- `components/admin/NewTripModal.tsx` - Add geocoding + zone detection
- `app/api/webhooks/trips/create/route.ts` - Auto-detect zone on trip creation

### Phase 3: Supabase Edge Functions (Week 5-6)

#### 3.6 Auto-Assignment Edge Function
**Files to Create:**
- `supabase/functions/auto-assign-trip/index.ts` - Find nearest driver
- `supabase/functions/send-push-notification/index.ts` - Send push to driver

**Logic:**
- When trip is created → Find nearest online driver in same zone
- Calculate distance using PostGIS `ST_Distance()`
- Send push notification to driver's device
- If no driver accepts within 30 seconds → Notify next nearest driver

#### 3.7 Database Triggers (Optional)
- Use Edge Functions instead of database triggers for better scalability
- Edge Functions can handle complex logic (distance calculation, retry logic)

### Phase 4: Frontend Integration (Week 7-8)

#### 3.8 Driver UI Updates
**Files to Modify:**
- `app/driver/dashboard/page.tsx` - Add push notification permission prompt
- `components/driver/PushNotificationPrompt.tsx` - New component
- `lib/hooks/useRealtimeTrips.ts` - Integrate with push notifications (fallback)

#### 3.9 Notification Action Handlers
**Files to Create:**
- `lib/notification-actions.ts` - Handle "Accept" and "Decline" actions
- Update service worker to handle notification clicks

---

## 4. File-by-File Implementation Plan

### New Files to Create

#### Service Worker & PWA
1. **`public/sw.js`** (200+ lines)
   - Push event listener
   - Notification display
   - Action button handlers
   - Background sync

2. **`public/manifest.json`** (50 lines)
   - PWA configuration
   - Icons, theme, display mode

3. **`lib/sw-register.ts`** (100 lines)
   - Service worker registration
   - Update handling
   - Error recovery

4. **`lib/push-config.ts`** (50 lines)
   - VAPID keys configuration
   - Push service URL
   - Environment-specific settings

#### API Routes
5. **`app/api/push/register/route.ts`** (80 lines)
   - Validate push token
   - Store in database
   - Link to driver profile

6. **`app/api/push/unregister/route.ts`** (50 lines)
   - Remove push token
   - Mark as inactive

7. **`app/api/webhooks/trips/create/route.ts`** (150 lines)
   - Authenticate webhook (API key + HMAC)
   - Validate payload
   - Geocode address
   - Detect zone
   - Create trip
   - Trigger push notification

8. **`app/api/webhooks/trips/update/route.ts`** (100 lines)
   - Update trip status
   - Validate webhook signature

#### Utilities
9. **`lib/webhook-auth.ts`** (100 lines)
   - HMAC signature verification
   - API key validation
   - Rate limiting

10. **`lib/geocoding.ts`** (80 lines)
    - Google Geocoding API wrapper
    - Address → coordinates
    - Error handling

11. **`lib/hooks/usePushNotifications.ts`** (200 lines)
    - Request permissions
    - Subscribe to push service
    - Store token
    - Handle notification events

12. **`lib/notification-actions.ts`** (100 lines)
    - Accept trip handler
    - Decline trip handler
    - Navigation logic

#### Components
13. **`components/driver/PushNotificationPrompt.tsx`** (150 lines)
    - Permission request UI
    - Benefits explanation
    - Onboarding integration

#### Supabase Edge Functions
14. **`supabase/functions/auto-assign-trip/index.ts`** (200 lines)
    - Find nearest driver
    - Distance calculation
    - Assignment logic

15. **`supabase/functions/send-push-notification/index.ts`** (150 lines)
    - Fetch push token
    - Send via Web Push API
    - Handle errors

### Files to Modify

1. **`supabase-migration.sql`**
   - Add `push_tokens` table
   - Add `zone_id`, `pickup_lat`, `pickup_lng` to `trips` table

2. **`lib/supabase.ts`**
   - Add `PushToken` interface
   - Update `Trip` interface with zone_id and coordinates

3. **`components/admin/NewTripModal.tsx`**
   - Add geocoding on address input
   - Auto-detect zone
   - Store coordinates in trip

4. **`app/driver/dashboard/page.tsx`**
   - Integrate `usePushNotifications` hook
   - Show permission prompt
   - Handle notification actions

5. **`app/driver/layout.tsx`**
   - Register service worker on mount
   - Initialize push notifications

---

## 5. Security Recommendations

### 5.1 Webhook Authentication

**Option 1: API Key + HMAC (Recommended)**
```typescript
// lib/webhook-auth.ts
export async function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const hmac = crypto.createHmac('sha256', secret)
  hmac.update(payload)
  const expectedSignature = `sha256=${hmac.digest('hex')}`
  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature)
  )
}
```

**Option 2: JWT Tokens**
- Issue JWT tokens to external services
- Validate on each webhook request
- Include expiration and scopes

**Option 3: IP Whitelisting (Less Secure)**
- Only allow requests from known IPs
- Use Supabase Edge Functions with IP filtering

### 5.2 API Key Storage

**Recommended: Supabase Vault**
```sql
-- Store webhook API keys in Supabase Vault
INSERT INTO vault.secrets (name, secret)
VALUES ('webhook_api_key_whatsapp', 'your-secret-key');
```

**Alternative: Environment Variables**
- Store in `.env.local` (development)
- Use Vercel/Netlify environment variables (production)
- Never commit to Git

### 5.3 Rate Limiting

**Implementation:**
- Use Supabase Edge Functions with rate limiting middleware
- Store request counts in Redis or Supabase table
- Limit: 100 requests/minute per API key

### 5.4 Push Token Security

- **HTTPS Only:** Web Push API requires HTTPS
- **Token Encryption:** Store push tokens encrypted at rest
- **Token Expiration:** Set `expires_at` based on platform (30 days for web)
- **Token Validation:** Verify token format before storing

---

## 6. Push Notification Provider Options

### Option 1: Firebase Cloud Messaging (FCM) - Recommended

**Pros:**
- Free tier (unlimited notifications)
- Cross-platform (Web, iOS, Android)
- Reliable delivery
- Built-in analytics

**Cons:**
- Requires Firebase project setup
- Additional dependency

**Implementation:**
```typescript
// lib/push-config.ts
export const FCM_CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_FCM_API_KEY,
  projectId: process.env.NEXT_PUBLIC_FCM_PROJECT_ID,
  messagingSenderId: process.env.NEXT_PUBLIC_FCM_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FCM_APP_ID
}
```

### Option 2: Native Web Push API

**Pros:**
- No external dependencies
- Standard browser API
- Works with any push service (FCM, OneSignal, etc.)

**Cons:**
- Requires VAPID key management
- More complex setup

**Implementation:**
```typescript
// lib/push-config.ts
export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
export const VAPID_PRIVATE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY // Store in server-side only
```

### Option 3: OneSignal (Alternative)

**Pros:**
- Easy setup
- Good free tier
- Analytics dashboard

**Cons:**
- Additional service dependency
- Less control

**Recommendation:** Use **Firebase Cloud Messaging (FCM)** for MVP. It's free, reliable, and widely supported.

---

## 7. Notification Flow Diagram

```
External Service (WhatsApp/AI)
    ↓
POST /api/webhooks/trips/create
    ↓
[Authenticate: API Key + HMAC]
    ↓
[Geocode: Address → Coordinates]
    ↓
[Detect Zone: /api/zones/check-point]
    ↓
[Create Trip: INSERT INTO trips]
    ↓
[Supabase Edge Function: auto-assign-trip]
    ↓
[Find Nearest Driver: PostGIS ST_Distance()]
    ↓
[Edge Function: send-push-notification]
    ↓
[Fetch Push Token: SELECT FROM push_tokens]
    ↓
[Send Push: FCM/Web Push API]
    ↓
[Service Worker: Receive Push Event]
    ↓
[Display Notification: Custom Sound + Actions]
    ↓
Driver Clicks "Accept"
    ↓
[Service Worker: Handle Action]
    ↓
[POST /api/trips/accept]
    ↓
[Update Trip: driver_id = driver.id, status = 'active']
    ↓
[Real-time Update: Supabase Realtime]
    ↓
Driver Dashboard: Show Active Trip
```

---

## 8. Testing Strategy

### 8.1 Unit Tests
- Webhook signature verification
- Geocoding address → coordinates
- Zone detection logic
- Push token validation

### 8.2 Integration Tests
- End-to-end webhook → push notification flow
- Service worker push event handling
- Notification action buttons
- Offline sync behavior

### 8.3 Manual Testing Checklist
- [ ] Request notification permissions on driver dashboard
- [ ] Create trip via webhook → Driver receives push notification
- [ ] Click "Accept" in notification → Trip assigned
- [ ] Click "Decline" in notification → Next driver notified
- [ ] Test with app in background (other app open)
- [ ] Test with app closed (service worker active)
- [ ] Test offline → Background sync when online
- [ ] Test notification sound and vibration
- [ ] Test on iOS Safari (if supported)
- [ ] Test on Android Chrome
- [ ] Test on desktop browsers (Chrome, Firefox, Edge)

---

## 9. Performance Optimization

### 9.1 Push Notification Delivery
- **Batch Notifications:** If multiple trips created, batch into single notification
- **Priority Queue:** Prioritize urgent trips (e.g., airport pickups)
- **Retry Logic:** Retry failed push notifications (3 attempts, exponential backoff)

### 9.2 Database Queries
- **Indexes:** Ensure `push_tokens(driver_id, is_active)` is indexed
- **Connection Pooling:** Use Supabase connection pooling for webhook endpoints
- **Caching:** Cache zone polygons to avoid repeated PostGIS queries

### 9.3 Service Worker
- **Cache Strategy:** Cache static assets (icons, sounds) for offline support
- **Background Sync:** Queue trip acceptances when offline, sync when online

---

## 10. Monitoring & Analytics

### 10.1 Key Metrics
- **Push Notification Delivery Rate:** % of notifications successfully delivered
- **Notification Click-Through Rate:** % of notifications clicked
- **Trip Acceptance Rate:** % of trips accepted via notification
- **Average Response Time:** Time from notification to acceptance

### 10.2 Logging
- Log all webhook requests (with sanitized payloads)
- Log push notification send attempts (success/failure)
- Log notification action clicks
- Log service worker errors

### 10.3 Alerts
- Alert if push notification delivery rate drops below 95%
- Alert if webhook authentication failures exceed threshold
- Alert if service worker registration failures

---

## 11. Rollout Plan

### Week 1-2: Foundation
- ✅ Service worker setup
- ✅ Database schema updates
- ✅ Push token registration

### Week 3-4: Webhooks
- ✅ Webhook endpoints
- ✅ Authentication & security
- ✅ Zone detection integration

### Week 5-6: Edge Functions
- ✅ Auto-assignment logic
- ✅ Push notification sending
- ✅ Retry logic

### Week 7-8: Frontend & Testing
- ✅ Driver UI integration
- ✅ Notification actions
- ✅ End-to-end testing
- ✅ Performance optimization

### Week 9-10: Beta Testing
- Limited rollout to 5-10 drivers
- Monitor metrics
- Fix bugs
- Optimize performance

### Week 11-12: Production Launch
- Full rollout
- Monitor closely
- Gather feedback
- Iterate

---

## 12. Future Enhancements

### Phase 2 (Post-MVP)
- **Rich Notifications:** Include trip details (pickup address, estimated fare) in notification
- **Notification Groups:** Group multiple pending trips in single notification
- **Smart Routing:** AI-powered driver assignment based on traffic, driver history
- **Voice Notifications:** Text-to-speech for hands-free operation
- **iOS Native App:** Native iOS app with APNs (Apple Push Notification Service)

### Phase 3 (Advanced)
- **Predictive Notifications:** Notify drivers before trip is created (based on patterns)
- **Multi-language Notifications:** Support Hebrew, Arabic, English
- **Notification Preferences:** Let drivers customize notification types
- **Analytics Dashboard:** Real-time metrics for admins

---

## 13. Risk Mitigation

### 13.1 Push Notification Failures
**Risk:** Driver doesn't receive notification  
**Mitigation:**
- Fallback to Supabase Realtime (current system)
- Retry logic (3 attempts)
- Alert admin if delivery fails

### 13.2 Webhook Security Breach
**Risk:** Unauthorized trip creation  
**Mitigation:**
- HMAC signature verification
- API key rotation (monthly)
- Rate limiting
- IP whitelisting (optional)

### 13.3 Service Worker Compatibility
**Risk:** Not all browsers support service workers  
**Mitigation:**
- Graceful degradation (fallback to Realtime)
- Browser detection and feature flags
- Progressive enhancement

### 13.4 Database Performance
**Risk:** Slow queries with many push tokens  
**Mitigation:**
- Proper indexing
- Token cleanup (remove expired tokens)
- Connection pooling

---

## 14. Cost Estimation

### Free Tier (MVP)
- **Firebase Cloud Messaging:** Free (unlimited)
- **Supabase Edge Functions:** Free tier (500K invocations/month)
- **Google Geocoding API:** $5 per 1000 requests (first $200 free/month)
- **Supabase Database:** Free tier (500MB, 2GB bandwidth)

### Estimated Monthly Cost (100 drivers, 1000 trips/month)
- **FCM:** $0
- **Supabase Edge Functions:** $0 (within free tier)
- **Geocoding:** ~$5 (1000 trips × $5/1000)
- **Total:** ~$5/month

### Scaling Costs (1000 drivers, 10,000 trips/month)
- **FCM:** $0
- **Supabase Edge Functions:** $0 (within free tier)
- **Geocoding:** ~$50 (10,000 trips × $5/1000)
- **Total:** ~$50/month

---

## 15. Conclusion

This implementation plan provides a comprehensive roadmap for adding production-grade push notifications and webhook automation to the TaxiBot system. The architecture is:

- **Scalable:** Handles growth from 10 to 10,000+ drivers
- **Secure:** HMAC authentication, API key management, rate limiting
- **Reliable:** Retry logic, fallback mechanisms, error handling
- **Cost-Effective:** ~$5-50/month for MVP to production scale
- **Maintainable:** Clean separation of concerns, well-documented

**Next Steps:**
1. Review and approve this plan
2. Set up Firebase Cloud Messaging project
3. Begin Phase 1 implementation (Service Worker + Database)
4. Schedule weekly progress reviews

**Questions or Concerns?**
- Push notification provider choice (FCM vs. native Web Push)
- Webhook authentication method (HMAC vs. JWT)
- Edge Function vs. Database trigger approach
- Timeline adjustments

---

**Document Version:** 1.0  
**Last Updated:** December 2025  
**Author:** AI Assistant (Cursor)  
**Status:** Ready for Implementation





