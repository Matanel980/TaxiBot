'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import type { Profile, Trip } from '@/lib/supabase'

/**
 * Progressive Data Loading Hook
 * 
 * Implements progressive hydration strategy:
 * 1. Critical data (100ms): id, full_name, is_online, role, latitude, longitude
 * 2. Secondary data (500ms): vehicle_number, car_type, current_zone, station_id, etc.
 * 3. Active trip (background): Load after critical data
 * 
 * This ensures the map and basic UI render immediately while secondary data loads in background.
 */
interface UseProgressiveDataOptions {
  onCriticalDataLoaded?: (profile: Partial<Profile>) => void
  onSecondaryDataLoaded?: (profile: Profile) => void
  onActiveTripLoaded?: (trip: Trip | null) => void
  onError?: (error: Error) => void
}

interface UseProgressiveDataReturn {
  // Critical data (available immediately)
  criticalData: {
    id: string | null
    full_name: string | null
    is_online: boolean
    role: string | null
    latitude: number | null
    longitude: number | null
  } | null
  
  // Full profile (available after secondary load)
  fullProfile: Profile | null
  
  // Active trip
  activeTrip: Trip | null
  
  // Loading states
  criticalLoading: boolean
  secondaryLoading: boolean
  tripLoading: boolean
  
  // Error state
  error: Error | null
  
  // Refetch functions
  refetchCritical: () => Promise<void>
  refetchSecondary: () => Promise<void>
  refetchTrip: () => Promise<void>
}

export function useProgressiveData({
  onCriticalDataLoaded,
  onSecondaryDataLoaded,
  onActiveTripLoaded,
  onError,
}: UseProgressiveDataOptions = {}): UseProgressiveDataReturn {
  const supabase = createClient()
  const isMountedRef = useRef(true)
  
  // State for critical data (loads first - ~100ms)
  const [criticalData, setCriticalData] = useState<UseProgressiveDataReturn['criticalData']>(null)
  const [criticalLoading, setCriticalLoading] = useState(true)
  
  // State for full profile (loads second - ~500ms)
  const [fullProfile, setFullProfile] = useState<Profile | null>(null)
  const [secondaryLoading, setSecondaryLoading] = useState(false)
  
  // State for active trip (loads in background)
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null)
  const [tripLoading, setTripLoading] = useState(false)
  
  // Error state
  const [error, setError] = useState<Error | null>(null)

  /**
   * Phase 1: Fetch Critical Data
   * Minimal data needed to render map and basic UI
   * Expected time: ~100-300ms
   */
  const fetchCriticalData = useCallback(async () => {
    try {
      setCriticalLoading(true)
      setError(null)

      const { data: { user }, error: authError } = await supabase.auth.getUser()
      
      if (!isMountedRef.current) return
      
      if (authError) {
        throw new Error(`Authentication error: ${authError.message}`)
      }

      if (!user) {
        throw new Error('No authenticated user found')
      }

      // Fetch only critical columns for fast initial render
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('id, full_name, is_online, role, latitude, longitude')
        .eq('id', user.id)
        .single()

      if (!isMountedRef.current) return

      if (profileError) {
        // CRITICAL FIX: Provide more specific error messages
        if (profileError.code === 'PGRST116' || profileError.message?.includes('406') || profileError.message?.includes('No rows')) {
          throw new Error('Profile not found or RLS policy issue')
        }
        // Check for RLS recursion error
        if (profileError.code === '42P17' || profileError.message?.includes('infinite recursion')) {
          throw new Error('RLS policy recursion error - contact admin')
        }
        throw new Error(`Profile fetch error: ${profileError.message || profileError.code || 'Unknown error'}`)
      }

      if (data) {
        const critical = {
          id: data.id,
          full_name: data.full_name,
          is_online: !!data.is_online,
          role: data.role,
          latitude: data.latitude,
          longitude: data.longitude,
        }

        if (isMountedRef.current) {
          setCriticalData(critical)
          setCriticalLoading(false)
          onCriticalDataLoaded?.(critical)
        }
      }
    } catch (err: any) {
      if (!isMountedRef.current) return
      
      const error = err instanceof Error ? err : new Error(String(err))
      setError(error)
      setCriticalLoading(false)
      onError?.(error)
      console.error('[useProgressiveData] Critical data fetch error:', error)
    }
  }, [supabase, onCriticalDataLoaded, onError])

  /**
   * Phase 2: Fetch Secondary Data
   * Full profile with all columns
   * Expected time: ~300-500ms (after critical)
   */
  const fetchSecondaryData = useCallback(async () => {
    if (!criticalData?.id) {
      console.warn('[useProgressiveData] Cannot fetch secondary data: no critical data')
      return
    }

    try {
      setSecondaryLoading(true)
      setError(null)

      const { data, error: profileError } = await supabase
        .from('profiles')
        .select('id, phone, role, full_name, vehicle_number, car_type, current_zone, is_online, is_approved, latitude, longitude, current_address, heading, updated_at, station_id')
        .eq('id', criticalData.id)
        .single()

      if (!isMountedRef.current) return

      if (profileError) {
        if (profileError.code === 'PGRST116' || profileError.message?.includes('406')) {
          throw new Error('Profile not found or RLS policy issue')
        }
        throw new Error(`Secondary data fetch error: ${profileError.message}`)
      }

      if (data) {
        const profile = data as Profile
        if (isMountedRef.current) {
          setFullProfile(profile)
          setSecondaryLoading(false)
          onSecondaryDataLoaded?.(profile)
        }
      }
    } catch (err: any) {
      if (!isMountedRef.current) return
      
      const error = err instanceof Error ? err : new Error(String(err))
      setError(error)
      setSecondaryLoading(false)
      onError?.(error)
      console.error('[useProgressiveData] Secondary data fetch error:', error)
    }
  }, [criticalData?.id, supabase, onSecondaryDataLoaded, onError])

  /**
   * Phase 3: Fetch Active Trip
   * Load in background after critical data
   * Expected time: ~200-400ms (non-blocking)
   */
  const fetchActiveTrip = useCallback(async (driverId: string, stationId: string | null) => {
    try {
      setTripLoading(true)
      setError(null)

      // STATION-AWARE: Filter trips by driver_id AND station_id (defense-in-depth)
      const { data: trip, error: tripError } = await supabase
        .from('trips')
        .select('id, customer_phone, pickup_address, destination_address, status, driver_id, created_at, updated_at, station_id')
        .eq('driver_id', driverId)
        .eq('status', 'active')
        .eq('station_id', stationId || '') // STATION FILTER (if station_id exists)
        .maybeSingle() // Use maybeSingle instead of single to handle no rows gracefully

      if (!isMountedRef.current) return

      if (tripError) {
        // Handle 406 errors specifically
        if (tripError.code === 'PGRST116') {
          // No active trip found - this is normal, not an error
          if (isMountedRef.current) {
            setActiveTrip(null)
            setTripLoading(false)
            onActiveTripLoaded?.(null)
          }
          return
        } else if (tripError.message?.includes('406') || tripError.message?.includes('Not Acceptable')) {
          console.error('[useProgressiveData] 406 Error on trip fetch - Attempting fallback...')
          // Try fallback with minimal columns (still station-aware)
          const { data: fallbackTrip } = await supabase
            .from('trips')
            .select('id, status, driver_id')
            .eq('driver_id', driverId)
            .eq('status', 'active')
            .eq('station_id', stationId || '') // STATION FILTER
            .maybeSingle()
          
          if (!isMountedRef.current) return
          
          if (fallbackTrip) {
            // Map fallback to full Trip type
            const mappedTrip = {
              ...fallbackTrip,
              customer_phone: '',
              pickup_address: '',
              destination_address: '',
              created_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            } as Trip
            
            if (isMountedRef.current) {
              setActiveTrip(mappedTrip)
              setTripLoading(false)
              onActiveTripLoaded?.(mappedTrip)
            }
          } else {
            if (isMountedRef.current) {
              setActiveTrip(null)
              setTripLoading(false)
              onActiveTripLoaded?.(null)
            }
          }
          return
        } else {
          console.error('[useProgressiveData] Trip fetch error:', tripError)
          if (isMountedRef.current) {
            setActiveTrip(null)
            setTripLoading(false)
            onActiveTripLoaded?.(null)
          }
          return
        }
      }

      if (trip) {
        if (isMountedRef.current) {
          setActiveTrip(trip as Trip)
          setTripLoading(false)
          onActiveTripLoaded?.(trip as Trip)
        }
      } else {
        if (isMountedRef.current) {
          setActiveTrip(null)
          setTripLoading(false)
          onActiveTripLoaded?.(null)
        }
      }
    } catch (err: any) {
      if (!isMountedRef.current) return
      
      console.error('[useProgressiveData] Unexpected error fetching trip:', err)
      if (isMountedRef.current) {
        setActiveTrip(null)
        setTripLoading(false)
        onActiveTripLoaded?.(null)
      }
      // Don't throw - trip fetch failure shouldn't block UI
    }
  }, [supabase, onActiveTripLoaded])

  // Initial load: Fetch critical data first
  useEffect(() => {
    isMountedRef.current = true
    fetchCriticalData()

    return () => {
      isMountedRef.current = false
    }
  }, [fetchCriticalData])

  // After critical data loads, fetch secondary data
  useEffect(() => {
    if (!criticalLoading && criticalData && !fullProfile) {
      // Small delay to allow UI to render with critical data first
      const timer = setTimeout(() => {
        fetchSecondaryData()
      }, 50) // 50ms delay for UI to render

      return () => clearTimeout(timer)
    }
  }, [criticalLoading, criticalData, fullProfile, fetchSecondaryData])

  // After critical data loads, fetch active trip in background
  useEffect(() => {
    if (!criticalLoading && criticalData?.id && fullProfile?.station_id !== undefined) {
      // Fetch trip in background (non-blocking)
      fetchActiveTrip(criticalData.id, fullProfile.station_id || null)
    }
  }, [criticalLoading, criticalData?.id, fullProfile?.station_id, fetchActiveTrip])

  // Refetch functions for manual refresh
  const refetchCritical = useCallback(async () => {
    await fetchCriticalData()
  }, [fetchCriticalData])

  const refetchSecondary = useCallback(async () => {
    await fetchSecondaryData()
  }, [fetchSecondaryData])

  const refetchTrip = useCallback(async () => {
    if (criticalData?.id && fullProfile?.station_id !== undefined) {
      await fetchActiveTrip(criticalData.id, fullProfile.station_id || null)
    }
  }, [criticalData?.id, fullProfile?.station_id, fetchActiveTrip])

  return {
    criticalData,
    fullProfile,
    activeTrip,
    criticalLoading,
    secondaryLoading,
    tripLoading,
    error,
    refetchCritical,
    refetchSecondary,
    refetchTrip,
  }
}
