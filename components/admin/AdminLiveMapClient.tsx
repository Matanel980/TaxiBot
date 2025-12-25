'use client'

import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { GoogleMap, Marker, Polygon, useJsApiLoader } from '@react-google-maps/api'
import { createClient } from '@/lib/supabase'
import type { Profile, ZonePostGIS } from '@/lib/supabase'
import { 
  silverMapStyle, 
  ACRE_CENTER, 
  createTaxiIcon,
  GOOGLE_MAPS_LOADER_OPTIONS
} from '@/lib/google-maps-loader'
import { geometryToGooglePaths, featureToZone } from '@/lib/spatial-utils'
import { useDriverTrips } from '@/lib/hooks/useDriverTrips'
import { DriverDetailSheet } from './DriverDetailSheet'
import React from 'react'

// Zone polygon component
const ZonePolygon = React.memo(({ zone }: { zone: ZonePostGIS }) => {
  if (!zone.geometry) return null

  const paths = useMemo(() => {
    try {
      // Convert PostGIS geometry (GeoJSON) to Google Maps paths
      return geometryToGooglePaths(zone.geometry)
    } catch (error) {
      console.error('Error parsing zone geometry:', error)
      return []
    }
  }, [zone.geometry])

  if (paths.length === 0) return null

  return (
    <Polygon
      paths={paths}
      options={{
        fillColor: zone.color || '#F7C948',
        fillOpacity: 0.2,
        strokeColor: zone.color || '#F7C948',
        strokeOpacity: 0.8,
        strokeWeight: 2,
        clickable: false,
        zIndex: 0,
      }}
    />
  )
})

ZonePolygon.displayName = 'ZonePolygon'

const containerStyle = {
  width: '100%',
  height: '100%',
}

interface AdminLiveMapClientProps {
  drivers: Profile[]
  zones?: ZonePostGIS[]
  presenceMap?: Record<string, boolean>
}

// Animated driver marker with smooth transitions
const DriverMarker = React.memo(({ 
  driver, 
  isSelected,
  onSelect,
  isDisconnected = false,
  google
}: { 
  driver: Profile
  isSelected: boolean
  onSelect: () => void
  isDisconnected?: boolean
  google: typeof window.google
}) => {
  const [position, setPosition] = useState({ lat: driver.latitude || 0, lng: driver.longitude || 0 })
  const [heading, setHeading] = useState(driver.heading || 0)
  const animationFrameRef = useRef<number | null>(null)

  // Smooth interpolation (glide) effect
  useEffect(() => {
    if (!driver.latitude || !driver.longitude) return

    const targetLat = driver.latitude
    const targetLng = driver.longitude
    const targetHeading = driver.heading || 0
    
    const startLat = position.lat
    const startLng = position.lng
    const startHeading = heading

    const duration = 2000 // 2 seconds glide
    const startTime = performance.now()

    const animate = (currentTime: number) => {
      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)
      
      // Easing function for smooth start/stop
      const easeProgress = 1 - Math.pow(1 - progress, 3)

      const currentLat = startLat + (targetLat - startLat) * easeProgress
      const currentLng = startLng + (targetLng - startLng) * easeProgress
      
      // Handle circular heading interpolation
      let diff = targetHeading - startHeading
      if (diff > 180) diff -= 360
      if (diff < -180) diff += 360
      const currentHeading = startHeading + diff * easeProgress

      setPosition({ lat: currentLat, lng: currentLng })
      setHeading(currentHeading)

      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate)
      }
    }

    animationFrameRef.current = requestAnimationFrame(animate)

    return () => {
      if (animationFrameRef.current) cancelAnimationFrame(animationFrameRef.current)
    }
  }, [driver.latitude, driver.longitude, driver.heading])

  if (!driver.latitude || !driver.longitude) return null

  // Determine status for icon
  let status: 'available' | 'on-trip' | 'offline' = 'offline'
  if (driver.is_online) {
    status = 'available' // Trip status is handled via icon logic in main client if needed
  }
  
  const icon = createTaxiIcon(status, google, heading)
  
  // Adjust icon opacity if disconnected (presence heartbeat failed)
  if (isDisconnected && icon) {
    icon.fillOpacity = 0.5
    icon.strokeOpacity = 0.5
  }

  return (
    <Marker
      position={position}
      icon={icon}
      onClick={onSelect}
      animation={isSelected ? google.maps.Animation.BOUNCE : undefined}
      zIndex={isSelected ? 1000 : (isDisconnected ? 0 : 500)}
      optimized={true}
    />
  )
}, (prevProps, nextProps) => {
  return (
    prevProps.driver.id === nextProps.driver.id &&
    prevProps.driver.latitude === nextProps.driver.latitude &&
    prevProps.driver.longitude === nextProps.driver.longitude &&
    prevProps.driver.heading === nextProps.driver.heading &&
    prevProps.driver.is_online === nextProps.driver.is_online &&
    prevProps.isDisconnected === nextProps.isDisconnected &&
    prevProps.isSelected === nextProps.isSelected
  )
})

DriverMarker.displayName = 'DriverMarker'

export function AdminLiveMapClient({ 
  drivers: initialDrivers, 
  zones: initialZones = [],
  presenceMap = {}
}: AdminLiveMapClientProps) {
  const { isLoaded } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS)

  // Use props as single source of truth - remove internal Realtime subscription
  const [zones, setZones] = useState<ZonePostGIS[]>(initialZones)
  const [selectedDriver, setSelectedDriver] = useState<Profile | null>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const prevDriversKeyRef = useRef<string>('')
  const isInitialMountRef = useRef(true)
  const supabase = createClient()

  // Drivers are now passed as props from the parent (which handles Realtime)
  const drivers = initialDrivers

  // Track which drivers have active trips
  const driverIds = useMemo(() => drivers.map(d => d.id), [drivers])
  const driverTrips = useDriverTrips({ driverIds })

  // Fetch zones from API (GeoJSON FeatureCollection)
  useEffect(() => {
    const fetchZones = async () => {
      try {
        // Fetch from API endpoint (GeoJSON FeatureCollection)
        const response = await fetch('/api/zones')
        if (response.ok) {
          const featureCollection = await response.json()
          
          if (featureCollection.type === 'FeatureCollection' && featureCollection.features) {
            // Convert GeoJSON features to ZonePostGIS format
            const zonesData = featureCollection.features.map((feature: any) => featureToZone(feature))
            setZones(zonesData)
          }
        } else {
          // Fallback: direct Supabase query
          const { data, error } = await supabase
            .from('zones_postgis')
            .select('*')
            .order('name')
          
          if (data && !error) {
            setZones(data as ZonePostGIS[])
          }
        }
      } catch (error) {
        console.error('Error fetching zones:', error)
      }
    }

    // Initial fetch
    if (initialZones.length === 0) {
      fetchZones()
    } else {
      setZones(initialZones)
    }

    // Subscribe to zone changes from zones_postgis table
    const channel = supabase
      .channel('admin-map-zones')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'zones_postgis'
        },
        () => {
          // Refetch zones when they change
          fetchZones()
        }
      )
      .subscribe()

    // Listen for custom zone update events
    const handleZonesUpdate = () => {
      fetchZones()
    }
    window.addEventListener('zones-updated', handleZonesUpdate)

    return () => {
      channel.unsubscribe()
      window.removeEventListener('zones-updated', handleZonesUpdate)
    }
  }, [supabase, initialZones])

  // Auto-detect and update driver zones using PostGIS point-in-polygon
  useEffect(() => {
    if (!isLoaded || zones.length === 0) return

    // Debounce zone checks to avoid excessive API calls (2 seconds)
    const zoneCheckTimeout = setTimeout(() => {
      drivers.forEach(async (driver) => {
        if (!driver.latitude || !driver.longitude || !driver.is_online) return

        // Use API endpoint for point-in-polygon check (PostGIS powered)
        try {
          const response = await fetch('/api/zones/check-point', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              lat: driver.latitude,
              lng: driver.longitude
            })
          })

          if (response.ok) {
            const result = await response.json()
            const zoneId = result.in_zone ? result.zone?.id : null

            // Update driver's current_zone if changed
            if (zoneId !== driver.current_zone) {
              await supabase
                .from('profiles')
                .update({ current_zone: zoneId })
                .eq('id', driver.id)
            }
          }
        } catch (error) {
          console.error('Error checking zone for driver:', error)
        }
      })
    }, 2000) // Check zones every 2 seconds max (was running on every driver change)

    return () => clearTimeout(zoneCheckTimeout)
  }, [drivers, zones, isLoaded, supabase])

  // Memoize online drivers
  const onlineDrivers = useMemo(() => {
    return drivers.filter(
      d => d.is_online && d.role === 'driver' && d.latitude && d.longitude
    )
  }, [drivers])

  // Create stable drivers key for comparison
  const driversKey = useMemo(() => {
    return onlineDrivers.map(d => `${d.id}:${d.latitude}:${d.longitude}`).join(',')
  }, [onlineDrivers])

  // Memoize map options (only when Google Maps is loaded)
  const mapOptions = useMemo<google.maps.MapOptions>(() => {
    // Check if google is available
    if (typeof window === 'undefined' || !window.google?.maps) {
      return {
        disableDefaultUI: false,
        styles: silverMapStyle,
        center: ACRE_CENTER,
        zoom: 13,
        gestureHandling: 'greedy',
      }
    }

    return {
      disableDefaultUI: false,
      zoomControl: true,
      zoomControlOptions: {
        position: window.google.maps.ControlPosition.RIGHT_BOTTOM,
      },
      streetViewControl: true,
      streetViewControlOptions: {
        position: window.google.maps.ControlPosition.RIGHT_BOTTOM,
      },
      mapTypeControl: false,
      fullscreenControl: true,
      fullscreenControlOptions: {
        position: window.google.maps.ControlPosition.LEFT_TOP,
      },
      styles: silverMapStyle,
      center: ACRE_CENTER,
      zoom: 13,
      gestureHandling: 'greedy',
    }
  }, [isLoaded])

  // Create taxi icons for each driver based on their status
  const driverIcons = useMemo(() => {
    if (typeof window === 'undefined' || !window.google) return new Map()
    
    const icons = new Map<string, google.maps.Icon>()
    drivers.forEach(driver => {
      let status: 'available' | 'on-trip' | 'offline' = 'offline'
      
      if (driver.is_online) {
        // Check if driver has an active trip
        const hasActiveTrip = driverTrips[driver.id]?.hasActiveTrip || false
        status = hasActiveTrip ? 'on-trip' : 'available'
      }
      
      icons.set(driver.id, createTaxiIcon(status, window.google))
    })
    return icons
  }, [drivers, driverTrips])

  // Update map bounds when drivers change
  useEffect(() => {
    if (!isLoaded || !mapRef.current || typeof window === 'undefined' || !window.google) return

    const driversKey = onlineDrivers.map(d => `${d.id}:${d.latitude}:${d.longitude}`).join(',')
    if (driversKey === prevDriversKeyRef.current && !isInitialMountRef.current) {
      return
    }

    prevDriversKeyRef.current = driversKey

    if (onlineDrivers.length > 0) {
      const bounds = new window.google.maps.LatLngBounds()
      onlineDrivers.forEach(driver => {
        if (driver.latitude && driver.longitude) {
          bounds.extend({ lat: driver.latitude, lng: driver.longitude })
        }
      })

      if (isInitialMountRef.current || bounds.toJSON()) {
        mapRef.current.fitBounds(bounds, 50)
        const listener = window.google.maps.event.addListener(
          mapRef.current,
          'bounds_changed',
          () => {
            if (mapRef.current && mapRef.current.getZoom()! > 16) {
              mapRef.current.setZoom(16)
            }
            window.google.maps.event.removeListener(listener)
          }
        )
      }
    } else {
      if (isInitialMountRef.current) {
        mapRef.current.setCenter(ACRE_CENTER)
        mapRef.current.setZoom(13)
      }
    }

    if (isInitialMountRef.current) {
      setTimeout(() => {
        isInitialMountRef.current = false
      }, 1000)
    }
  }, [onlineDrivers, isLoaded])

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map
  }, [])

  const onUnmount = useCallback(() => {
    mapRef.current = null
  }, [])

  if (!isLoaded) {
    return (
      <div className="h-full w-full bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-4">
            <div className="absolute inset-0 animate-spin">
              <svg className="w-full h-full text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" strokeWidth="2" strokeDasharray="3 3" opacity="0.3" />
              </svg>
            </div>
            <div className="absolute inset-0 flex items-center justify-center text-4xl">
              🚕
            </div>
          </div>
          <p className="text-gray-700 font-medium">טוען מפה...</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <GoogleMap
        mapContainerStyle={containerStyle}
        options={mapOptions}
        onLoad={onLoad}
        onUnmount={onUnmount}
      >
        {/* Render zones */}
        {zones.map((zone) => (
          <ZonePolygon key={zone.id} zone={zone} />
        ))}

        {/* Render driver markers */}
        {drivers.map((driver) => {
          if (!driver.latitude || !driver.longitude) return null
          
          return (
            <DriverMarker
              key={driver.id}
              driver={driver}
              isSelected={selectedDriver?.id === driver.id}
              onSelect={() => setSelectedDriver(driver)}
              isDisconnected={driver.is_online && !presenceMap[driver.id]}
              google={window.google}
            />
          )
        })}

        {/* Stats overlay with glassmorphism */}
        <div className="absolute top-4 left-4 glass-card-light rounded-2xl p-4 shadow-xl backdrop-blur-xl bg-white/80 border border-white/20" style={{ backdropFilter: 'blur(20px)' }}>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-green-500 animate-pulse" />
              <span className="text-sm font-medium text-gray-900">
                {onlineDrivers.length} נהגים פעילים
              </span>
            </div>
            {Object.keys(presenceMap).length < onlineDrivers.length && (
              <div className="flex items-center gap-3">
                <div className="w-3 h-3 rounded-full bg-red-400" />
                <span className="text-xs text-red-600 font-medium">
                  {onlineDrivers.length - Object.keys(presenceMap).length} נהגים מנותקים
                </span>
              </div>
            )}
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 rounded-full bg-amber-500" />
              <span className="text-sm font-medium text-gray-900">
                {zones.length} אזורים
              </span>
            </div>
          </div>
        </div>
      </GoogleMap>

      <DriverDetailSheet
        driver={selectedDriver}
        open={!!selectedDriver}
        onOpenChange={(open) => !open && setSelectedDriver(null)}
        hasActiveTrip={selectedDriver ? (driverTrips[selectedDriver.id]?.hasActiveTrip || false) : false}
        onAssignTrip={(driverId) => {
          console.log('Assign trip to driver:', driverId)
          setSelectedDriver(null)
          // TODO: Implement trip assignment
        }}
      />
    </>
  )
}
