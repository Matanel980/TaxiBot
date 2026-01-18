'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { registerServiceWorker, isServiceWorkerSupported } from '@/lib/sw-register'
import { VAPID_PUBLIC_KEY, isPushConfigured } from '@/lib/push-config'
import { createClient } from '@/lib/supabase'

export type NotificationPermission = 'default' | 'granted' | 'denied'

export interface UsePushNotificationsOptions {
  driverId: string | null
  autoRegister?: boolean
}

export interface UsePushNotificationsReturn {
  isSupported: boolean
  isConfigured: boolean
  permission: NotificationPermission
  isSubscribed: boolean
  token: string | null
  error: string | null
  subscribe: () => Promise<void>
  unsubscribe: () => Promise<void>
  requestPermission: () => Promise<NotificationPermission>
}

/**
 * React hook for push notifications
 * Handles service worker registration, push subscription, and token management
 */
export function usePushNotifications({
  driverId,
  autoRegister = true,
}: UsePushNotificationsOptions): UsePushNotificationsReturn {
  const [permission, setPermission] = useState<NotificationPermission>('default')
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [token, setToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)
  const subscriptionRef = useRef<PushSubscription | null>(null)
  const supabase = createClient()

  const isSupported = isServiceWorkerSupported() && 'PushManager' in window
  const isConfigured = isPushConfigured()

  // Check notification permission
  useEffect(() => {
    if (!isSupported || typeof window === 'undefined') {
      return
    }

    if ('Notification' in window) {
      setPermission(Notification.permission as NotificationPermission)
    }
  }, [isSupported])

  // Register service worker and check existing subscription
  useEffect(() => {
    if (!isSupported || !isConfigured || !autoRegister) {
      return
    }

    let mounted = true

    const init = async () => {
      try {
        // Register service worker
        const registration = await registerServiceWorker()
        if (!mounted || !registration) return

        registrationRef.current = registration

        // Check existing subscription
        const subscription = await registration.pushManager.getSubscription()
        if (subscription && mounted) {
          subscriptionRef.current = subscription
          setIsSubscribed(true)
          setToken(subscription.endpoint) // Use endpoint as identifier
          
          // Register token in database if driverId is available
          if (driverId) {
            await registerTokenInDatabase(subscription, driverId)
          }
        }
      } catch (err: any) {
        console.error('[usePushNotifications] Initialization error:', err)
        if (mounted) {
          setError(err.message || 'Failed to initialize push notifications')
        }
      }
    }

    init()

    return () => {
      mounted = false
    }
  }, [isSupported, isConfigured, autoRegister, driverId])

  // Request notification permission
  const requestPermission = useCallback(async (): Promise<NotificationPermission> => {
    if (!isSupported || !('Notification' in window)) {
      throw new Error('Notifications are not supported')
    }

    try {
      const result = await Notification.requestPermission()
      setPermission(result as NotificationPermission)
      return result as NotificationPermission
    } catch (err: any) {
      setError(err.message || 'Failed to request permission')
      throw err
    }
  }, [isSupported])

  // Subscribe to push notifications
  const subscribe = useCallback(async () => {
    console.log('[usePushNotifications] 🔵 Subscribe called')
    console.log('[usePushNotifications] 🔵 State check:', { isSupported, isConfigured, permission, driverId, hasVAPID: !!VAPID_PUBLIC_KEY })
    
    if (!isSupported || !isConfigured) {
      console.error('[usePushNotifications] ❌ Not supported or configured:', { isSupported, isConfigured })
      throw new Error('Push notifications are not supported or configured')
    }

    if (!VAPID_PUBLIC_KEY) {
      console.error('[usePushNotifications] ❌ VAPID public key not configured')
      throw new Error('VAPID public key is not configured')
    }

    try {
      setError(null)

      // Request permission if needed - check actual Notification.permission for real-time status
      let currentPermission = Notification.permission
      if (currentPermission === 'default') {
        console.log('[usePushNotifications] 🔵 Requesting notification permission...')
        currentPermission = await requestPermission()
        console.log('[usePushNotifications] 🔵 Permission result:', currentPermission)
      }

      if (currentPermission !== 'granted') {
        console.error('[usePushNotifications] ❌ Notification permission denied:', currentPermission)
        throw new Error('Notification permission denied')
      }

      // Get or create service worker registration
      let registration = registrationRef.current
      if (!registration) {
        console.log('[usePushNotifications] 🔵 Registering service worker...')
        registration = await registerServiceWorker()
        if (!registration) {
          console.error('[usePushNotifications] ❌ Failed to register service worker')
          throw new Error('Failed to register service worker')
        }
        registrationRef.current = registration
        console.log('[usePushNotifications] ✅ Service worker registered:', registration.scope)
      } else {
        console.log('[usePushNotifications] ✅ Using existing service worker registration')
      }

      // Subscribe to push
      console.log('[usePushNotifications] 🔵 Subscribing to push manager...')
      const key = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: key as unknown as BufferSource,
      })

      console.log('[usePushNotifications] ✅ Push subscription created:', {
        endpoint: subscription.endpoint.substring(0, 50) + '...',
        keys: subscription.getKey ? 'present' : 'missing'
      })

      subscriptionRef.current = subscription
      setIsSubscribed(true)

      // Convert subscription to token
      const subscriptionJson = subscription.toJSON()
      const pushToken = subscriptionJson.keys
        ? JSON.stringify(subscriptionJson)
        : subscription.endpoint

      console.log('[usePushNotifications] 🔵 Push token generated:', {
        hasKeys: !!subscriptionJson.keys,
        tokenLength: pushToken.length,
        tokenPreview: pushToken.substring(0, 50) + '...'
      })

      setToken(pushToken)

      // Register token in database
      if (driverId) {
        console.log('[usePushNotifications] 🔵 Registering token in database for driver:', driverId)
        await registerTokenInDatabase(subscription, driverId)
      } else {
        console.warn('[usePushNotifications] ⚠️ No driverId provided, skipping database registration')
      }
    } catch (err: any) {
      console.error('[usePushNotifications] ❌ Subscribe error:', err)
      console.error('[usePushNotifications] ❌ Error details:', {
        message: err.message,
        stack: err.stack,
        name: err.name
      })
      setError(err.message || 'Failed to subscribe to push notifications')
      throw err
    }
  }, [isSupported, isConfigured, permission, requestPermission, driverId])

  // Unsubscribe from push notifications
  const unsubscribe = useCallback(async () => {
    try {
      setError(null)

      if (subscriptionRef.current) {
        await subscriptionRef.current.unsubscribe()
        subscriptionRef.current = null
        setIsSubscribed(false)
        setToken(null)

        // Remove token from database
        if (driverId && token) {
          await unregisterTokenFromDatabase(token)
        }
      }
    } catch (err: any) {
      console.error('[usePushNotifications] Unsubscribe error:', err)
      setError(err.message || 'Failed to unsubscribe from push notifications')
      throw err
    }
  }, [driverId, token])

  // Register token in database
  const registerTokenInDatabase = async (
    subscription: PushSubscription,
    driverId: string
  ) => {
    console.log('[registerTokenInDatabase] 🔵 Starting token registration...')
    console.log('[registerTokenInDatabase] 🔵 Driver ID:', driverId)
    
    try {
      const subscriptionJson = subscription.toJSON()
      const pushToken = subscriptionJson.keys
        ? JSON.stringify(subscriptionJson)
        : subscription.endpoint

      console.log('[registerTokenInDatabase] 🔵 Token prepared:', {
        hasKeys: !!subscriptionJson.keys,
        tokenLength: pushToken.length,
        tokenPreview: pushToken.substring(0, 100) + '...'
      })

      const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : null

      const requestBody = {
        token: pushToken,
        platform: 'web',
        user_agent: userAgent,
      }

      console.log('[registerTokenInDatabase] 🔵 Sending request to /api/push/register:', {
        platform: requestBody.platform,
        hasToken: !!requestBody.token,
        tokenLength: requestBody.token.length,
        hasUserAgent: !!requestBody.user_agent
      })

      const response = await fetch('/api/push/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(requestBody),
      })

      console.log('[registerTokenInDatabase] 🔵 Response status:', response.status, response.statusText)

      const result = await response.json()

      if (!response.ok) {
        console.error('[registerTokenInDatabase] ❌ API Error:', result)
        throw new Error(result.error || 'Failed to register push token')
      }

      // ✅ TOKEN STORAGE VERIFICATION
      console.log('[registerTokenInDatabase] ✅ Push token successfully saved to database:', {
        token_id: result.token_id,
        driver_id: driverId,
        endpoint: subscription.endpoint.substring(0, 50) + '...',
        expires_at: result.expires_at,
        timestamp: new Date().toISOString()
      })
      console.log('[registerTokenInDatabase] ✅ Full API response:', result)
    } catch (err: any) {
      console.error('[registerTokenInDatabase] ❌ Token registration error:', err)
      console.error('[registerTokenInDatabase] ❌ Error details:', {
        message: err.message,
        stack: err.stack,
        name: err.name
      })
      // Don't throw - token registration failure shouldn't break the subscription
    }
  }

  // Unregister token from database
  const unregisterTokenFromDatabase = async (token: string) => {
    try {
      await fetch('/api/push/unregister', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ token }),
      })
    } catch (err: any) {
      console.error('[usePushNotifications] Token unregistration error:', err)
    }
  }

  return {
    isSupported,
    isConfigured,
    permission,
    isSubscribed,
    token,
    error,
    subscribe,
    unsubscribe,
    requestPermission,
  }
}

/**
 * Convert VAPID public key from URL-safe base64 to Uint8Array
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')

  const rawData = window.atob(base64)
  const outputArray = new Uint8Array(rawData.length)

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

