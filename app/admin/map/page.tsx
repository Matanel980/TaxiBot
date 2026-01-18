'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { AdminLiveMap } from '@/components/admin/AdminLiveMap'
import type { Profile, ZonePostGIS } from '@/lib/supabase'
import { featureToZone } from '@/lib/spatial-utils'
import { DriverDetailSheet } from '@/components/admin/DriverDetailSheet'
import { useDriverTrips } from '@/lib/hooks/useDriverTrips'
import { Button } from '@/components/ui/button'
import { X, Search, Filter, Maximize2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Card } from '@/components/ui/card'
import { useRouter } from 'next/navigation'

export default function FullScreenMapPage() {
  const [drivers, setDrivers] = useState<Profile[]>([])
  const [zones, setZones] = useState<ZonePostGIS[]>([])
  const [presenceMap, setPresenceMap] = useState<Record<string, boolean>>({})
  const [selectedDriver, setSelectedDriver] = useState<Profile | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [showSearch, setShowSearch] = useState(false)
  const [filterOnline, setFilterOnline] = useState(true)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const router = useRouter()
  const isMountedRef = useRef(true)
  const initialDataLoadedRef = useRef(false)

  // Get driver IDs for trip checking
  const driverIds = drivers.map(d => d.id)
  const driverTrips = useDriverTrips({ driverIds })

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        
        // Fetch drivers
        const { data: driversData, error: driversError } = await supabase
          .from('profiles')
          .select('id, phone, role, full_name, vehicle_number, car_type, current_zone, is_online, is_approved, latitude, longitude, current_address, heading, updated_at')
          .eq('role', 'driver')

        if (!driversError && driversData && isMountedRef.current) {
          setDrivers(driversData as Profile[])
        }

        // Fetch zones
        const zonesResponse = await fetch('/api/zones')
        if (zonesResponse.ok) {
          const featureCollection = await zonesResponse.json()
          if (featureCollection.type === 'FeatureCollection' && featureCollection.features && isMountedRef.current) {
            const zonesData = featureCollection.features.map((feature: any) => featureToZone(feature))
            setZones(zonesData)
          }
        }
        
        initialDataLoadedRef.current = true
      } catch (error) {
        console.error('Error fetching data:', error)
      } finally {
        if (isMountedRef.current) {
          setLoading(false)
        }
      }
    }

    fetchData()
    
    return () => {
      isMountedRef.current = false
    }
  }, [supabase])

  // Subscribe to real-time driver updates - OPTIMIZED for instant sync
  useEffect(() => {
    if (!initialDataLoadedRef.current) return

    const driversChannel = supabase
      .channel('fullmap-drivers')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles'
        },
        (payload) => {
          if (!isMountedRef.current) return

          // Handle UPDATE events instantly (location updates, status changes)
          if (payload.eventType === 'UPDATE' && payload.new) {
            const newDriver = payload.new as Profile
            if (newDriver.role !== 'driver') return

            setDrivers(prev => {
              // Find and update existing driver immediately
              const driverIndex = prev.findIndex(d => d.id === payload.new.id)
              if (driverIndex >= 0) {
                const oldDriver = prev[driverIndex]
                const newDriverData = { ...payload.new } as Profile
                
                // VALIDATE: Check coordinates are valid
                const hasValidCoords = 
                  typeof newDriverData.latitude === 'number' && 
                  typeof newDriverData.longitude === 'number' &&
                  !isNaN(newDriverData.latitude) && 
                  !isNaN(newDriverData.longitude) &&
                  newDriverData.latitude >= -90 && newDriverData.latitude <= 90 &&
                  newDriverData.longitude >= -180 && newDriverData.longitude <= 180 &&
                  (newDriverData.latitude !== 0 || newDriverData.longitude !== 0)
                
                // If coordinates are invalid, keep old location
                if (!hasValidCoords && oldDriver.latitude && oldDriver.longitude) {
                  newDriverData.latitude = oldDriver.latitude
                  newDriverData.longitude = oldDriver.longitude
                }
                
                // Update in place for instant sync
                const updatedDrivers = [...prev]
                updatedDrivers[driverIndex] = { ...oldDriver, ...newDriverData } as Profile
                return updatedDrivers
              }
              
              // Add new driver if online and has valid coordinates
              if (newDriver.is_online) {
                const hasValidCoords = 
                  typeof newDriver.latitude === 'number' && 
                  typeof newDriver.longitude === 'number' &&
                  !isNaN(newDriver.latitude) && 
                  !isNaN(newDriver.longitude) &&
                  newDriver.latitude >= -90 && newDriver.latitude <= 90 &&
                  newDriver.longitude >= -180 && newDriver.longitude <= 180 &&
                  (newDriver.latitude !== 0 || newDriver.longitude !== 0)
                
                if (hasValidCoords) {
                  return [...prev, newDriver as Profile]
                }
              }
              
              return prev
            })
          } 
          // Handle INSERT/DELETE with minimal delay
          else if (payload.eventType === 'INSERT' || payload.eventType === 'DELETE') {
            // Quick refetch for structural changes (debounced to avoid spam)
            const timeoutId = setTimeout(() => {
              if (isMountedRef.current) {
                supabase
                  .from('profiles')
                  .select('id, phone, role, full_name, vehicle_number, car_type, current_zone, is_online, is_approved, latitude, longitude, current_address, heading, updated_at')
                  .eq('role', 'driver')
                  .then(({ data, error }) => {
                    if (!error && data && isMountedRef.current) {
                      setDrivers(data as Profile[])
                    }
                  })
              }
            }, 300)
            
            return () => clearTimeout(timeoutId)
          }
        }
      )
      .subscribe((status) => {
        console.log('[FullMap] Drivers subscription status:', status)
        if (status === 'SUBSCRIBED') {
          console.log('[FullMap] ✅ Subscribed to driver updates')
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[FullMap] ❌ Error subscribing to driver updates')
        }
      })

    // Subscribe to presence for connection status
    const presenceChannel = supabase
      .channel('fullmap-presence')
      .on('presence', { event: 'sync' }, () => {
        if (!isMountedRef.current) return
        const state = presenceChannel.presenceState()
        const onlineMap: Record<string, boolean> = {}
        Object.keys(state).forEach(key => {
          onlineMap[key] = true
        })
        setPresenceMap(prev => {
          const prevKeys = Object.keys(prev).sort().join(',')
          const newKeys = Object.keys(onlineMap).sort().join(',')
          if (prevKeys === newKeys) return prev
          return onlineMap
        })
      })
      .on('presence', { event: 'join' }, ({ key }) => {
        if (!isMountedRef.current) return
        setPresenceMap(prev => ({ ...prev, [key]: true }))
      })
      .on('presence', { event: 'leave' }, ({ key }) => {
        if (!isMountedRef.current) return
        setPresenceMap(prev => {
          const updated = { ...prev }
          delete updated[key]
          return updated
        })
      })
      .subscribe()

    return () => {
      supabase.removeChannel(driversChannel)
      supabase.removeChannel(presenceChannel)
    }
  }, [supabase, initialDataLoadedRef.current])

  // Subscribe to zone updates
  useEffect(() => {
    const zonesChannel = supabase
      .channel('fullmap-zones')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'zones_postgis'
        },
        () => {
          if (!isMountedRef.current) return
          // Refetch zones when they change
          fetch('/api/zones')
            .then(res => res.json())
            .then(featureCollection => {
              if (featureCollection.type === 'FeatureCollection' && featureCollection.features && isMountedRef.current) {
                const zonesData = featureCollection.features.map((feature: any) => featureToZone(feature))
                setZones(zonesData)
              }
            })
            .catch(console.error)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(zonesChannel)
    }
  }, [supabase])

  // Filter drivers based on search and filter
  const filteredDrivers = drivers.filter(driver => {
    if (filterOnline && !driver.is_online) return false
    if (searchQuery) {
      const query = searchQuery.toLowerCase()
      return (
        driver.full_name?.toLowerCase().includes(query) ||
        driver.phone?.includes(query) ||
        driver.vehicle_number?.toLowerCase().includes(query)
      )
    }
    return true
  })

  // Handle driver click from list - center map on driver
  const handleDriverClick = useCallback((driver: Profile) => {
    setSelectedDriver(driver)
    setShowSearch(false)
    // Map will automatically center on selected driver (handled in AdminLiveMapClient)
  }, [])
  
  // Sync selectedDriver with AdminLiveMap via a custom prop (if needed)
  // The map component will receive selectedDriver through the AdminLiveMap wrapper

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-900 flex items-center justify-center z-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white">טוען מפה...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 z-0 bg-gray-900">
      {/* Full-screen map */}
      <div className="absolute inset-0">
        <AdminLiveMap 
          drivers={filteredDrivers} 
          zones={zones} 
          presenceMap={presenceMap}
          className="h-full w-full"
          selectedDriverId={selectedDriver?.id}
          onDriverSelect={setSelectedDriver}
        />
      </div>

      {/* Top controls */}
      <div className="absolute top-4 left-4 right-4 z-10 flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => router.back()}
          className="bg-white/90 backdrop-blur-sm hover:bg-white shadow-lg"
        >
          <X className="h-4 w-4 mr-2" />
          סגור
        </Button>

        <div className="flex-1 relative max-w-md">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowSearch(!showSearch)}
            className="w-full bg-white/90 backdrop-blur-sm hover:bg-white shadow-lg justify-start"
          >
            <Search className="h-4 w-4 mr-2" />
            {searchQuery || 'חפש נהג...'}
          </Button>

          {showSearch && (
            <Card className="absolute top-full left-0 right-0 mt-2 bg-white/95 backdrop-blur-sm max-h-96 overflow-y-auto shadow-xl z-20">
              <div className="p-2">
                <Input
                  placeholder="חפש לפי שם, טלפון, או מספר רכב..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="mb-2"
                  autoFocus
                />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFilterOnline(!filterOnline)}
                  className="w-full justify-start"
                >
                  <Filter className="h-4 w-4 mr-2" />
                  {filterOnline ? 'הצג רק נהגים פעילים' : 'הצג את כל הנהגים'}
                </Button>
                <div className="mt-2 space-y-1">
                  {filteredDrivers.length === 0 ? (
                    <div className="p-4 text-center text-gray-500 text-sm">
                      לא נמצאו נהגים
                    </div>
                  ) : (
                    filteredDrivers.map((driver) => (
                      <div
                        key={driver.id}
                        onClick={() => handleDriverClick(driver)}
                        className="p-3 hover:bg-gray-100 rounded-lg cursor-pointer border-b border-gray-100 transition-colors"
                      >
                        <div className="font-medium text-gray-900">
                          {driver.full_name || 'ללא שם'}
                        </div>
                        <div className="text-sm text-gray-500">
                          {driver.phone} {driver.vehicle_number && `• ${driver.vehicle_number}`}
                        </div>
                        <div className="text-xs text-gray-400 mt-1 flex items-center gap-2">
                          <span className={`w-2 h-2 rounded-full ${driver.is_online ? 'bg-green-500' : 'bg-gray-400'}`} />
                          {driver.is_online ? 'פעיל' : 'לא פעיל'}
                          {driver.current_address && (
                            <span className="text-gray-500">• {driver.current_address}</span>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Stats overlay */}
      <div className="absolute bottom-4 left-4 z-10 glass-card-light rounded-2xl p-4 shadow-xl backdrop-blur-xl bg-white/80 border border-white/20">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
            <span className="text-sm font-medium text-gray-900">
              {filteredDrivers.filter(d => d.is_online).length} נהגים פעילים
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-amber-500" />
            <span className="text-sm font-medium text-gray-900">
              {zones.length} אזורים
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-blue-500" />
            <span className="text-sm font-medium text-gray-900">
              {filteredDrivers.length} נהגים בסך הכל
            </span>
          </div>
          {Object.keys(presenceMap).length < filteredDrivers.filter(d => d.is_online).length && (
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <span className="text-xs text-red-600 font-medium">
                {filteredDrivers.filter(d => d.is_online).length - Object.keys(presenceMap).length} נהגים מנותקים
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Driver detail sheet */}
      <DriverDetailSheet
        driver={selectedDriver}
        open={!!selectedDriver}
        onOpenChange={(open) => !open && setSelectedDriver(null)}
        hasActiveTrip={selectedDriver ? (driverTrips[selectedDriver.id]?.hasActiveTrip || false) : false}
        onAssignTrip={(driverId) => {
          console.log('Assign trip to driver:', driverId)
          setSelectedDriver(null)
        }}
      />
    </div>
  )
}

