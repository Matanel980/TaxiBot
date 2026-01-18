/**
 * Notification Actions
 * Handles Accept/Decline actions from push notifications
 */

/**
 * Accept a trip from notification
 * Used by service worker and frontend
 */
export async function acceptTrip(tripId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('/api/trips/accept', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ tripId }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to accept trip' }))
      return { success: false, error: error.error || `HTTP ${response.status}` }
    }

    return { success: true }
  } catch (error: any) {
    console.error('[Notification Actions] Accept trip error:', error)
    return { success: false, error: error.message || 'Network error' }
  }
}

/**
 * Decline a trip from notification
 * Used by service worker and frontend
 */
export async function declineTrip(tripId: string): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch('/api/trips/decline', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ tripId }),
    })

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Failed to decline trip' }))
      return { success: false, error: error.error || `HTTP ${response.status}` }
    }

    return { success: true }
  } catch (error: any) {
    console.error('[Notification Actions] Decline trip error:', error)
    return { success: false, error: error.message || 'Network error' }
  }
}

/**
 * Navigate to driver dashboard
 * Used by service worker to open/focus the app
 */
export function navigateToDashboard(): void {
  if (typeof window !== 'undefined') {
    window.location.href = '/driver/dashboard'
  }
}

/**
 * Navigate to active trip view
 * Used after accepting a trip from notification
 */
export function navigateToActiveTrip(tripId: string): void {
  if (typeof window !== 'undefined') {
    window.location.href = `/driver/dashboard?trip=${tripId}`
  }
}





