'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Trip } from '@/lib/supabase'

interface UseRealtimeTripsOptions {
  driverId: string
}

export function useRealtimeTrips({ driverId }: UseRealtimeTripsOptions) {
  const [pendingTrip, setPendingTrip] = useState<Trip | null>(null)
  const supabase = createClient()

  useEffect(() => {
    if (!driverId) {
      setPendingTrip(null)
      return
    }

    // Fetch initial pending trip
    const fetchPendingTrip = async () => {
      try {
        const { data, error } = await supabase
          .from('trips')
          .select('*')
          .eq('driver_id', driverId)
          .eq('status', 'pending')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle() // Use maybeSingle() instead of single() to handle no rows gracefully

        // PGRST116 = no rows found (this is expected when no pending trips)
        if (error && error.code !== 'PGRST116') {
          console.error('Error fetching pending trip:', error)
          return
        }

        // If no error or PGRST116 (no rows), set the trip or null
        if (data) {
          setPendingTrip(data)
        } else {
          setPendingTrip(null)
        }
      } catch (err) {
        // Handle any unexpected errors
        console.error('Unexpected error fetching pending trip:', err)
        setPendingTrip(null)
      }
    }

    fetchPendingTrip()

    // Subscribe to new trip assignments
    const channel = supabase
      .channel(`driver-trips-${driverId}`) // Unique channel per driver
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trips',
          filter: `driver_id=eq.${driverId}`
        },
        (payload) => {
          if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
            const trip = payload.new as Trip
            if (trip.status === 'pending') {
              setPendingTrip(trip)
            } else {
              // If trip is no longer pending, clear it
              setPendingTrip(null)
            }
          } else if (payload.eventType === 'DELETE') {
            setPendingTrip(null)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [driverId, supabase])

  const clearPendingTrip = () => {
    setPendingTrip(null)
  }

  return { pendingTrip, clearPendingTrip }
}


