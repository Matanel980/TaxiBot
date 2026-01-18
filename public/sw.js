/**
 * Service Worker for Push Notifications
 * Handles push events, notifications, and background sync
 */

const CACHE_NAME = 'taxiflow-v1'
const NOTIFICATION_ICON = '/icon-192x192.png' // Update with your icon path
const NOTIFICATION_BADGE = '/icon-96x96.png' // Update with your badge path

// Install event - cache static assets
self.addEventListener('install', (event) => {
  console.log('[SW] Service Worker installing...')
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[SW] Cache opened')
      // Cache essential static assets
      return cache.addAll([
        '/',
        '/driver/dashboard',
        // Add more static assets as needed
      ]).catch((error) => {
        console.warn('[SW] Cache addAll failed:', error)
      })
    })
  )
  self.skipWaiting() // Activate immediately
})

// Activate event - clean up old caches
self.addEventListener('activate', (event) => {
  console.log('[SW] Service Worker activating...')
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            console.log('[SW] Deleting old cache:', cacheName)
            return caches.delete(cacheName)
          }
        })
      )
    })
  )
  return self.clients.claim() // Take control of all pages
})

// Push event - handle incoming push notifications
self.addEventListener('push', (event) => {
  console.log('[SW] Push event received:', event)

  let notificationData = {
    title: 'New Trip Assignment',
    body: 'You have a new trip request',
    icon: NOTIFICATION_ICON,
    badge: NOTIFICATION_BADGE,
    tag: 'trip-notification',
    requireInteraction: true,
    data: {},
    actions: [
      {
        action: 'accept',
        title: 'Accept',
        icon: '/icon-accept.png', // Optional
      },
      {
        action: 'decline',
        title: 'Decline',
        icon: '/icon-decline.png', // Optional
      },
    ],
  }

  // Parse push data if available
  if (event.data) {
    try {
      const data = event.data.json()
      notificationData = {
        ...notificationData,
        title: data.title || notificationData.title,
        body: data.body || notificationData.body,
        data: data.data || {},
        tag: data.tag || `trip-${data.tripId || Date.now()}`,
      }
    } catch (error) {
      console.error('[SW] Failed to parse push data:', error)
      // Use default notification
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      ...notificationData,
      vibrate: [200, 100, 200], // Vibration pattern
      sound: '/notification-sound.mp3', // Custom sound (optional)
    })
  )
})

// Notification click event - handle user interaction
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification clicked:', event)

  event.notification.close()

  const action = event.action
  const notificationData = event.notification.data || {}
  const tripId = notificationData.tripId

  if (action === 'accept' && tripId) {
    // Handle accept action
    event.waitUntil(
      handleTripAction('accept', tripId)
    )
  } else if (action === 'decline' && tripId) {
    // Handle decline action
    event.waitUntil(
      handleTripAction('decline', tripId)
    )
  } else {
    // Default click - open app
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
        // Try to focus existing window
        for (const client of clientList) {
          if (client.url.includes('/driver/dashboard') && 'focus' in client) {
            return client.focus()
          }
        }
        // Open new window if no existing window found
        if (clients.openWindow) {
          return clients.openWindow('/driver/dashboard')
        }
      })
    )
  }
})

// Handle trip action (accept/decline)
async function handleTripAction(action, tripId) {
  try {
    const response = await fetch(`/api/trips/${action}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ tripId }),
      credentials: 'include', // Include cookies for authentication
    })

    if (!response.ok) {
      throw new Error(`Failed to ${action} trip: ${response.statusText}`)
    }

    // Show confirmation notification
    await self.registration.showNotification(
      action === 'accept' ? 'Trip Accepted' : 'Trip Declined',
      {
        body: action === 'accept' ? 'You have accepted the trip' : 'Trip declined',
        icon: NOTIFICATION_ICON,
        tag: `trip-${action}-${tripId}`,
      }
    )

    // Focus or open the app - navigate to active trip if accepted
    const clientList = await clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const client of clientList) {
      if (client.url.includes('/driver/dashboard')) {
        if (action === 'accept') {
          // Navigate to dashboard with trip ID to show active trip
          await client.navigate(`/driver/dashboard?trip=${tripId}`)
        }
        if ('focus' in client) {
          await client.focus()
        }
        return
      }
    }
    if (clients.openWindow) {
      const url = action === 'accept' 
        ? `/driver/dashboard?trip=${tripId}`
        : '/driver/dashboard'
      await clients.openWindow(url)
    }
  } catch (error) {
    console.error(`[SW] Error handling trip ${action}:`, error)
    // Show error notification
    await self.registration.showNotification('Error', {
      body: `Failed to ${action} trip. Please try again.`,
      icon: NOTIFICATION_ICON,
      tag: `error-${action}-${tripId}`,
    })
  }
}

// Background sync (for offline trip acceptance)
self.addEventListener('sync', (event) => {
  console.log('[SW] Background sync:', event.tag)
  if (event.tag === 'sync-trip-actions') {
    event.waitUntil(syncTripActions())
  }
})

// Sync pending trip actions when online
async function syncTripActions() {
  // Implementation: Sync any pending trip actions that failed while offline
  // This is a placeholder - implement based on your needs
  console.log('[SW] Syncing trip actions...')
}

// Message event - handle messages from the app
self.addEventListener('message', (event) => {
  console.log('[SW] Message received:', event.data)
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting()
  }
})

// Error handling
self.addEventListener('error', (event) => {
  console.error('[SW] Service Worker error:', event.error)
})

self.addEventListener('unhandledrejection', (event) => {
  console.error('[SW] Unhandled promise rejection:', event.reason)
})

