'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { getAddressFromCoords } from '@/lib/google-maps-loader'

interface UseGeolocationOptions {
  enabled: boolean
  driverId: string
  updateInterval?: number
}

export function useGeolocation({ enabled, driverId, updateInterval = 4000 }: UseGeolocationOptions) {
  const watchIdRef = useRef<number | null>(null)
  const lastPositionRef = useRef<{ lat: number; lng: number } | null>(null)
  const lastAddressRef = useRef<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    if (!enabled || !driverId) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      lastPositionRef.current = null
      return
    }

    if (!navigator.geolocation) {
      console.error('Geolocation is not supported by this browser')
      return
    }

    let lastUpdateTime = 0
    const minUpdateInterval = updateInterval // 4 seconds
    const minDistanceMeters = 10 // Only update if driver moved at least 10 meters (Waze-like threshold)

    // Helper function to calculate distance between two coordinates (Haversine formula)
    const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
      const R = 6371e3 // Earth's radius in meters
      const φ1 = lat1 * Math.PI / 180
      const φ2 = lat2 * Math.PI / 180
      const Δφ = (lat2 - lat1) * Math.PI / 180
      const Δλ = (lon2 - lon1) * Math.PI / 180

      const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
                Math.cos(φ1) * Math.cos(φ2) *
                Math.sin(Δλ/2) * Math.sin(Δλ/2)
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))

      return R * c // Distance in meters
    }

    const updateLocation = async (position: GeolocationPosition) => {
      const now = Date.now()
      
      // Throttle updates to prevent excessive API calls
      if (now - lastUpdateTime < minUpdateInterval) {
        return
      }
      
      const { latitude, longitude, heading } = position.coords
      
      // Check if driver actually moved significantly (10m threshold)
      if (lastPositionRef.current) {
        const distance = calculateDistance(
          lastPositionRef.current.lat,
          lastPositionRef.current.lng,
          latitude,
          longitude
        )
        
        if (distance < minDistanceMeters) {
          return
        }
      }
      
      lastUpdateTime = now
      lastPositionRef.current = { lat: latitude, lng: longitude }
      
      try {
        // Reverse Geocode with its own safety wrapper
        let address = null
        try {
          address = await getAddressFromCoords(latitude, longitude)
        } catch (geoErr) {
          console.warn('[Geolocation] Reverse geocoding failed, continuing with coordinates only:', geoErr)
        }
        
        console.log('[Geolocation] Updating driver location:', {
          driverId,
          latitude,
          longitude,
          heading,
          address,
          timestamp: new Date().toISOString()
        })

        const { data, error } = await supabase
          .from('profiles')
          .update({
            latitude,
            longitude,
            heading,
            current_address: address,
            updated_at: new Date().toISOString()
          })
          .eq('id', driverId)
          .select('id, is_online, latitude, longitude, current_address, heading, updated_at')

        if (error) {
          console.error('[Geolocation] ❌ Error updating location:', {
            error: error.message,
            code: error.code,
            details: error.details,
            hint: error.hint,
            driverId,
            latitude,
            longitude
          })
          
          // Check if it's an RLS policy issue
          if (error.code === '42501' || error.message?.includes('permission denied') || error.message?.includes('policy')) {
            console.error('[Geolocation] 🔒 RLS POLICY BLOCKING UPDATE - Driver may not have permission to update location')
          }
          
          lastPositionRef.current = null
        } else {
          console.log('[Geolocation] ✅ Location updated successfully and broadcast via Realtime:', {
            driverId,
            latitude,
            longitude,
            heading,
            address,
            timestamp: new Date().toISOString(),
            data: data?.[0]
          })
        }
      } catch (err) {
        console.error('[Geolocation] Unexpected error:', err)
        lastPositionRef.current = null
      }
    }

    // Use watchPosition for continuous updates (more efficient than getCurrentPosition + interval)
    watchIdRef.current = navigator.geolocation.watchPosition(
      updateLocation,
      (error) => {
        // Handle specific geolocation error codes
        let errorMessage = 'Unknown geolocation error'
        switch (error.code) {
          case error.PERMISSION_DENIED:
            errorMessage = 'Geolocation permission denied. Please enable location access.'
            break
          case error.POSITION_UNAVAILABLE:
            errorMessage = 'Location information unavailable.'
            break
          case error.TIMEOUT:
            errorMessage = 'Location request timed out.'
            break
          default:
            errorMessage = `Geolocation error: ${error.message || 'Unknown error'}`
        }
        
        // Only log errors, don't spam console
        if (error.code !== error.TIMEOUT || Math.random() < 0.1) { // Log 10% of timeout errors
          console.warn('Geolocation error:', errorMessage, error.code)
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 5000, // Reduced from 10s to 5s
        maximumAge: 2000 // Accept cached position up to 2 seconds old
      }
    )

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      lastPositionRef.current = null
    }
  }, [enabled, driverId, updateInterval, supabase])
}


