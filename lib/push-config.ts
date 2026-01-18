/**
 * Push Notification Configuration
 * VAPID keys and push service configuration
 */

// VAPID public key (safe to expose - used in browser)
export const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY

// VAPID private key (server-only - for Edge Functions)
export const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY

// VAPID subject (email or URL)
export const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:your-email@example.com'

// Validate configuration
if (typeof window === 'undefined') {
  // Server-side: Check if private key exists
  if (!VAPID_PRIVATE_KEY) {
    console.warn('[Push Config] VAPID_PRIVATE_KEY is not set. Push notifications will not work.')
  }
} else {
  // Client-side: Check if public key exists
  if (!VAPID_PUBLIC_KEY) {
    console.warn('[Push Config] NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set. Push notifications will not work.')
  }
}

/**
 * Check if push notifications are configured
 */
export function isPushConfigured(): boolean {
  if (typeof window === 'undefined') {
    return !!VAPID_PRIVATE_KEY
  }
  return !!VAPID_PUBLIC_KEY
}

/**
 * Get push service URL
 * Uses the default browser push service
 */
export function getPushServiceURL(): string {
  // Web Push API uses browser's default push service
  // Chrome/Edge: https://fcm.googleapis.com/fcm/send
  // Firefox: https://updates.push.services.mozilla.com/push/v1/
  // The browser handles this automatically
  return ''
}





