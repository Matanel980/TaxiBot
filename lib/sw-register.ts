/**
 * Service Worker Registration
 * Handles service worker registration and updates
 */

const SW_URL = '/sw.js'
const SW_SCOPE = '/'

export interface ServiceWorkerRegistrationState {
  isSupported: boolean
  isRegistered: boolean
  registration: ServiceWorkerRegistration | null
  error: Error | null
}

/**
 * Register service worker
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    console.warn('[SW] Service Workers are not supported in this browser')
    return null
  }

  try {
    const registration = await navigator.serviceWorker.register(SW_URL, {
      scope: SW_SCOPE,
    })

    console.log('[SW] Service Worker registered:', registration.scope)

    // Handle updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration.installing
      if (!newWorker) return

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          // New service worker available
          console.log('[SW] New service worker available. Reload to update.')
          // Optionally show a notification to user
        }
      })
    })

    return registration
  } catch (error) {
    console.error('[SW] Service Worker registration failed:', error)
    return null
  }
}

/**
 * Unregister service worker (for testing/cleanup)
 */
export async function unregisterServiceWorker(): Promise<boolean> {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) {
    return false
  }

  try {
    const registration = await navigator.serviceWorker.ready
    const success = await registration.unregister()
    console.log('[SW] Service Worker unregistered:', success)
    return success
  } catch (error) {
    console.error('[SW] Service Worker unregistration failed:', error)
    return false
  }
}

/**
 * Check if service worker is supported
 */
export function isServiceWorkerSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator
}

/**
 * Get service worker registration
 */
export async function getServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) {
    return null
  }

  try {
    return await navigator.serviceWorker.ready
  } catch (error) {
    console.error('[SW] Failed to get service worker registration:', error)
    return null
  }
}





