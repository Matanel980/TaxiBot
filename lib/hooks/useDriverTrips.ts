import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

interface UseDriverTripsOptions {
  driverIds: string[]
}

interface DriverTripStatus {
  [driverId: string]: {
    hasActiveTrip: boolean
    tripId?: string
  }
}

/**
 * Hook to track which drivers have active trips
 * Updates in real-time via Supabase subscriptions
 */
export function useDriverTrips({ driverIds }: UseDriverTripsOptions) {
  const [driverTrips, setDriverTrips] = useState<DriverTripStatus>({})
  const supabase = createClient()

  useEffect(() => {
    if (driverIds.length === 0) return

    // Initial fetch
    const fetchTrips = async () => {
      const { data, error } = await supabase
        .from('trips')
        .select('id, driver_id')
        .eq('status', 'active')
        .in('driver_id', driverIds)

      if (data && !error) {
        const tripStatus: DriverTripStatus = {}
        driverIds.forEach(id => {
          tripStatus[id] = { hasActiveTrip: false }
        })
        data.forEach(trip => {
          if (trip.driver_id) {
            tripStatus[trip.driver_id] = {
              hasActiveTrip: true,
              tripId: trip.id
            }
          }
        })
        setDriverTrips(tripStatus)
      }
    }

    fetchTrips()

    // Subscribe to real-time changes
    const channel = supabase
      .channel('driver-trips-status')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trips'
        },
        (payload) => {
          if (payload.eventType === 'UPDATE' || payload.eventType === 'INSERT') {
            const trip = payload.new as any
            if (trip.driver_id && driverIds.includes(trip.driver_id)) {
              setDriverTrips(prev => ({
                ...prev,
                [trip.driver_id]: {
                  hasActiveTrip: trip.status === 'active',
                  tripId: trip.status === 'active' ? trip.id : undefined
                }
              }))
            }
          } else if (payload.eventType === 'DELETE') {
            const trip = payload.old as any
            if (trip.driver_id && driverIds.includes(trip.driver_id)) {
              setDriverTrips(prev => ({
                ...prev,
                [trip.driver_id]: {
                  hasActiveTrip: false
                }
              }))
            }
          }
        }
      )
      .subscribe()

    return () => {
      channel.unsubscribe()
    }
  }, [driverIds.join(','), supabase])

  return driverTrips
}

