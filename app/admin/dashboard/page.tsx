'use client'

import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { createClient } from '@/lib/supabase'
import { StatusBar } from '@/components/admin/StatusBar'
import { AdminLiveMap } from '@/components/admin/AdminLiveMap'
import { TripSidebar } from '@/components/admin/TripSidebar'
import { TripDetailPanel } from '@/components/admin/TripDetailPanel'
import { NewTripModal } from '@/components/admin/NewTripModal'
import { TestTripButton } from '@/components/admin/TestTripButton'
import { AdminManagement } from '@/components/admin/AdminManagement'
import type { Profile, Trip, ZonePostGIS } from '@/lib/supabase'
import { featureToZone } from '@/lib/spatial-utils'
import { motion } from 'framer-motion'
import { AlertCircle, Plus, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/hooks/useToast'
import { useStation } from '@/lib/hooks/useStation'
import { toast } from 'sonner'

interface DataState {
  drivers: Profile[]
  trips: Trip[]
  zones: ZonePostGIS[]
  loading: boolean
  error: string | null
  dbConnected: boolean
}

export default function AdminDashboard() {
  const [data, setData] = useState<DataState>({
    drivers: [],
    trips: [],
    zones: [],
    loading: true,
    error: null,
    dbConnected: false,
  })
  const [presenceMap, setPresenceMap] = useState<Record<string, boolean>>({})
  const [newTripOpen, setNewTripOpen] = useState(false)
  const [selectedTripId, setSelectedTripId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'management'>('dashboard')
  const [driverSearchQuery, setDriverSearchQuery] = useState('') // Search filter for drivers
  const supabase = createClient()
  const { stationId, loading: stationLoading, error: stationError } = useStation()

  // Wrap fetchData in useCallback to prevent infinite loops
  const fetchData = useCallback(async (isMountedRef?: { current: boolean }) => {
    // CRITICAL: Don't fetch if station_id is not loaded yet
    if (!stationId) {
      console.log('[Admin Dashboard] Waiting for station_id...')
      if (!isMountedRef || isMountedRef.current) {
        setData(prev => ({ ...prev, loading: stationLoading, error: stationError || 'ממתין לזיהוי תחנה...' }))
      }
      return
    }

    try {
      setData(prev => ({ ...prev, loading: true, error: null }))

      // Fetch drivers - STATION-AWARE: Filter by station_id
      // CRITICAL: Use explicit column list matching exact schema
      const { data: driversData, error: driversError } = await supabase
        .from('profiles')
        .select('id, phone, role, full_name, vehicle_number, current_zone, is_online, is_approved, latitude, longitude, current_address, heading, updated_at, station_id')
        .eq('role', 'driver')
        .eq('station_id', stationId) // STATION FILTER
        .order('full_name', { ascending: true })

      if (driversError) {
        // Handle errors gracefully - log but don't spam console
        const errorMessage = typeof driversError === 'object' && 'message' in driversError ? driversError.message : String(driversError)
        const errorCode = typeof driversError === 'object' && 'code' in driversError ? driversError.code : undefined
        
        // Only log 406 errors if they persist (should be fixed by RLS script)
        if (errorCode === 'PGRST106' || errorCode === 'PGRST116' || errorMessage?.includes('406') || errorMessage?.includes('Not Acceptable')) {
          console.error('[Admin Dashboard] ⚠️ 406 Error detected:', { code: errorCode, message: errorMessage })
          console.error('[Admin Dashboard] 💡 If this persists, verify RLS policies were applied correctly')
          
          // Fallback: Try with minimal columns (still station-aware)
          const { data: fallbackData, error: fallbackError } = await supabase
            .from('profiles')
            .select('id, role, full_name, is_online, latitude, longitude, heading')
            .eq('role', 'driver')
            .eq('station_id', stationId) // STATION FILTER
            .order('full_name', { ascending: true })
          
          if (fallbackError) {
            console.error('[Admin Dashboard] ❌ Fallback failed. Please verify RLS policies.')
            if (!isMountedRef || isMountedRef.current) {
              setData(prev => ({
                ...prev,
                error: 'שגיאת RLS. אנא ודא שהרצת את supabase-rls-power-fix.sql.',
                dbConnected: false,
                loading: false,
                drivers: []
              }))
            }
            return
          } else {
            // Use fallback data
            if (!isMountedRef || isMountedRef.current) {
              const mappedDrivers = (fallbackData || []).map((d: any) => ({
                ...d,
                phone: d.phone || '',
                vehicle_number: d.vehicle_number || null,
                current_zone: d.current_zone || null,
                is_approved: d.is_approved ?? true,
                current_address: d.current_address || null,
                heading: d.heading || null,
                updated_at: d.updated_at || new Date().toISOString()
              })) as Profile[]
              
              setData(prev => ({
                ...prev,
                drivers: mappedDrivers,
                dbConnected: true,
              }))
            }
          }
        } else if (driversError.message?.includes('relation') && driversError.message?.includes('does not exist')) {
          if (!isMountedRef || isMountedRef.current) {
            setData(prev => ({
              ...prev,
              error: 'טבלת profiles לא קיימת. אנא הרץ את המיגרציה ב-Supabase.',
              dbConnected: false,
              loading: false,
              drivers: []
            }))
          }
          return
        } else {
          // Other errors - log once
          console.error('[Admin Dashboard] Error fetching drivers:', driversError.message || driversError)
          if (!isMountedRef || isMountedRef.current) {
            setData(prev => ({
              ...prev,
              error: `שגיאה בטעינת נהגים: ${driversError.message || 'Unknown error'}`,
              loading: false,
              drivers: []
            }))
          }
          return
        }
      } else {
        if (!isMountedRef || isMountedRef.current) {
          // VALIDATE: Filter and log driver locations
          // CRITICAL: Verify driver IDs are UUIDs (not phone numbers) after migration
          const validDrivers = (driversData || []).filter(d => {
            const hasValidCoords = 
              d.latitude && d.longitude && 
              typeof d.latitude === 'number' && typeof d.longitude === 'number' &&
              !isNaN(d.latitude) && !isNaN(d.longitude) &&
              d.latitude >= -90 && d.latitude <= 90 &&
              d.longitude >= -180 && d.longitude <= 180 &&
              (d.latitude !== 0 || d.longitude !== 0)
            
            // Verify ID is UUID format (not phone number)
            const isUUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(d.id)
            if (!isUUID) {
              console.warn('[Admin Dashboard] ⚠️ Driver ID is not UUID format (may need migration):', {
                id: d.id,
                name: d.full_name,
                phone: d.phone
              })
            }
            
            return hasValidCoords
          })
          
          console.log('[Admin Dashboard] ✅ Initial drivers loaded:', {
            total: driversData?.length || 0,
            withValidLocation: validDrivers.length,
            invalidLocations: (driversData?.length || 0) - validDrivers.length,
            stationId: stationId,
            sampleDrivers: validDrivers.slice(0, 3).map(d => ({
              id: d.id,
              name: d.full_name,
              lat: d.latitude,
              lng: d.longitude,
              is_online: d.is_online
            }))
          })
          
          setData(prev => ({
            ...prev,
            drivers: driversData || [],
            dbConnected: true,
          }))
        }
      }

      // Fetch trips - STATION-AWARE: Filter by station_id
      try {
        const { data: tripsData, error: tripsError } = await supabase
          .from('trips')
          .select('id, customer_phone, pickup_address, destination_address, status, driver_id, pickup_lat, pickup_lng, destination_lat, destination_lng, created_at, updated_at, station_id')
          .eq('station_id', stationId) // STATION FILTER
          .order('created_at', { ascending: false })
          .limit(100)

        if (tripsError) {
          // Handle 406 errors specifically
          if (tripsError.message?.includes('406') || tripsError.message?.includes('Not Acceptable')) {
            console.error('[Admin Dashboard] 406 Error on trips fetch - Attempting fallback...')
            // Try fallback with minimal columns (still station-aware)
            const { data: fallbackTrips } = await supabase
              .from('trips')
              .select('id, status, driver_id, created_at')
              .eq('station_id', stationId) // STATION FILTER
              .order('created_at', { ascending: false })
              .limit(100)
            
            if (fallbackTrips && (!isMountedRef || isMountedRef.current)) {
              // Map to full Trip type with defaults
              const mappedTrips = fallbackTrips.map((t: any) => ({
                ...t,
                customer_phone: '',
                pickup_address: '',
                destination_address: '',
                updated_at: t.created_at || new Date().toISOString()
              })) as Trip[]
              
              setData(prev => ({
                ...prev,
                trips: mappedTrips,
              }))
            } else if (!isMountedRef || isMountedRef.current) {
              setData(prev => ({
                ...prev,
                trips: [], // Empty array to allow dashboard to load
              }))
            }
          } else if (!tripsError.message?.includes('relation') && (!isMountedRef || isMountedRef.current)) {
            // Other errors - log once
            console.error('[Admin Dashboard] Error fetching trips:', tripsError.message)
            setData(prev => ({
              ...prev,
              error: prev.error || `שגיאה בטעינת נסיעות: ${tripsError.message}`,
              trips: [],
            }))
          } else if (!isMountedRef || isMountedRef.current) {
            setData(prev => ({
              ...prev,
              trips: [], // Empty array to allow dashboard to load
            }))
          }
        } else if (!isMountedRef || isMountedRef.current) {
          setData(prev => ({
            ...prev,
            trips: tripsData || [],
          }))
        }
      } catch (tripsFetchError) {
        console.error('Exception fetching trips:', tripsFetchError)
        if (!isMountedRef || isMountedRef.current) {
          setData(prev => ({
            ...prev,
            trips: [], // Empty array to allow dashboard to load
          }))
        }
      }

      // Fetch zones - STATION-AWARE: Filter by station_id via API
      try {
        const response = await fetch('/api/zones')
        if (response.ok) {
          const featureCollection = await response.json()
          if (featureCollection.type === 'FeatureCollection' && featureCollection.features) {
            // Filter zones by station_id on client side (API will also filter, but double-check)
            const zonesData = featureCollection.features
              .map((feature: any) => featureToZone(feature))
              .filter((zone: ZonePostGIS) => zone.station_id === stationId) // STATION FILTER
            if (!isMountedRef || isMountedRef.current) {
              setData(prev => ({
                ...prev,
                zones: zonesData,
              }))
            }
          }
        }
      } catch (zonesError) {
        console.error('Error fetching zones:', zonesError)
      }

      if (!isMountedRef || isMountedRef.current) {
        setData(prev => ({ ...prev, loading: false }))
      }
    } catch (error) {
      console.error('Error in fetchData:', error)
      if (!isMountedRef || isMountedRef.current) {
        setData(prev => ({
          ...prev,
          error: 'שגיאה כללית בטעינת הנתונים',
          loading: false,
        }))
      }
    }
  }, [supabase, stationId]) // Add stationId as dependency

  // Fetch data on mount and set up real-time subscriptions
  useEffect(() => {
    // Don't set up subscriptions if station_id is not loaded
    if (!stationId) {
      console.log('[Admin Dashboard] Skipping subscriptions - waiting for station_id')
      return
    }

    const isMountedRef = { current: true }
    const timeoutRefs: NodeJS.Timeout[] = []

    // CRITICAL: Handle background tab recovery - resubscribe when tab regains focus
    const handleVisibilityChange = () => {
      if (!document.hidden && isMountedRef.current) {
        console.log('[Admin Dashboard] Tab regained focus - refreshing data and subscriptions')
        // Refetch data to ensure freshness
        fetchData(isMountedRef)
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    // Initial fetch
    fetchData(isMountedRef)

    // Set up real-time subscription for drivers - STATION-AWARE
    // CRITICAL: Subscribe to ALL driver updates, then filter by station_id in callback
    // This ensures we catch location updates (latitude/longitude changes) for drivers in our station
    const driversChannel = supabase
      .channel('admin-dashboard-drivers')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen to INSERT, UPDATE, DELETE
          schema: 'public',
          table: 'profiles',
          filter: `role=eq.driver` // Filter by role only (can't filter by station_id in subscription filter)
        },
        (payload) => {
          // CRITICAL: Filter by station_id in callback to ensure we only process our station's drivers
          const newStationId = (payload.new as any)?.station_id
          const oldStationId = (payload.old as any)?.station_id
          
          // Process if:
          // 1. New record has matching station_id (INSERT or UPDATE)
          // 2. Old record had matching station_id (DELETE or UPDATE that changed station_id)
          // 3. This is a location update (latitude/longitude changed) for our station
          const isOurStation = newStationId === stationId || oldStationId === stationId
          
          if (!isOurStation && payload.eventType !== 'DELETE') {
            // Log filtered-out updates for debugging
            console.debug('[Admin Dashboard] Driver change filtered out (different station):', {
              eventType: payload.eventType,
              driverStationId: newStationId || oldStationId,
              ourStationId: stationId
            })
            return
          }
          
          const driverId = (payload.new as any)?.id || (payload.old as any)?.id
          const updatedDriver = payload.new as any as Profile
          const previousDriver = payload.old as any
          
          // INCREMENTAL UPDATE: For UPDATE events, update only the specific driver in state
          // This prevents full page refresh and maintains UI stability
          if (payload.eventType === 'UPDATE' && isOurStation && isMountedRef.current) {
            console.log('[Admin Dashboard] Driver update (incremental):', {
              driverId,
              isOnline: updatedDriver?.is_online,
              hasLocation: !!(updatedDriver?.latitude && updatedDriver?.longitude),
              latitude: updatedDriver?.latitude,
              longitude: updatedDriver?.longitude
            })
            
            // Detect status change for toast notification
            const statusChanged = previousDriver?.is_online !== updatedDriver?.is_online
            const wasOffline = previousDriver?.is_online === false
            const isNowOnline = updatedDriver?.is_online === true
            
            // Use functional update to preserve reference stability and prevent re-renders
            setData(prev => {
              // Find driver index
              const driverIndex = prev.drivers.findIndex(d => d.id === driverId)
              
              // If driver not found in current list, skip update (might be from different station)
              if (driverIndex === -1) {
                console.debug('[Admin Dashboard] Driver not found in current list, skipping incremental update:', driverId)
                return prev // Return same reference to prevent re-render
              }
              
              // Create new drivers array with updated driver
              const updatedDrivers = [...prev.drivers]
              updatedDrivers[driverIndex] = {
                ...updatedDrivers[driverIndex],
                ...updatedDriver, // Merge all updated fields (latitude, longitude, is_online, etc.)
              }
              
              // Show toast notification for status changes
              if (statusChanged && wasOffline && isNowOnline) {
                toast.success('נהג התחבר', {
                  description: `${updatedDriver?.full_name || 'נהג'} עכשיו פעיל`
                })
              } else if (statusChanged && !isNowOnline) {
                toast.info('נהג התנתק', {
                  description: `${updatedDriver?.full_name || 'נהג'} עכשיו לא פעיל`
                })
              }
              
              // Return new state with updated drivers array
              return {
                ...prev,
                drivers: updatedDrivers,
                // NO loading state change - keep UI stable
              }
            })
          } 
          // FULL REFETCH: Only for INSERT/DELETE events where we need complete data
          else if ((payload.eventType === 'INSERT' || payload.eventType === 'DELETE') && isMountedRef.current) {
            console.log('[Admin Dashboard] Driver insert/delete detected - full refetch:', {
              eventType: payload.eventType,
              driverId,
              stationId: newStationId || oldStationId
            })
            
            // Only refetch for structural changes (new driver added or removed)
            fetchData(isMountedRef)
          }
        }
      )
      .subscribe((status) => {
        console.log('[Admin Dashboard] Drivers subscription status:', status)
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to driver location updates')
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to driver updates. Check Supabase Realtime publications.')
        } else if (status === 'TIMED_OUT') {
          console.warn('⚠️ Driver subscription timed out. Check network connection.')
        }
      })

    // Set up real-time subscription for trips - STATION-AWARE
    const tripsChannel = supabase
      .channel('admin-dashboard-trips')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'trips'
        },
        (payload) => {
          // Only process if station_id matches
          const newStationId = (payload.new as any)?.station_id
          if (newStationId === stationId || payload.eventType === 'DELETE') {
            console.log('[Admin Dashboard] Trip change:', payload.eventType, payload.new)
            if (isMountedRef.current) {
              fetchData(isMountedRef)
            }
          }
        }
      )
      .subscribe()

    // Subscribe to zones_postgis table changes - STATION-AWARE
    const zonesChannel = supabase
      .channel('admin-dashboard-zones')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'zones_postgis'
        },
        (payload) => {
          // Only process if station_id matches
          const newStationId = (payload.new as any)?.station_id
          if (newStationId === stationId || payload.eventType === 'DELETE') {
            // Refetch zones when they change
            if (isMountedRef.current) {
              fetch('/api/zones')
                .then(res => res.json())
                .then(featureCollection => {
                  if (featureCollection.type === 'FeatureCollection' && featureCollection.features) {
                    const zonesData = featureCollection.features
                      .map((feature: any) => featureToZone(feature))
                      .filter((zone: ZonePostGIS) => zone.station_id === stationId) // STATION FILTER
                    if (isMountedRef.current) {
                      setData(prev => ({
                        ...prev,
                        zones: zonesData,
                      }))
                    }
                  }
                })
                .catch(console.error)
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('[Admin Dashboard] Zones subscription status:', status)
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to zone updates (zones_postgis table)')
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to zone updates. Check Supabase Realtime publications for zones_postgis table.')
        } else if (status === 'TIMED_OUT') {
          console.warn('⚠️ Zone subscription timed out. Check network connection.')
        } else if (status === 'CLOSED') {
          console.warn('⚠️ Zone subscription closed.')
        }
      })

    // Subscribe to presence for all drivers
    const presenceChannel = supabase
      .channel('admin-presence-sync')
      .on('presence', { event: 'sync' }, () => {
        const state = presenceChannel.presenceState()
        const onlineMap: Record<string, boolean> = {}
        
        Object.keys(state).forEach(key => {
          onlineMap[key] = true
        })
        
        // CRITICAL: Only update if presence map actually changed to prevent unnecessary re-renders
        setPresenceMap(prev => {
          const prevKeys = Object.keys(prev).sort().join(',')
          const newKeys = Object.keys(onlineMap).sort().join(',')
          if (prevKeys === newKeys) {
            return prev // No change, return previous state
          }
          return onlineMap
        })
        console.log('[Admin Presence] Heartbeat sync:', onlineMap)
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        setPresenceMap(prev => {
          if (prev[key]) return prev // Already in map, no update needed
          return { ...prev, [key]: true }
        })
        console.log('[Admin Presence] Driver joined heartbeat:', key)
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        setPresenceMap(prev => {
          if (!prev[key]) return prev // Already removed, no update needed
          const updated = { ...prev }
          delete updated[key]
          return updated
        })
        console.log('[Admin Presence] Driver left heartbeat:', key)
      })
      .subscribe()

    return () => {
      isMountedRef.current = false
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      // CRITICAL: Clear all timeouts to prevent memory leaks
      timeoutRefs.forEach(timeoutId => clearTimeout(timeoutId))
      timeoutRefs.length = 0
      // Remove all channels
      supabase.removeChannel(driversChannel)
      supabase.removeChannel(tripsChannel)
      supabase.removeChannel(zonesChannel)
      supabase.removeChannel(presenceChannel)
    }
  }, [supabase, fetchData, stationId]) // Include stationId in dependencies

  // Listen for zone updates from zones page
  useEffect(() => {
    const handleZonesUpdate = () => {
      // Refetch zones when zones page updates them
      fetch('/api/zones')
        .then(res => res.json())
        .then(featureCollection => {
          if (featureCollection.type === 'FeatureCollection' && featureCollection.features) {
            const zonesData = featureCollection.features.map((feature: any) => featureToZone(feature))
            setData(prev => ({
              ...prev,
              zones: zonesData,
            }))
          }
        })
        .catch(console.error)
    }

    window.addEventListener('zones-updated', handleZonesUpdate)
    return () => window.removeEventListener('zones-updated', handleZonesUpdate)
  }, [])

  // Calculate stats - memoized to prevent recalculation on every render
  // Only recalculates when drivers or trips arrays change
  const stats = useMemo(() => ({
    activeDrivers: data.drivers.filter(d => d.is_online).length,
    pendingOrders: data.trips.filter(t => t.status === 'pending').length,
    completedToday: data.trips.filter(t => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      return t.status === 'completed' && new Date(t.created_at) >= today
    }).length,
  }), [data.drivers, data.trips])

  // Get selected trip and driver
  const selectedTrip = selectedTripId ? data.trips.find(t => t.id === selectedTripId) || null : null
  const selectedTripDriver = selectedTrip?.driver_id ? data.drivers.find(d => d.id === selectedTrip.driver_id) || null : null

  // Handlers
  const handleTripSelect = (trip: Trip | null) => {
    setSelectedTripId(trip?.id || null)
  }

  const handleCancelTrip = async (tripId: string) => {
    // TODO: Implement trip cancellation
    console.log('Cancel trip:', tripId)
    toast.success('בוטל', {
      description: 'הנסיעה בוטלה'
    })
    setSelectedTripId(null)
  }

  const handleReassignTrip = async (tripId: string) => {
    // TODO: Implement trip reassignment
    console.log('Reassign trip:', tripId)
    toast.success('הוקצה מחדש', {
      description: 'הנסיעה הוקצתה מחדש'
    })
    setSelectedTripId(null)
  }

  // Show loading if station is still loading
  if (stationLoading || data.loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 p-6">
        <div className="w-full max-w-4xl space-y-4">
          {/* Skeleton Loader - Premium feel */}
          <div className="space-y-3">
            <div className="h-12 bg-slate-800 rounded-lg animate-pulse" />
            <div className="grid grid-cols-3 gap-4">
              <div className="h-24 bg-slate-800 rounded-xl animate-pulse" />
              <div className="h-24 bg-slate-800 rounded-xl animate-pulse" />
              <div className="h-24 bg-slate-800 rounded-xl animate-pulse" />
            </div>
            <div className="h-96 bg-slate-800 rounded-xl animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  // Show error if station is not assigned
  if (stationError || !stationId) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 p-4">
        <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-6 max-w-md w-full">
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="text-red-400" size={24} />
            <h2 className="text-lg font-semibold text-red-300">שגיאת תחנה</h2>
          </div>
          <p className="text-red-200 mb-4">
            {stationError || 'המשתמש לא משויך לתחנה. אנא פנה למנהל המערכת.'}
          </p>
        </div>
      </div>
    )
  }

  if (data.error && !data.dbConnected) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-900 p-4">
        <div className="bg-red-900/20 border border-red-500/50 rounded-lg p-6 max-w-md w-full">
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="text-red-400" size={24} />
            <h2 className="text-lg font-semibold text-red-300">שגיאת חיבור</h2>
          </div>
          <p className="text-red-200 mb-4">{data.error}</p>
          <p className="text-sm text-red-300">
            אנא ודא שהרצת את קובץ המיגרציה <code className="bg-red-900/30 px-2 py-1 rounded">supabase-migration.sql</code> ב-Supabase SQL Editor.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-screen w-full bg-slate-950 overflow-hidden flex flex-col">
      {/* Status Bar */}
      <StatusBar 
        activeDrivers={stats.activeDrivers}
        pendingTrips={stats.pendingOrders}
        completedToday={stats.completedToday}
      >
          <div className="flex items-center gap-2">
            <TestTripButton />
            {/* Tab Navigation */}
            <div className="flex items-center gap-1 bg-slate-800/50 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('dashboard')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'dashboard'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                לוח בקרה
              </button>
              <button
                onClick={() => setActiveTab('management')}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  activeTab === 'management'
                    ? 'bg-slate-700 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Settings className="w-4 h-4 ml-2 inline" />
                ניהול
              </button>
            </div>
          </div>
      </StatusBar>

      {/* Main Content: Conditional rendering based on active tab */}
      {activeTab === 'dashboard' ? (
        <div className="flex-1 flex overflow-hidden">
          {/* Map - 75% */}
          <div className="flex-[3] relative">
            <AdminLiveMap 
              drivers={data.drivers} 
              zones={data.zones}
              trips={data.trips}
              selectedTripId={selectedTripId}
              presenceMap={presenceMap}
              className="h-full w-full" 
            />
          </div>

          {/* Sidebar - 25% */}
          <div className="w-[25%] min-w-[320px] flex-shrink-0">
            <TripSidebar
              trips={data.trips}
              selectedTripId={selectedTripId}
              onTripSelect={handleTripSelect}
              onCancelTrip={handleCancelTrip}
              onReassignTrip={handleReassignTrip}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 overflow-auto p-6">
          <AdminManagement stationId={stationId} />
        </div>
      )}

      {/* Trip Detail Panel (Floating) */}
      {selectedTrip && (
        <TripDetailPanel
          trip={selectedTrip}
          driver={selectedTripDriver}
          onClose={() => setSelectedTripId(null)}
          onCancel={handleCancelTrip}
          onReassign={handleReassignTrip}
        />
      )}

      {/* Floating Action Button */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        className="fixed bottom-8 left-8 z-50"
      >
        <Button
          size="lg"
          className="rounded-full h-14 w-14 shadow-lg bg-blue-500 hover:bg-blue-600"
          onClick={() => setNewTripOpen(true)}
        >
          <Plus size={24} />
        </Button>
      </motion.div>

      {/* Error Banner (if any) */}
      {data.error && data.dbConnected && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute top-20 left-1/2 transform -translate-x-1/2 z-50 bg-yellow-900/80 backdrop-blur-sm border border-yellow-500/50 rounded-lg p-4 flex items-center gap-3"
        >
          <AlertCircle className="text-yellow-400" size={20} />
          <p className="text-sm text-yellow-200">{data.error}</p>
        </motion.div>
      )}

      <NewTripModal open={newTripOpen} onOpenChange={setNewTripOpen} />
    </div>
  )
}

