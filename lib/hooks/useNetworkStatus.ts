'use client'

import { useEffect, useState } from 'react'

interface NetworkStatus {
  isOnline: boolean
  wasOffline: boolean // True if connection was lost and regained
}

/**
 * Hook to monitor network connection status
 * Provides real-time online/offline state with recovery detection
 */
export function useNetworkStatus(): NetworkStatus {
  const [isOnline, setIsOnline] = useState(true)
  const [wasOffline, setWasOffline] = useState(false)

  useEffect(() => {
    // Set initial state
    setIsOnline(navigator.onLine)

    const handleOnline = () => {
      if (!isOnline) {
        setWasOffline(true)
        // Reset after 3 seconds
        setTimeout(() => setWasOffline(false), 3000)
      }
      setIsOnline(true)
    }

    const handleOffline = () => {
      setIsOnline(false)
    }

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [isOnline])

  return { isOnline, wasOffline }
}

