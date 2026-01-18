/**
 * useRealtimeTripStatus Hook
 * Monitors a specific trip's status in real-time to detect when it's taken by another driver
 */

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

interface UseRealtimeTripStatusOptions {
  tripId: string | null
  onStatusChange?: (status: string, driverId: string | null) => void
}

export function useRealtimeTripStatus({ tripId, onStatusChange }: UseRealtimeTripStatusOptions) {
  const [tripStatus, setTripStatus] = useState<string | null>(null)
  const [tripDriverId, setTripDriverId] = useState<string | null>(null)
  const [isUnavailable, setIsUnavailable] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    if (!tripId) {
      setTripStatus(null)
      setTripDriverId(null)
      setIsUnavailable(false)
      return
    }

    // Subscribe to trip status changes
    const channel = supabase
      .channel(`trip-status-${tripId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'trips',
          filter: `id=eq.${tripId}`
        },
        (payload) => {
          const updatedTrip = payload.new as any
          const newStatus = updatedTrip.status
          const newDriverId = updatedTrip.driver_id

          setTripStatus(newStatus)
          setTripDriverId(newDriverId)

          // Trip is unavailable if status changed from 'pending' to 'active' 
          // and we're monitoring it (meaning another driver likely took it)
          if (newStatus === 'active' && newDriverId) {
            setIsUnavailable(true)
            onStatusChange?.(newStatus, newDriverId)
          }
        }
      )
      .subscribe()

    // Also fetch initial status
    const fetchInitialStatus = async () => {
      const { data, error } = await supabase
        .from('trips')
        .select('status, driver_id')
        .eq('id', tripId)
        .single()

      if (!error && data) {
        setTripStatus(data.status)
        setTripDriverId(data.driver_id)
        
        if (data.status === 'active' && data.driver_id) {
          setIsUnavailable(true)
        }
      }
    }

    fetchInitialStatus()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [tripId, supabase, onStatusChange])

  return {
    tripStatus,
    tripDriverId,
    isUnavailable,
  }
}





