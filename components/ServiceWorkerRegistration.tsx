'use client'

import { useEffect } from 'react'
import { registerServiceWorker, isServiceWorkerSupported } from '@/lib/sw-register'

/**
 * Service Worker Registration Component
 * Registers the service worker on mount
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!isServiceWorkerSupported()) {
      console.log('[SW] Service Workers not supported')
      return
    }

    // Register service worker
    registerServiceWorker().catch((error) => {
      console.error('[SW] Failed to register service worker:', error)
    })

    // Handle service worker updates
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        console.log('[SW] Service worker controller changed - reloading page')
        window.location.reload()
      })
    }
  }, [])

  return null // This component doesn't render anything
}





