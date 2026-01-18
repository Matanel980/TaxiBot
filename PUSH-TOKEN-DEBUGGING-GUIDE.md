# Push Token Debugging Guide

## ✅ Enhanced Debugging Added

All code has been updated with comprehensive console logging to help debug push token registration.

## Debugging Steps

### 1. Open Browser Console (F12)
- Go to Console tab
- Keep it open while testing

### 2. Check Service Worker Registration
**In Console, look for:**
```
[SW] Service Worker registered: /
```

**If not found:**
- Go to Application → Service Workers (DevTools)
- Check if `/sw.js` is registered
- If not, the Service Worker registration component might not be loading

### 3. Enable Push Notifications
**Click "הפעל התראות" button**

**Expected Console Output:**
```
[PushNotificationPrompt] 🔵 Enable button clicked
[PushNotificationPrompt] 🔵 Current state: { permission, isSupported, isConfigured, driverId }
[PushNotificationPrompt] 🔵 Current browser permission: default
[PushNotificationPrompt] 🔵 Requesting notification permission...
[usePushNotifications] 🔵 Subscribe called
[usePushNotifications] 🔵 State check: { isSupported, isConfigured, permission, driverId, hasVAPID }
[usePushNotifications] 🔵 Requesting notification permission...
[usePushNotifications] 🔵 Permission result: granted
[usePushNotifications] 🔵 Registering service worker...
[SW] Service Worker registered: /
[usePushNotifications] ✅ Service worker registered: /
[usePushNotifications] 🔵 Subscribing to push manager...
[usePushNotifications] ✅ Push subscription created: { endpoint, keys }
[usePushNotifications] 🔵 Push token generated: { hasKeys, tokenLength, tokenPreview }
[usePushNotifications] 🔵 Registering token in database for driver: <driver-id>
[registerTokenInDatabase] 🔵 Starting token registration...
[registerTokenInDatabase] 🔵 Driver ID: <driver-id>
[registerTokenInDatabase] 🔵 Token prepared: { hasKeys, tokenLength, tokenPreview }
[registerTokenInDatabase] 🔵 Sending request to /api/push/register: { platform, hasToken, tokenLength }
[registerTokenInDatabase] 🔵 Response status: 200 OK
[registerTokenInDatabase] ✅ Push token successfully saved to database: { token_id, driver_id, endpoint, expires_at }
[API Push Register] ✅ Push token saved to database: { token_id, driver_id, platform, expires_at }
```

### 4. Check for Errors

**If you see errors, look for:**
- `❌` symbols in console logs
- Error messages with details
- Stack traces

**Common Issues:**

1. **Service Worker not registered:**
   - Check `public/sw.js` exists
   - Check `ServiceWorkerRegistration` component is in layout
   - Check browser console for SW errors

2. **Permission denied:**
   - Browser blocked notification permission
   - Check browser settings
   - Try in incognito/private mode

3. **VAPID key missing:**
   - Check `.env.local` has `NEXT_PUBLIC_VAPID_PUBLIC_KEY`
   - Restart dev server after adding key

4. **Database error:**
   - Check RLS policies (should be disabled for testing)
   - Check table exists: `push_tokens`
   - Check columns match schema

5. **Driver ID missing:**
   - Check user is logged in
   - Check profile exists in database
   - Check profile.role = 'driver'

## Localhost Service Worker Verification

**Service Workers work on localhost!** Verify:

1. **Check Service Worker registration:**
   ```
   DevTools → Application → Service Workers
   ```
   - Should see `/sw.js` listed
   - Status should be "activated and is running"

2. **Check Service Worker scope:**
   - Scope should be `/` (root)
   - This allows SW to handle all routes

3. **Service Worker file location:**
   - Must be at `public/sw.js`
   - Must be accessible at `http://localhost:3000/sw.js`
   - Open in browser to verify it loads

## Testing Checklist

- [ ] Browser console open (F12)
- [ ] Service Worker registered (check Application tab)
- [ ] Click "הפעל התראות" button
- [ ] Grant notification permission
- [ ] Check console for all debug logs
- [ ] Verify no ❌ errors
- [ ] Check `push_tokens` table in Supabase
- [ ] Verify token was saved (check token_id and driver_id)

## Next Steps After Token is Saved

1. Token should appear in `push_tokens` table
2. Test push notification using Test button
3. Verify notification appears
4. Check notification actions work (Accept/Decline)

---

**All debugging logs are now in place. Check the browser console for detailed step-by-step logs.**





