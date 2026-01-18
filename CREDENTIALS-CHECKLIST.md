# Credentials & Environment Variables Checklist

**Complete list of API keys and credentials needed for Push Notifications & Webhooks implementation**

---

## 🔑 Required Credentials (Before Implementation)

### 1. VAPID Keys (Web Push Notifications) ⚠️ **REQUIRED**

**What:** Voluntarily Application Server Identification keys for Web Push API  
**Why:** Required for sending push notifications to browsers  
**Where to Get:**
1. Generate locally using web-push package:
   ```bash
   npx web-push generate-vapid-keys
   ```
2. Output will look like:
   ```
   Public Key: BKx... (65 characters)
   Private Key: 8kX... (43 characters)
   ```
3. Copy both keys to `.env.local`

**Environment Variables:**
```env
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BKx... (public key - safe to expose)
VAPID_PRIVATE_KEY=8kX... (private key - KEEP SECRET)
VAPID_SUBJECT=mailto:your-email@example.com (your email or website URL)
```

**Note:** VAPID keys are platform-agnostic and work with all browsers (Chrome, Firefox, Edge). No Firebase account needed if using native Web Push API.

---

### 2. Firebase Cloud Messaging (FCM) - **OPTIONAL ALTERNATIVE**

**What:** Google's push notification service (alternative to VAPID)  
**Why:** Provides analytics, better iOS support, unified push service  
**When to Use:** If you want analytics dashboard or plan to build native iOS/Android apps later  
**Where to Get:**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Create a new project (or use existing)
3. Go to Project Settings → Cloud Messaging
4. Copy:
   - Server Key (or generate new)
   - Sender ID
   - Project ID
5. Go to Project Settings → General → Your apps → Add Web app
6. Copy the `config` object (apiKey, projectId, messagingSenderId, appId)

**Environment Variables:**
```env
# Optional - Only if using FCM instead of VAPID
NEXT_PUBLIC_FCM_API_KEY=AIza...
NEXT_PUBLIC_FCM_PROJECT_ID=your-project-id
NEXT_PUBLIC_FCM_SENDER_ID=123456789
NEXT_PUBLIC_FCM_APP_ID=1:123456789:web:abc...
FCM_SERVER_KEY=AAA... (server key - KEEP SECRET)
```

**Recommendation for MVP:** Use **VAPID keys** (simpler, no Firebase account needed). Switch to FCM later if needed.

---

### 3. Webhook API Keys & Secret ⚠️ **REQUIRED**

**What:** API keys for external services (WhatsApp, AI Voice) to authenticate webhook requests  
**Why:** Security - prevent unauthorized trip creation  
**Where to Get:**
1. Generate secure random strings (32+ characters)
2. Use one of these methods:
   ```bash
   # Option 1: OpenSSL
   openssl rand -hex 32
   
   # Option 2: Node.js
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   
   # Option 3: Online generator (use a trusted source)
   # https://www.uuidgenerator.net/
   ```
3. Generate separate keys for each external service:
   - WhatsApp service key
   - AI Voice Assistant key
   - (Add more as needed)

**Environment Variables:**
```env
# Comma-separated list of valid API keys
WEBHOOK_API_KEYS=whatsapp-key-abc123,ai-voice-key-def456

# HMAC secret for signature verification (64+ characters recommended)
WEBHOOK_SECRET_KEY=your-super-secret-hmac-key-min-64-chars-long-for-security
```

**Security Notes:**
- Keep these keys SECRET (never commit to Git)
- Rotate keys periodically (monthly recommended)
- Store in `.env.local` for development
- Use environment variables in production (Vercel/Netlify/etc.)
- Consider using Supabase Vault for production (see below)

---

### 4. Google Maps API Key (Already Exists) ✅

**What:** Google Geocoding API key  
**Why:** Convert addresses to coordinates for zone detection  
**Status:** You already have this (`NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`)  
**Where to Verify:**
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. APIs & Services → Credentials
3. Ensure "Geocoding API" is enabled for this key

**Environment Variable (Already Set):**
```env
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIza... (already configured)
```

**Cost:** $5 per 1,000 requests (first $200 free/month)

---

### 5. Supabase Credentials (Already Exists) ✅

**What:** Supabase project URL and keys  
**Status:** Already configured  
**Where to Verify:**
1. Go to [Supabase Dashboard](https://app.supabase.com/)
2. Project Settings → API
3. Verify these are set:
   - Project URL
   - anon/public key
   - service_role key (for Edge Functions)

**Environment Variables (Already Set):**
```env
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ... (for Edge Functions - KEEP SECRET)
```

---

## 🔒 Production Storage Options (Advanced)

### Option 1: Environment Variables (Recommended for MVP)
Store in `.env.local` (development) and deployment platform (Vercel/Netlify) environment variables.

### Option 2: Supabase Vault (Recommended for Production)
Store sensitive keys in Supabase Vault (encrypted at rest).

```sql
-- In Supabase SQL Editor
INSERT INTO vault.secrets (name, secret)
VALUES 
  ('webhook_api_key_whatsapp', 'your-key-here'),
  ('webhook_secret_key', 'your-secret-here'),
  ('vapid_private_key', 'your-vapid-private-key');
```

Then retrieve in Edge Functions:
```typescript
const { data } = await supabase.rpc('get_secret', { secret_name: 'webhook_api_key_whatsapp' })
```

---

## ✅ Pre-Implementation Checklist

Before starting code implementation, ensure you have:

- [ ] **VAPID Keys Generated**
  - [ ] Public key (starts with `BK` or `BH`)
  - [ ] Private key (43 characters)
  - [ ] VAPID subject (email or URL)
  
- [ ] **Webhook Credentials Generated**
  - [ ] At least one API key (32+ characters)
  - [ ] HMAC secret key (64+ characters)
  
- [ ] **Google Maps API Verified**
  - [ ] Key exists and Geocoding API is enabled
  
- [ ] **Supabase Credentials Verified**
  - [ ] Service role key available (for Edge Functions)
  
- [ ] **Environment File Ready**
  - [ ] `.env.local` file exists
  - [ ] All keys added to `.env.local`
  - [ ] `.env.local` is in `.gitignore` (VERIFY THIS!)

---

## 🚨 Security Best Practices

1. **Never commit secrets to Git**
   - Verify `.env.local` is in `.gitignore`
   - Use `.env.example` template (without actual keys) for documentation

2. **Use different keys for development/production**
   - Development: `.env.local`
   - Production: Environment variables in deployment platform

3. **Rotate keys periodically**
   - Monthly rotation recommended
   - Update external services when rotating

4. **Monitor key usage**
   - Set up alerts for unusual activity
   - Log all webhook requests (sanitized)

5. **Limit key permissions**
   - Google Maps: Enable only needed APIs (Geocoding)
   - Supabase: Use service_role key only in Edge Functions (server-side)

---

## 📝 Quick Setup Commands

```bash
# 1. Generate VAPID keys
npx web-push generate-vapid-keys

# 2. Generate webhook API key
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"

# 3. Generate HMAC secret
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# 4. Create/verify .env.local
cat .env.local  # Should contain all keys above
```

---

## 📋 Complete .env.local Template

```env
# Existing (verify these are set)
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=AIza...

# NEW - Push Notifications (VAPID)
NEXT_PUBLIC_VAPID_PUBLIC_KEY=BKx... (generate with: npx web-push generate-vapid-keys)
VAPID_PRIVATE_KEY=8kX... (generate with: npx web-push generate-vapid-keys)
VAPID_SUBJECT=mailto:your-email@example.com

# NEW - Webhooks
WEBHOOK_API_KEYS=key1-abc123,key2-def456 (generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
WEBHOOK_SECRET_KEY=your-64-char-secret-key-minimum (generate with: node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")

# OPTIONAL - Firebase Cloud Messaging (only if using FCM instead of VAPID)
# NEXT_PUBLIC_FCM_API_KEY=...
# NEXT_PUBLIC_FCM_PROJECT_ID=...
# NEXT_PUBLIC_FCM_SENDER_ID=...
# NEXT_PUBLIC_FCM_APP_ID=...
# FCM_SERVER_KEY=...
```

---

## ❓ Which Keys to Generate First?

**For MVP Implementation (Start Here):**
1. ✅ VAPID keys (2 minutes) - **REQUIRED**
2. ✅ Webhook API keys (1 minute) - **REQUIRED**
3. ✅ Verify Google Maps key - **REQUIRED**

**Optional (Can add later):**
- Firebase Cloud Messaging (only if you want analytics or iOS support)

---

**Status:** Ready to generate credentials  
**Next Step:** Generate VAPID keys and webhook credentials, then proceed with implementation





