'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useStation } from '@/lib/hooks/useStation'
import type { Trip } from '@/lib/supabase'

interface UseRealtimeTripsOptions {
  driverId: string
}

export function useRealtimeTrips({ driverId }: UseRealtimeTripsOptions) {
  const [pendingTrip, setPendingTrip] = useState<Trip | null>(null)
  const supabase = createClient()
  const { stationId } = useStation()

  useEffect(() => {
    if (!driverId || !stationId) {
      setPendingTrip(null)
      return
    }

    // Fetch initial pending trip with explicit columns
    // STATION-AWARE: Filter by driver_id AND station_id (defense-in-depth)
    const fetchPendingTrip = async () => {
      try {
        const { data, error } = await supabase
          .from('trips')
          .select('id, customer_phone, pickup_address, destination_address, status, driver_id, created_at, updated_at, station_id')
          .eq('driver_id', driverId)
          .eq('status', 'pending')
          .eq('station_id', stationId) // STATION FILTER
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle() // Use maybeSingle() instead of single() to handle no rows gracefully

        // PGRST116 = no rows found (this is expected when no pending trips)
        if (error) {
          if (error.code === 'PGRST116') {
            // No pending trip - this is normal
            setPendingTrip(null)
            return
          } else if (error.message?.includes('406') || error.message?.includes('Not Acceptable')) {
            console.error('[useRealtimeTrips] 406 Error - Attempting fallback...')
            // Try fallback with minimal columns (still station-aware)
            const { data: fallbackData } = await supabase
              .from('trips')
              .select('id, status, driver_id')
              .eq('driver_id', driverId)
              .eq('status', 'pending')
              .eq('station_id', stationId) // STATION FILTER
              .order('created_at', { ascending: false })
              .limit(1)
              .maybeSingle()
            
            if (fallbackData) {
              // Map to full Trip type with defaults
              setPendingTrip({
                ...fallbackData,
                customer_phone: '',
                pickup_address: '',
                destination_address: '',
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString()
              } as Trip)
            } else {
              setPendingTrip(null)
            }
            return
          } else {
            console.error('Error fetching pending trip:', error)
            setPendingTrip(null)
            return
          }
        }

        // If no error, set the trip or null
        if (data) {
          setPendingTrip(data as Trip)
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
  }, [driverId, stationId, supabase]) // Add stationId dependency

  const clearPendingTrip = () => {
    setPendingTrip(null)
  }

  return { pendingTrip, clearPendingTrip }
}


