'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { StatsCards } from '@/components/admin/StatsCards'
import { AdminLiveMap } from '@/components/admin/AdminLiveMap'
import { DriverList } from '@/components/admin/DriverList'
import { NewTripModal } from '@/components/admin/NewTripModal'
import type { Profile, Trip, ZonePostGIS } from '@/lib/supabase'
import { featureToZone } from '@/lib/spatial-utils'
import { motion } from 'framer-motion'
import { AlertCircle, Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useToast } from '@/lib/hooks/useToast'

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
  const supabase = createClient()
  const toast = useToast()

  // Wrap fetchData in useCallback to prevent infinite loops
  const fetchData = useCallback(async (isMountedRef?: { current: boolean }) => {
    try {
      setData(prev => ({ ...prev, loading: true, error: null }))

      // Fetch drivers with error handling
      const { data: driversData, error: driversError } = await supabase
        .from('profiles')
        .select('*')
        .eq('role', 'driver')

      if (driversError) {
        console.error('Error fetching drivers:', driversError)
        if (driversError.message?.includes('relation') && driversError.message?.includes('does not exist')) {
          setData(prev => ({
            ...prev,
            error: 'טבלת profiles לא קיימת. אנא הרץ את המיגרציה ב-Supabase.',
            dbConnected: false,
            loading: false,
          }))
          return
        }
        if (!isMountedRef || isMountedRef.current) {
          setData(prev => ({
            ...prev,
            error: `שגיאה בטעינת נהגים: ${driversError.message}`,
            loading: false,
          }))
        }
      } else {
        if (!isMountedRef || isMountedRef.current) {
          setData(prev => ({
            ...prev,
            drivers: driversData || [],
            dbConnected: true,
          }))
        }
      }

      // Fetch trips with error handling
      const { data: tripsData, error: tripsError } = await supabase
        .from('trips')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100)

      if (tripsError) {
        console.error('Error fetching trips:', tripsError)
        if (!tripsError.message?.includes('relation') && (!isMountedRef || isMountedRef.current)) {
          setData(prev => ({
            ...prev,
            error: prev.error || `שגיאה בטעינת נסיעות: ${tripsError.message}`,
          }))
        }
      } else if (!isMountedRef || isMountedRef.current) {
        setData(prev => ({
          ...prev,
          trips: tripsData || [],
        }))
      }

      // Fetch zones from API (GeoJSON FeatureCollection)
      try {
        const zonesResponse = await fetch('/api/zones')
        if (zonesResponse.ok) {
          const featureCollection = await zonesResponse.json()
          
          if (featureCollection.type === 'FeatureCollection' && featureCollection.features) {
            // Convert GeoJSON features to ZonePostGIS format
            const zonesData = featureCollection.features.map((feature: any) => featureToZone(feature))
            
            if (!isMountedRef || isMountedRef.current) {
              setData(prev => ({
                ...prev,
                zones: zonesData,
              }))
            }
          } else {
            // Fallback: try direct Supabase query
            const { data: zonesData, error: zonesError } = await supabase
              .from('zones_postgis')
              .select('*')
              .order('name')

            if (!zonesError && zonesData && (!isMountedRef || isMountedRef.current)) {
              setData(prev => ({
                ...prev,
                zones: zonesData as ZonePostGIS[],
              }))
            }
          }
        }
      } catch (zonesError: any) {
        console.error('Error fetching zones:', zonesError)
      }
    } catch (err: any) {
      console.error('Unexpected error fetching data:', err)
      if (!isMountedRef || isMountedRef.current) {
        setData(prev => ({
          ...prev,
          error: `שגיאה בלתי צפויה: ${err.message}`,
        }))
      }
    } finally {
      if (!isMountedRef || isMountedRef.current) {
        setData(prev => ({ ...prev, loading: false }))
      }
    }
  }, [supabase])

  useEffect(() => {
    const isMountedRef = { current: true }

    // Initial fetch
    fetchData(isMountedRef)

    // Subscribe to real-time updates with error handling
    const driversChannel = supabase
      .channel('admin-dashboard-drivers')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: 'role=eq.driver'
        },
        (payload) => {
          if (!isMountedRef.current) return
          
          // Only handle UPDATE events to avoid infinite loops
          if (payload.eventType === 'UPDATE' && payload.new) {
            const newDriver = payload.new as Profile
            
            // Debug logging for sync verification
            console.log('[Realtime] Received PATCH for driver:', newDriver.id, 'Lat:', newDriver.latitude, 'Online:', newDriver.is_online)
            
            // Verify role filter
            if (newDriver.role !== 'driver') {
              console.warn('[Admin Dashboard] Received update for non-driver:', newDriver.id)
              return
            }
            
            // Use functional update to access current state
            setData(prev => {
              const oldDriver = prev.drivers.find(d => d.id === payload.new.id)
              
              // Handle is_online status change notifications
              if (oldDriver && oldDriver.is_online !== newDriver.is_online) {
                if (newDriver.is_online) {
                  requestAnimationFrame(() => {
                    toast.success(
                      `${newDriver.full_name || 'נהג'} התחבר! 🚕`,
                      'הנהג כעת פעיל ומזמין נסיעות'
                    )
                  })
                } else {
                  requestAnimationFrame(() => {
                    toast.info(
                      `${newDriver.full_name || 'נהג'} התנתק`,
                      'הנהג כעת לא פעיל'
                    )
                  })
                }
              }
              
              // Patch the specific driver in the existing array - No delays
              return {
                ...prev,
                drivers: prev.drivers.map(d =>
                  d.id === payload.new.id ? { ...d, ...payload.new } as Profile : d
                ),
              }
            })
          } else if (payload.eventType === 'INSERT' || payload.eventType === 'DELETE') {
            // For INSERT/DELETE, refetch only once (debounced to prevent loops)
            if (isMountedRef.current) {
              // Use a small delay to batch multiple INSERT/DELETE events
              setTimeout(() => {
                if (isMountedRef.current) {
                  fetchData(isMountedRef)
                }
              }, 500)
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('Drivers subscription status:', status)
        if (status === 'SUBSCRIBED') {
          console.log('✅ Subscribed to driver updates')
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to driver updates')
          setData(prev => ({
            ...prev,
            error: 'שגיאה בחיבור לעדכונים בזמן אמת',
          }))
        }
      })

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
          console.log('Trip update received:', payload)
          if (isMountedRef.current) {
            // Optimistically update the specific trip
            if (payload.eventType === 'UPDATE' && payload.new) {
              setData(prev => ({
                ...prev,
                trips: prev.trips.map(t =>
                  t.id === payload.new.id ? { ...t, ...payload.new } as Trip : t
                ),
              }))
            } else if (payload.eventType === 'INSERT' && payload.new) {
              setData(prev => ({
                ...prev,
                trips: [payload.new as Trip, ...prev.trips],
              }))
            } else {
              // Debounce refetch for DELETE events
              setTimeout(() => {
                if (isMountedRef.current) {
                  fetchData(isMountedRef)
                }
              }, 500)
            }
          }
        }
      )
      .subscribe((status) => {
        console.log('Trips subscription status:', status)
        if (status === 'SUBSCRIBED') {
          console.log('✅ Subscribed to trip updates')
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to trip updates')
        }
      })

    // Subscribe to zones_postgis table changes
    const zonesChannel = supabase
      .channel('admin-dashboard-zones')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'zones_postgis'
        },
        () => {
          // Refetch zones when they change
          if (isMountedRef.current) {
            fetch('/api/zones')
              .then(res => res.json())
              .then(featureCollection => {
                if (featureCollection.type === 'FeatureCollection' && featureCollection.features) {
                  const zonesData = featureCollection.features.map((feature: any) => featureToZone(feature))
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
      )
      .subscribe((status) => {
        console.log('Zones subscription status:', status)
        if (status === 'SUBSCRIBED') {
          console.log('✅ Subscribed to zone updates')
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to zone updates')
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
        
        setPresenceMap(onlineMap)
        console.log('[Admin Presence] Heartbeat sync:', onlineMap)
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        setPresenceMap(prev => ({ ...prev, [key]: true }))
        console.log('[Admin Presence] Driver joined heartbeat:', key)
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        setPresenceMap(prev => {
          const updated = { ...prev }
          delete updated[key]
          return updated
        })
        console.log('[Admin Presence] Driver left heartbeat:', key)
      })
      .subscribe()

    return () => {
      isMountedRef.current = false
      supabase.removeChannel(driversChannel)
      supabase.removeChannel(tripsChannel)
      supabase.removeChannel(zonesChannel)
      supabase.removeChannel(presenceChannel)
      }
    }, [supabase, fetchData]) // Include fetchData in dependencies

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

  // Calculate average wait time from completed trips today
  const calculateAvgWaitTime = () => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    
    const completedToday = data.trips.filter(t => {
      return t.status === 'completed' && new Date(t.created_at) >= today
    })

    if (completedToday.length === 0) return '0 דקות'

    const totalWaitTime = completedToday.reduce((sum, trip) => {
      const created = new Date(trip.created_at).getTime()
      const updated = new Date(trip.updated_at).getTime()
      const waitTime = (updated - created) / 1000 / 60 // Convert to minutes
      return sum + waitTime
    }, 0)

    const avgMinutes = Math.round(totalWaitTime / completedToday.length)
    return `${avgMinutes} דקות`
  }

  const stats = {
    activeDrivers: data.drivers.filter(d => d.is_online).length,
    pendingOrders: data.trips.filter(t => t.status === 'pending').length,
    completedToday: data.trips.filter(t => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      return t.status === 'completed' && new Date(t.created_at) >= today
    }).length,
    avgWaitTime: calculateAvgWaitTime(),
    zonesCount: data.zones.length
  }

  // Debug logging for active drivers sync verification
  useEffect(() => {
    console.log('[Stats] Active Drivers Count:', stats.activeDrivers)
    console.log('[Admin Dashboard] Full Driver State:', {
      totalDrivers: data.drivers.length,
      activeDrivers: stats.activeDrivers,
      drivers: data.drivers.map(d => ({
        id: d.id,
        name: d.full_name,
        is_online: d.is_online,
        role: d.role,
        hasLocation: !!(d.latitude && d.longitude),
        latitude: d.latitude,
        longitude: d.longitude
      }))
    })
  }, [data.drivers, stats.activeDrivers])

  if (data.loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-deep-blue mx-auto mb-4"></div>
          <p>טוען...</p>
        </div>
      </div>
    )
  }

  if (data.error && !data.dbConnected) {
    return (
      <div className="flex items-center justify-center min-h-screen p-4">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md w-full">
          <div className="flex items-center gap-3 mb-4">
            <AlertCircle className="text-red-600" size={24} />
            <h2 className="text-lg font-semibold text-red-900">שגיאת חיבור</h2>
          </div>
          <p className="text-red-700 mb-4">{data.error}</p>
          <p className="text-sm text-red-600">
            אנא ודא שהרצת את קובץ המיגרציה <code className="bg-red-100 px-2 py-1 rounded">supabase-migration.sql</code> ב-Supabase SQL Editor.
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen w-full">
      {/* Map Background - Fixed */}
      <div className="fixed lg:absolute inset-0 z-0">
        <AdminLiveMap 
          drivers={data.drivers} 
          zones={data.zones} 
          presenceMap={presenceMap}
          className="h-full w-full" 
        />
      </div>

      {/* Content Overlay - Scrollable */}
      <div className="relative z-10 p-4 sm:p-6 space-y-4 sm:space-y-6 min-h-screen pb-20 lg:pb-0 pt-safe">
        {/* Error Banner */}
        {data.error && data.dbConnected && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 flex items-center gap-3"
          >
            <AlertCircle className="text-yellow-600" size={20} />
            <p className="text-sm text-yellow-800">{data.error}</p>
          </motion.div>
        )}

        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card rounded-2xl p-4 sm:p-6"
        >
          <h1 className="text-2xl sm:text-3xl font-bold mb-4 sm:mb-6 text-gray-900">דאשבורד</h1>
          <StatsCards stats={stats} />
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
          <div className="glass-card rounded-2xl p-4 sm:p-6">
            <h2 className="text-xl font-semibold mb-4 text-gray-900">מפה חיה</h2>
            <div className="h-64 sm:h-96 rounded-lg overflow-hidden">
              <AdminLiveMap 
                drivers={data.drivers} 
                zones={data.zones} 
                presenceMap={presenceMap}
                className="h-full w-full" 
              />
            </div>
          </div>
          <div className="glass-card rounded-2xl">
            <DriverList drivers={data.drivers} />
          </div>
        </div>
      </div>

      {/* Floating Action Button */}
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        className="fixed bottom-20 lg:bottom-8 right-4 z-50"
      >
        <Button
          size="lg"
          className="rounded-full h-14 w-14 shadow-lg"
          onClick={() => setNewTripOpen(true)}
        >
          <Plus size={24} />
        </Button>
      </motion.div>

      <NewTripModal open={newTripOpen} onOpenChange={setNewTripOpen} />
    </div>
  )
}
