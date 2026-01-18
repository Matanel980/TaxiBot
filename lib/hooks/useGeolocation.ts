'use client'

import { useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { getAddressFromCoords } from '@/lib/google-maps-loader'

interface UseGeolocationOptions {
  enabled: boolean
  driverId: string | null
  updateInterval?: number
}

export function useGeolocation({ enabled, driverId, updateInterval = 4000 }: UseGeolocationOptions) {
  const watchIdRef = useRef<number | null>(null)
  const lastPositionRef = useRef<{ lat: number; lng: number } | null>(null)
  const lastAddressRef = useRef<string | null>(null)
  const lastDbWriteTimeRef = useRef<number>(0)
  const pendingUpdateRef = useRef<boolean>(false)
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const supabase = createClient()

  // THROTTLE: Minimum 5 seconds between database writes (not debounce - writes happen at intervals)
  const MIN_DB_WRITE_INTERVAL = 5000 // 5 seconds between DB writes
  const minUpdateInterval = updateInterval // 4 seconds for geolocation checks

  useEffect(() => {
    if (!enabled || !driverId) {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      lastPositionRef.current = null
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current)
        updateTimeoutRef.current = null
      }
      return
    }

    if (!navigator.geolocation) {
      console.error('Geolocation is not supported by this browser')
      return
    }

    const minDistanceMeters = 10 // Only update if driver moved at least 10 meters

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

    // Throttled database write function (writes at fixed intervals, not on-demand)
    const writeLocationToDatabase = async (latitude: number, longitude: number, heading: number | null, address: string | null) => {
      // CRITICAL: Validate driverId before attempting write
      if (!driverId) {
        console.error('[useGeolocation] Cannot write location: driverId is missing', {
          driverId,
          enabled,
          latitude,
          longitude
        })
        return
      }

      const now = Date.now()
      const timeSinceLastWrite = now - lastDbWriteTimeRef.current

      // THROTTLE: Only write if enough time has passed
      if (timeSinceLastWrite < MIN_DB_WRITE_INTERVAL) {
        // Skip this write, schedule next one
        if (updateTimeoutRef.current) {
          clearTimeout(updateTimeoutRef.current)
        }
        const delay = MIN_DB_WRITE_INTERVAL - timeSinceLastWrite
        updateTimeoutRef.current = setTimeout(() => {
          writeLocationToDatabase(latitude, longitude, heading, address)
        }, delay)
        return
      }

      // Enough time passed - write now
      lastDbWriteTimeRef.current = now
      pendingUpdateRef.current = true

      try {
        const updateData: any = {
          latitude,
          longitude,
          updated_at: new Date().toISOString(),
        }
        if (heading !== null) updateData.heading = heading
        if (address !== null) updateData.current_address = address

        // Use UPDATE instead of UPSERT - profile must exist after migration
        // This ensures we're updating the correct profile with the migrated UUID
        // Add timeout protection to prevent hanging on network issues
        const updateQuery = supabase
          .from('profiles')
          .update(updateData)
          .eq('id', driverId) // CRITICAL: Use migrated UUID (auth.user.id)
          .select('id, latitude, longitude')
          .single()
        
        // Wrap Supabase query in a Promise for Promise.race
        // Convert PromiseLike to Promise and handle errors
        const updatePromise = Promise.resolve(updateQuery).then((response) => response).catch((err) => {
          // Convert Supabase errors to a consistent format
          throw err
        })
        
        // Race with timeout (5 seconds) to prevent hanging
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Location update timeout after 5 seconds')), 5000)
        })
        
        // Wrap Promise.race to handle both Supabase response and timeout errors
        let result: { data: any; error: any } | null = null
        let isTimeout = false
        
        try {
          result = await Promise.race([updatePromise, timeoutPromise])
        } catch (raceError: any) {
          // Promise.race rejects if timeout promise wins or if updatePromise throws
          isTimeout = raceError instanceof Error && raceError.message?.includes('timeout')
          
          if (isTimeout) {
            console.warn('[useGeolocation] Location update timeout - network may be slow:', {
              driverId,
              message: raceError.message || String(raceError),
              latitude,
              longitude
            })
          } else {
            // Other error from Supabase or unexpected error
            const errorMessage = raceError?.message || String(raceError) || 'Unknown error'
            const errorName = raceError?.name || raceError?.constructor?.name || 'Error'
            const errorType = typeof raceError
            
            console.error('[useGeolocation] Error updating location:', {
              error: errorMessage,
              errorName: errorName,
              errorType: errorType,
              errorString: String(raceError),
              errorValue: raceError,
              driverId,
              latitude,
              longitude,
              updateData
            })

            // Handle specific error codes if available
            if (raceError?.code === 'PGRST116' || errorMessage?.includes('0 rows')) {
              console.error('[useGeolocation] Profile not found - ID may not be migrated correctly:', {
                driverId,
                message: 'Profile with this ID does not exist. Ensure profile migration completed successfully.'
              })
            } else if (raceError?.code === '42501' || errorMessage?.includes('permission denied') || errorMessage?.includes('RLS')) {
              console.error('[useGeolocation] RLS policy violation - check profiles_update_own policy:', {
                driverId,
                message: 'Row Level Security policy may be blocking the update. Verify auth.uid() = id policy exists.'
              })
            } else if (raceError?.code === '23505' || errorMessage?.includes('409') || errorMessage?.includes('Conflict')) {
              console.warn('[useGeolocation] Database write conflict (409) - skipping. This is normal during concurrent updates.')
            }
          }
        }

        // Process result if Promise.race resolved successfully (not timeout)
        if (result && !isTimeout) {
          const { data, error } = result
          
          if (error) {
            // Enhanced error logging with full details
            console.error('[useGeolocation] Error updating location:', {
              error: error?.message || String(error) || 'Unknown error',
              code: error?.code || 'NO_CODE',
              details: error?.details || 'No details',
              hint: error?.hint || 'No hint',
              errorType: typeof error,
              driverId: driverId, // Log the UUID being used
              latitude,
              longitude,
              updateData
            })

            // Handle specific error codes
            if (error?.code === 'PGRST116' || error?.message?.includes('0 rows')) {
              console.error('[useGeolocation] Profile not found - ID may not be migrated correctly:', {
                driverId,
                message: 'Profile with this ID does not exist. Ensure profile migration completed successfully.'
              })
            } else if (error?.code === '42501' || error?.message?.includes('permission denied') || error?.message?.includes('RLS')) {
              console.error('[useGeolocation] RLS policy violation - check profiles_update_own policy:', {
                driverId,
                message: 'Row Level Security policy may be blocking the update. Verify auth.uid() = id policy exists.'
              })
            } else if (error?.code === '23505' || error?.message?.includes('409') || error?.message?.includes('Conflict')) {
              console.warn('[useGeolocation] Database write conflict (409) - skipping. This is normal during concurrent updates.')
            }
          } else if (data) {
            console.log('[useGeolocation] Location written to database successfully:', {
              driverId: data.id,
              latitude: data.latitude,
              longitude: data.longitude,
              timestamp: new Date().toISOString()
            })
          }
        }
      } catch (error: any) {
        // Enhanced exception logging - handle any error type robustly
        const errorMessage = error?.message || String(error) || 'Unknown exception'
        const errorName = error?.name || error?.constructor?.name || 'UnknownError'
        const errorStack = error?.stack || 'No stack trace available'
        const errorType = typeof error
        
        console.error('[useGeolocation] Exception updating location:', {
          error: errorMessage,
          errorName: errorName,
          errorType: errorType,
          errorString: String(error),
          stack: errorStack,
          driverId,
          latitude,
          longitude
        })
      } finally {
        pendingUpdateRef.current = false
      }
    }

    const updateLocation = async (position: GeolocationPosition) => {
      const now = Date.now()
      
      // Throttle updates to prevent excessive API calls (for geocoding)
      if (lastPositionRef.current && (now - lastDbWriteTimeRef.current < minUpdateInterval)) {
        // Still update local state (for map) but skip geocoding/DB write
        const { latitude, longitude } = position.coords
        const distance = calculateDistance(
          lastPositionRef.current.lat,
          lastPositionRef.current.lng,
          latitude,
          longitude
        )
        if (distance >= minDistanceMeters) {
          lastPositionRef.current = { lat: latitude, lng: longitude }
          // Map will update via realtime subscription, no need to force DB write
        }
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
      
      lastPositionRef.current = { lat: latitude, lng: longitude }

      // Get address asynchronously (don't block location update)
      // Write to database with throttling (5 second minimum)
      getAddressFromCoords(latitude, longitude)
        .then(address => {
          lastAddressRef.current = address
          // Write to database with throttling
          writeLocationToDatabase(latitude, longitude, heading || null, address)
        })
        .catch(error => {
          console.warn('[useGeolocation] Error getting address:', error)
          // Still write location even if address fails
          writeLocationToDatabase(latitude, longitude, heading || null, null)
        })
    }

    const errorHandler = (error: GeolocationPositionError) => {
      // Enhanced geolocation error logging with detailed messages
      const errorMessages: Record<number, string> = {
        1: 'PERMISSION_DENIED - User denied the request for geolocation',
        2: 'POSITION_UNAVAILABLE - Location information is unavailable',
        3: 'TIMEOUT - The request to get user location timed out'
      }
      
      const errorMessage = errorMessages[error.code] || `Unknown geolocation error (code: ${error.code})`
      
      console.error('[useGeolocation] Geolocation error:', {
        code: error.code,
        message: errorMessage,
        details: error.message || 'No additional details',
        driverId: driverId || 'NOT_SET',
        enabled
      })

      // Handle permission denied with user-friendly prompt
      if (error.code === 1) {
        // Permission denied - show user-friendly message
        console.warn('[useGeolocation] Location permission denied. Please enable location access in browser settings.')
        // Note: We can't show browser alerts in hooks, but the error is logged
        // The UI should handle showing a permission prompt if needed
      } else if (error.code === 2) {
        // Position unavailable - might be temporary
        console.warn('[useGeolocation] Location unavailable. This might be temporary. Retrying...')
      } else if (error.code === 3) {
        // Timeout - might be network/GPS issue
        console.warn('[useGeolocation] Location request timed out. GPS might be slow or unavailable.')
      }

      // Don't throw - allow graceful degradation
      // Location updates will resume if permission is granted later
      // The watchPosition will continue to retry automatically
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      updateLocation,
      errorHandler,
      {
        enableHighAccuracy: true,
        maximumAge: 2000, // Accept cached position up to 2 seconds old
        timeout: 5000, // 5 second timeout
      }
    )

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current)
        updateTimeoutRef.current = null
      }
      pendingUpdateRef.current = false
    }
  }, [enabled, driverId, supabase, minUpdateInterval])
}
