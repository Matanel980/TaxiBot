# Push Notifications & Webhook Automation - Comprehensive Audit & Implementation Plan

**Date:** January 2026  
**Status:** Ready for Implementation  
**Timeline:** 2-month MVP launch  
**Priority:** Critical for production readiness

---

## Executive Summary

This document provides a **validated, end-to-end analysis** of the TaxiBot codebase for implementing production-grade PWA Push Notifications and an Automation Trigger Layer. The analysis is based on a comprehensive review of the actual codebase (as of January 2026).

**Core Objective:** Enable drivers to receive loud, reliable notifications for new trip assignments even when the app is in the background or they are using other apps (like Waze). These assignments will be triggered by external webhooks (e.g., WhatsApp Chatbot or AI Voice Assistant) that parse customer intent and location.

---

## 1. Current State Analysis (Validated)

### ✅ What Exists in Codebase

#### Database & Infrastructure
- ✅ **Supabase Realtime** - Active real-time subscriptions in:
  - `lib/hooks/useRealtimeTrips.ts` - Trip updates for drivers
  - `lib/hooks/useRealtimeQueue.ts` - Queue position tracking
  - `app/driver/dashboard/page.tsx` - Real-time trip display
- ✅ **PostGIS Spatial Database** - Zone detection implemented:
  - `supabase-postgis-migration.sql` - PostGIS extension and functions
  - `app/api/zones/check-point/route.ts` - Point-in-polygon API endpoint
  - `get_zone_for_point()` function for spatial queries
- ✅ **Database Schema** - Core tables exist:
  - `profiles` table (with `is_online`, `current_zone`, location fields)
  - `trips` table (with `status`, `driver_id`, addresses)
  - `zones` and `zones_postgis` tables
- ✅ **API Infrastructure** - RESTful endpoints with authentication:
  - `/api/trips/accept/route.ts` - Trip acceptance endpoint
  - `/api/trips/update-status/route.ts` - Trip status updates
  - `/api/drivers/toggle-online/route.ts` - Driver online/offline toggle
  - `/api/zones/check-point/route.ts` - Zone detection (GET & POST)

#### Frontend
- ✅ **Driver Dashboard** - Real-time trip management:
  - `app/driver/dashboard/page.tsx` - Main driver interface
  - Real-time trip subscriptions via `useRealtimeTrips` hook
  - Trip overlay UI for accepting trips (`components/driver/TripOverlay.tsx`)
- ✅ **Geolocation Tracking** - Active location sync:
  - `lib/hooks/useGeolocation.ts` - Location updates every 4 seconds
  - Updates `profiles` table with latitude, longitude, heading, current_address
- ✅ **Authentication** - Supabase Auth with phone authentication:
  - `middleware.ts` - Route protection
  - `app/login/page.tsx` - Phone-based login

### ❌ What's Missing (Gap Analysis)

#### Critical Missing Components

1. **Service Worker & PWA Infrastructure**
   - ❌ No `public/sw.js` file (directory doesn't exist - needs creation)
   - ❌ No `public/manifest.json` for PWA installability
   - ❌ No service worker registration code
   - ❌ No push notification event handlers
   - ❌ No offline caching strategy

2. **Push Notification Infrastructure**
   - ❌ No `push_tokens` table in database
   - ❌ No push token registration API endpoint (`/api/push/register`)
   - ❌ No push token storage/retrieval logic
   - ❌ No Web Push API subscription code
   - ❌ No VAPID keys configuration
   - ❌ No Firebase Cloud Messaging (FCM) integration

3. **Webhook Automation Layer**
   - ❌ No `/api/webhooks/trips/create` endpoint
   - ❌ No `/api/webhooks/trips/update` endpoint
   - ❌ No webhook authentication system (API keys, HMAC)
   - ❌ No webhook payload validation
   - ❌ No geocoding utility (address → coordinates)

4. **Database Schema Gaps**
   - ❌ `trips` table missing:
     - `zone_id` (UUID reference to zones)
     - `pickup_lat` (DECIMAL for latitude)
     - `pickup_lng` (DECIMAL for longitude)
   - ❌ No `push_tokens` table for device token storage
   - ❌ No database triggers or Edge Functions for trip → notification flow

5. **Frontend Components**
   - ❌ No push notification permission request UI
   - ❌ No `usePushNotifications` hook
   - ❌ No notification action handlers (Accept/Decline buttons)
   - ❌ No service worker registration in layout/dashboard

6. **Supabase Edge Functions**
   - ❌ No `supabase/functions/` directory
   - ❌ No auto-assignment Edge Function
   - ❌ No push notification sending Edge Function

---

## 2. Detailed Gap Analysis by Layer

### 2.1 Service Worker & PWA Layer

**Current State:**
- `public/` directory does not exist (needs creation)
- No service worker file
- No PWA manifest
- No offline support
- Next.js 16 App Router (supports service workers in `public/` directory)

**Required Implementation:**

#### File: `public/sw.js` (New)
```javascript
// Service worker for push notifications and offline support
// Must handle:
// - push event listener
// - notification display with custom sound
// - notification action buttons (accept/decline)
// - background sync for offline trip acceptance
// - cache management
```

#### File: `public/manifest.json` (New)
```json
{
  "name": "TaxiFlow - Driver App",
  "short_name": "TaxiFlow",
  "description": "Taxi dispatch system for drivers",
  "start_url": "/driver/dashboard",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#F7C948",
  "icons": [...],
  "shortcuts": [...]
}
```

#### File: `lib/sw-register.ts` (New)
- Service worker registration
- Update handling
- Error recovery
- Notification permission requests

#### File: `lib/push-config.ts` (New)
- VAPID keys configuration
- Push service URL
- Environment-specific settings

**Integration Points:**
- Register service worker in `app/driver/layout.tsx` or `app/layout.tsx`
- Reference manifest in `app/layout.tsx` metadata

---

### 2.2 Database & Realtime Layer

**Current Schema Analysis:**

#### Existing `trips` Table (from `supabase-migration.sql:48-57`)
```sql
CREATE TABLE trips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_phone TEXT NOT NULL,
  pickup_address TEXT NOT NULL,
  destination_address TEXT NOT NULL,
  status trip_status DEFAULT 'pending',
  driver_id UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Missing Columns:**
- `zone_id UUID` - Reference to zones table
- `pickup_lat DECIMAL(10, 8)` - Pickup latitude
- `pickup_lng DECIMAL(11, 8)` - Pickup longitude

**Required Schema Changes:**

#### Migration File: `supabase-push-notifications-migration.sql` (New)
```sql
-- Add missing columns to trips table
ALTER TABLE trips 
ADD COLUMN IF NOT EXISTS zone_id UUID REFERENCES zones(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS pickup_lat DECIMAL(10, 8),
ADD COLUMN IF NOT EXISTS pickup_lng DECIMAL(11, 8);

-- Create indexes for zone-based queries
CREATE INDEX IF NOT EXISTS trips_zone_id_idx ON trips(zone_id) WHERE zone_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS trips_pickup_coords_idx ON trips(pickup_lat, pickup_lng) WHERE pickup_lat IS NOT NULL;

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

-- Indexes for push_tokens
CREATE INDEX IF NOT EXISTS idx_push_tokens_driver_id ON push_tokens(driver_id);
CREATE INDEX IF NOT EXISTS idx_push_tokens_active ON push_tokens(is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_push_tokens_driver_active ON push_tokens(driver_id, is_active) WHERE is_active = true;

-- Enable RLS
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Drivers can manage their own push tokens"
  ON push_tokens FOR ALL
  USING (auth.uid() = driver_id);

CREATE POLICY "Service role can manage all push tokens"
  ON push_tokens FOR ALL
  USING (auth.role() = 'service_role');
```

**TypeScript Interface Updates:**

#### File: `lib/supabase.ts` (Modify)
Add to existing `Trip` interface:
```typescript
export interface Trip {
  id: string
  customer_phone: string
  pickup_address: string
  destination_address: string
  status: 'pending' | 'active' | 'completed'
  driver_id: string | null
  zone_id?: string | null  // NEW
  pickup_lat?: number | null  // NEW
  pickup_lng?: number | null  // NEW
  created_at: string
  updated_at: string
}

// NEW interface
export interface PushToken {
  id: string
  driver_id: string
  token: string
  platform: 'web' | 'ios' | 'android'
  user_agent?: string | null
  created_at: string
  updated_at: string
  expires_at?: string | null
  is_active: boolean
}
```

---

### 2.3 API & Webhook Layer

**Current API Endpoints:**
- ✅ `/api/trips/accept` - Authenticated, driver-only
- ✅ `/api/trips/update-status` - Authenticated, driver-only
- ✅ `/api/zones/check-point` - Authenticated, GET & POST
- ❌ No webhook endpoints for external services
- ❌ No push token management endpoints

**Required New Endpoints:**

#### 1. File: `app/api/push/register/route.ts` (New)
**Purpose:** Register device push token for authenticated driver
**Method:** POST
**Authentication:** Supabase session (driver only)
**Request Body:**
```typescript
{
  token: string  // Push subscription token
  platform: 'web' | 'ios' | 'android'
  user_agent?: string
}
```
**Response:**
```typescript
{
  success: boolean
  token_id: string
}
```

#### 2. File: `app/api/push/unregister/route.ts` (New)
**Purpose:** Remove push token on logout/uninstall
**Method:** DELETE
**Authentication:** Supabase session
**Request Body:**
```typescript
{
  token: string
}
```

#### 3. File: `app/api/webhooks/trips/create/route.ts` (New) ⚠️ **CRITICAL**
**Purpose:** Accept trip creation from external services (WhatsApp, AI Voice)
**Method:** POST
**Authentication:** API Key + HMAC signature (no user session)
**Request Body:**
```typescript
{
  customer_phone: string
  pickup_address: string
  destination_address: string
  pickup_lat?: number  // Optional - will geocode if missing
  pickup_lng?: number  // Optional - will geocode if missing
  zone_id?: string     // Optional - will detect if missing
  metadata?: Record<string, any>  // Additional data from external service
}
```
**Security:**
- API Key in `X-API-Key` header
- HMAC-SHA256 signature in `X-Signature` header
- Rate limiting: 100 requests/minute per API key
- Payload validation

#### 4. File: `app/api/webhooks/trips/update/route.ts` (New)
**Purpose:** Update trip status from external systems
**Method:** PUT
**Authentication:** API Key + HMAC signature
**Request Body:**
```typescript
{
  trip_id: string
  status?: 'active' | 'completed' | 'cancelled'
  metadata?: Record<string, any>
}
```

**Supporting Files:**

#### 5. File: `lib/webhook-auth.ts` (New)
- HMAC-SHA256 signature verification
- API key validation
- Rate limiting middleware
- Error handling

#### 6. File: `lib/geocoding.ts` (New)
- Google Geocoding API wrapper
- Address → coordinates conversion
- Reverse geocoding (coordinates → address)
- Error handling and retries
- Uses existing `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`

---

### 2.4 Supabase Edge Functions

**Current State:**
- No `supabase/functions/` directory exists
- No Edge Functions configured

**Required Edge Functions:**

#### Directory Structure:
```
supabase/
  functions/
    auto-assign-trip/
      index.ts
    send-push-notification/
      index.ts
```

#### 1. File: `supabase/functions/auto-assign-trip/index.ts` (New)
**Purpose:** Automatically assign trip to nearest online driver
**Trigger:** Database webhook or manual invocation
**Logic:**
1. Receive trip_id
2. Query trip details (pickup coordinates, zone_id)
3. Find nearest online driver in same zone using PostGIS `ST_Distance()`
4. Assign trip to driver (`UPDATE trips SET driver_id = ...`)
5. Invoke `send-push-notification` Edge Function
6. If no acceptance within 30 seconds → notify next driver

#### 2. File: `supabase/functions/send-push-notification/index.ts` (New)
**Purpose:** Send push notification to driver device
**Input:**
```typescript
{
  driver_id: string
  trip_id: string
  title: string
  body: string
  data: Record<string, any>
}
```
**Logic:**
1. Fetch active push tokens for driver
2. Send notification via Web Push API (using VAPID keys)
3. Handle errors (expired tokens, etc.)
4. Log delivery status

**Alternative Approach:** Use Supabase Database Webhooks to trigger Edge Functions on `trips` INSERT.

---

### 2.5 Frontend & State Management

**Current Frontend State:**
- `app/driver/dashboard/page.tsx` uses `useRealtimeTrips` hook for trip updates
- Trip acceptance handled via `TripOverlay` component
- No push notification permission flow
- No service worker registration

**Required Components:**

#### 1. File: `lib/hooks/usePushNotifications.ts` (New)
**Purpose:** React hook for push notification management
**Features:**
- Request notification permissions
- Register service worker
- Subscribe to push service (FCM or Web Push)
- Store push token in database via `/api/push/register`
- Handle notification clicks and actions
- Cleanup on unmount

**Usage:**
```typescript
const { 
  isSupported, 
  permission, 
  subscribe, 
  unsubscribe,
  token 
} = usePushNotifications({ driverId })
```

#### 2. File: `components/driver/PushNotificationPrompt.tsx` (New)
**Purpose:** UI component to request notification permissions
**Features:**
- Explain benefits (background notifications)
- Request permission button
- Show permission status
- Integration with onboarding or driver dashboard

**Integration Points:**
- Show in `app/driver/dashboard/page.tsx` when permission is "default"
- Show in onboarding flow (`components/driver/OnboardingFlow.tsx`)

#### 3. File: `lib/notification-actions.ts` (New)
**Purpose:** Handle notification action buttons (Accept/Decline)
**Functions:**
- `handleAcceptTrip(tripId)` - Call `/api/trips/accept`
- `handleDeclineTrip(tripId)` - Log decline, optionally reassign
- Navigation helpers

**Files to Modify:**

#### 4. File: `app/driver/layout.tsx` (Modify)
- Register service worker on mount
- Initialize push notifications

#### 5. File: `app/driver/dashboard/page.tsx` (Modify)
- Integrate `usePushNotifications` hook
- Show `PushNotificationPrompt` when needed
- Handle notification actions

#### 6. File: `app/layout.tsx` (Modify)
- Add manifest.json link
- Add service worker registration script

---

## 3. Security Recommendations

### 3.1 Webhook Authentication

**Recommended Approach: API Key + HMAC Signature**

#### Implementation: `lib/webhook-auth.ts`

```typescript
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

export async function validateApiKey(apiKey: string): Promise<boolean> {
  // Check against stored API keys (Supabase Vault or env vars)
  const validKeys = process.env.WEBHOOK_API_KEYS?.split(',') || []
  return validKeys.includes(apiKey)
}
```

**API Key Storage Options:**

1. **Environment Variables** (Recommended for MVP)
   ```env
   WEBHOOK_API_KEYS=key1,key2,key3
   WEBHOOK_SECRET_KEY=your-hmac-secret
   ```

2. **Supabase Vault** (Recommended for Production)
   ```sql
   INSERT INTO vault.secrets (name, secret)
   VALUES ('webhook_api_key_whatsapp', 'your-key');
   ```

3. **Database Table** (Alternative)
   ```sql
   CREATE TABLE webhook_api_keys (
     id UUID PRIMARY KEY,
     key_name TEXT UNIQUE,
     api_key TEXT UNIQUE,
     secret TEXT,
     created_at TIMESTAMPTZ DEFAULT NOW(),
     is_active BOOLEAN DEFAULT true
   );
   ```

### 3.2 Rate Limiting

**Implementation:** Middleware in webhook endpoints

```typescript
// Simple in-memory rate limiter (MVP)
// For production, use Redis or Supabase Edge Functions rate limiting
const rateLimiter = new Map<string, { count: number; resetAt: number }>()

export function checkRateLimit(apiKey: string, limit = 100, windowMs = 60000): boolean {
  const now = Date.now()
  const record = rateLimiter.get(apiKey)
  
  if (!record || now > record.resetAt) {
    rateLimiter.set(apiKey, { count: 1, resetAt: now + windowMs })
    return true
  }
  
  if (record.count >= limit) {
    return false
  }
  
  record.count++
  return true
}
```

### 3.3 Push Token Security

- ✅ **HTTPS Only:** Web Push API requires HTTPS (automatic in production)
- ✅ **Token Encryption:** Store tokens securely in database
- ✅ **Token Expiration:** Set `expires_at` based on platform (30 days for web)
- ✅ **Token Validation:** Verify token format before storing
- ✅ **RLS Policies:** Ensure drivers can only manage their own tokens

### 3.4 Input Validation

**Webhook Payload Validation:**
```typescript
import { z } from 'zod'  // Add zod package

const TripCreateSchema = z.object({
  customer_phone: z.string().regex(/^\+972\d{9}$/),
  pickup_address: z.string().min(5).max(500),
  destination_address: z.string().min(5).max(500),
  pickup_lat: z.number().min(-90).max(90).optional(),
  pickup_lng: z.number().min(-180).max(180).optional(),
  zone_id: z.string().uuid().optional(),
  metadata: z.record(z.any()).optional()
})
```

---

## 4. File-by-File Implementation Strategy

### Phase 1: Foundation (Week 1-2)

#### Database Schema
1. ✅ Create `supabase-push-notifications-migration.sql`
2. ✅ Run migration in Supabase SQL Editor
3. ✅ Update `lib/supabase.ts` interfaces

#### Service Worker & PWA
4. ✅ Create `public/sw.js` (200+ lines)
5. ✅ Create `public/manifest.json` (50 lines)
6. ✅ Create `lib/sw-register.ts` (100 lines)
7. ✅ Create `lib/push-config.ts` (50 lines)
8. ✅ Create PWA icons (192x192, 512x512)

#### Push Token Management
9. ✅ Create `app/api/push/register/route.ts` (80 lines)
10. ✅ Create `app/api/push/unregister/route.ts` (50 lines)
11. ✅ Create `lib/hooks/usePushNotifications.ts` (200 lines)

### Phase 2: Webhook Infrastructure (Week 3-4)

#### Webhook Endpoints
12. ✅ Create `app/api/webhooks/trips/create/route.ts` (200 lines)
13. ✅ Create `app/api/webhooks/trips/update/route.ts` (100 lines)
14. ✅ Create `lib/webhook-auth.ts` (150 lines)
15. ✅ Create `lib/geocoding.ts` (100 lines)

#### Frontend Integration
16. ✅ Create `components/driver/PushNotificationPrompt.tsx` (150 lines)
17. ✅ Modify `app/driver/layout.tsx` - Register service worker
18. ✅ Modify `app/driver/dashboard/page.tsx` - Integrate push notifications
19. ✅ Modify `app/layout.tsx` - Add manifest link

#### Admin UI Updates
20. ✅ Modify `components/admin/NewTripModal.tsx` - Add geocoding + zone detection

### Phase 3: Supabase Edge Functions (Week 5-6)

#### Edge Functions Setup
21. ✅ Initialize Supabase CLI (if not done)
22. ✅ Create `supabase/functions/auto-assign-trip/index.ts` (250 lines)
23. ✅ Create `supabase/functions/send-push-notification/index.ts` (200 lines)
24. ✅ Configure Edge Function secrets (VAPID keys)

#### Database Triggers (Optional)
25. ✅ Create database webhook trigger (or use Edge Function HTTP invocations)

### Phase 4: Testing & Refinement (Week 7-8)

26. ✅ End-to-end testing
27. ✅ Performance optimization
28. ✅ Error handling improvements
29. ✅ Documentation updates

---

## 5. Dependencies & Environment Variables

### New NPM Packages Required

```json
{
  "dependencies": {
    "web-push": "^3.6.6",  // For sending push notifications (Edge Functions)
    "zod": "^3.22.4"  // For webhook payload validation
  }
}
```

### Environment Variables

Add to `.env.local`:

```env
# Existing
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=...

# New - Push Notifications
NEXT_PUBLIC_VAPID_PUBLIC_KEY=...  # VAPID public key (browser)
VAPID_PRIVATE_KEY=...  # VAPID private key (server-only, Edge Functions)
VAPID_SUBJECT=mailto:your-email@example.com

# New - Webhooks
WEBHOOK_API_KEYS=whatsapp-key-1,ai-voice-key-2  # Comma-separated
WEBHOOK_SECRET_KEY=your-hmac-secret-key

# Optional - Firebase Cloud Messaging (alternative to Web Push)
# NEXT_PUBLIC_FCM_API_KEY=...
# NEXT_PUBLIC_FCM_PROJECT_ID=...
# NEXT_PUBLIC_FCM_SENDER_ID=...
```

### VAPID Key Generation

```bash
# Generate VAPID keys using web-push package
npx web-push generate-vapid-keys
```

---

## 6. Notification Flow Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ External Service (WhatsApp/AI Voice Assistant)                  │
│ - Parse customer request                                        │
│ - Extract: phone, pickup address, destination                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ POST /api/webhooks/trips/create                                 │
│ Headers: X-API-Key, X-Signature (HMAC)                         │
│ Body: { customer_phone, pickup_address, destination_address }   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ 1. Verify API Key + HMAC Signature                              │
│ 2. Validate payload (Zod schema)                               │
│ 3. Geocode pickup_address → (lat, lng)                         │
│ 4. Detect zone: POST /api/zones/check-point                    │
│ 5. Create trip: INSERT INTO trips (with zone_id, coordinates)  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Supabase Edge Function: auto-assign-trip                        │
│ Trigger: Database webhook on trips INSERT                       │
│ Logic:                                                          │
│   1. Find nearest online driver in same zone (PostGIS)         │
│   2. UPDATE trips SET driver_id = nearest_driver               │
│   3. Invoke send-push-notification Edge Function               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Supabase Edge Function: send-push-notification                  │
│ Input: { driver_id, trip_id, title, body, data }               │
│ Logic:                                                          │
│   1. SELECT token FROM push_tokens WHERE driver_id = ...       │
│   2. Send push via Web Push API (VAPID)                        │
│   3. Handle errors (expired tokens, etc.)                      │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Browser Push Service (FCM / Web Push)                           │
│ - Delivers push to device                                       │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Service Worker: push event listener                             │
│ - Receives push notification                                    │
│ - Displays notification with custom sound                       │
│ - Shows action buttons: "Accept" / "Decline"                   │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Driver clicks "Accept"                                          │
│ Service Worker: notificationclick event                         │
│ - POST /api/trips/accept { tripId }                            │
│ - Update trip status to 'active'                               │
│ - Navigate to driver dashboard                                  │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│ Driver Dashboard                                                │
│ - Real-time update via Supabase Realtime                        │
│ - Shows active trip with navigation                             │
└─────────────────────────────────────────────────────────────────┘
```

---

## 7. Testing Strategy

### 7.1 Unit Tests

- [ ] Webhook signature verification
- [ ] Geocoding address → coordinates
- [ ] Zone detection logic
- [ ] Push token validation
- [ ] Rate limiting logic

### 7.2 Integration Tests

- [ ] End-to-end webhook → push notification flow
- [ ] Service worker push event handling
- [ ] Notification action buttons (Accept/Decline)
- [ ] Offline sync behavior
- [ ] Edge Function invocation

### 7.3 Manual Testing Checklist

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

## 8. Cost Estimation

### Free Tier (MVP - 100 drivers, 1,000 trips/month)

- **Firebase Cloud Messaging:** Free (unlimited)
- **Web Push API (VAPID):** Free (no service fees)
- **Supabase Edge Functions:** Free tier (500K invocations/month)
- **Google Geocoding API:** $5 per 1,000 requests (first $200 free/month)
- **Supabase Database:** Free tier (500MB, 2GB bandwidth)

**Estimated Monthly Cost:** ~$5/month

### Production Scale (1,000 drivers, 10,000 trips/month)

- **FCM/Web Push:** Free
- **Supabase Edge Functions:** Free (within limits)
- **Google Geocoding:** ~$50 (10,000 trips × $5/1,000)
- **Supabase Database:** May need paid tier for bandwidth

**Estimated Monthly Cost:** ~$50-100/month

---

## 9. Risk Mitigation

### 9.1 Push Notification Failures

**Risk:** Driver doesn't receive notification  
**Mitigation:**
- Fallback to Supabase Realtime (current system)
- Retry logic (3 attempts with exponential backoff)
- Alert admin if delivery fails
- Log all delivery attempts

### 9.2 Webhook Security Breach

**Risk:** Unauthorized trip creation  
**Mitigation:**
- HMAC signature verification (prevents tampering)
- API key rotation (monthly)
- Rate limiting (prevents abuse)
- IP whitelisting (optional, for known services)
- Request logging (audit trail)

### 9.3 Service Worker Compatibility

**Risk:** Not all browsers support service workers  
**Mitigation:**
- Graceful degradation (fallback to Realtime)
- Browser detection and feature flags
- Progressive enhancement
- Clear error messages

### 9.4 Database Performance

**Risk:** Slow queries with many push tokens  
**Mitigation:**
- Proper indexing (implemented in migration)
- Token cleanup (remove expired tokens weekly)
- Connection pooling
- Query optimization

---

## 10. Timeline & Milestones

### Week 1-2: Foundation ✅
- Database schema migration
- Service worker setup
- Push token registration
- Basic push notification display

### Week 3-4: Webhooks ✅
- Webhook endpoints
- Authentication & security
- Geocoding integration
- Zone detection integration

### Week 5-6: Edge Functions ✅
- Auto-assignment logic
- Push notification sending
- Retry logic
- Error handling

### Week 7-8: Frontend & Testing ✅
- Driver UI integration
- Notification actions
- End-to-end testing
- Performance optimization

### Week 9-10: Beta Testing
- Limited rollout (5-10 drivers)
- Monitor metrics
- Fix bugs
- Gather feedback

### Week 11-12: Production Launch
- Full rollout
- Monitor closely
- Gather feedback
- Iterate

---

## 11. Next Steps

1. **Review this plan** with team/stakeholders
2. **Set up Firebase Cloud Messaging** (or generate VAPID keys)
3. **Create environment variables** for webhook keys
4. **Begin Phase 1 implementation** (Database + Service Worker)
5. **Schedule weekly progress reviews**

---

## 12. Questions & Decisions Needed

1. **Push Notification Provider:**
   - [ ] Firebase Cloud Messaging (FCM) - Recommended
   - [ ] Native Web Push API with VAPID
   - [ ] OneSignal (alternative)

2. **Webhook Authentication:**
   - [ ] API Key + HMAC (Recommended)
   - [ ] JWT Tokens
   - [ ] OAuth 2.0

3. **Auto-Assignment Strategy:**
   - [ ] Edge Function triggered by database webhook
   - [ ] Edge Function triggered by API endpoint
   - [ ] Database trigger → pg_notify → Edge Function

4. **Notification Sound:**
   - [ ] Custom sound file (requires hosting)
   - [ ] Default browser sound
   - [ ] No sound (vibration only)

---

**Document Version:** 2.0 (Validated)  
**Last Updated:** January 2026  
**Status:** Ready for Implementation





