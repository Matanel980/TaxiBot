'use client'

import { useEffect, useState, useRef, useMemo, useCallback } from 'react'
import { GoogleMap, Marker, Polygon, InfoWindow, Polyline, useJsApiLoader } from '@react-google-maps/api'
import { AdvancedDriverMarker } from './AdvancedDriverMarker'
import { createClient } from '@/lib/supabase'
import type { Profile, ZonePostGIS, Trip } from '@/lib/supabase'
import { 
  silverMapStyle, 
  ACRE_CENTER, 
  createTaxiIcon,
  GOOGLE_MAPS_LOADER_OPTIONS
} from '@/lib/google-maps-loader'
import { geometryToGooglePaths, featureToZone } from '@/lib/spatial-utils'
import { useDriverTrips } from '@/lib/hooks/useDriverTrips'
import { DriverDetailSheet } from './DriverDetailSheet'
import { RouteVisualization } from './RouteVisualization'
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
  trips?: Trip[]
  selectedTripId?: string | null
  presenceMap?: Record<string, boolean>
  selectedDriverId?: string // Optional: external driver selection control
  onDriverSelect?: (driver: Profile | null) => void // Optional: callback for driver selection
}

// Animated driver marker with smooth transitions
const DriverMarker = ({ 
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
  const [showInfoWindow, setShowInfoWindow] = useState(false)
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

  // Guard: Ensure google is available
  if (!google || !google.maps) {
    console.error('[DriverMarker] Google Maps API not available')
    return null
  }

  // Determine status for icon
  let status: 'available' | 'on-trip' | 'offline' = 'offline'
  if (driver.is_online) {
    status = 'available' // Trip status is handled via icon logic in main client if needed
  }
  
  const icon = createTaxiIcon(status, google, heading)
  
  // Adjust icon opacity if disconnected (presence heartbeat failed)
  const markerIcon = useMemo(() => {
    if (!icon) return undefined
    return icon
  }, [icon])

  return (
    <>
      <Marker
        position={position}
        icon={markerIcon}
        onClick={() => {
          setShowInfoWindow(true)
          onSelect()
        }}
        animation={isSelected ? google.maps.Animation.BOUNCE : undefined}
        zIndex={isSelected ? 1000 : (isDisconnected ? 0 : 500)}
        opacity={isDisconnected ? 0.5 : 1.0}
      />
      {showInfoWindow && (
        <InfoWindow
          position={position}
          onCloseClick={() => setShowInfoWindow(false)}
        >
          <div className="px-2 py-1">
            <p className="text-sm font-semibold text-gray-900">{driver.full_name}</p>
            {driver.vehicle_number && (
              <p className="text-xs text-gray-600">{driver.vehicle_number}</p>
            )}
          </div>
        </InfoWindow>
      )}
    </>
  )
}

export function AdminLiveMapClient({ 
  drivers: initialDrivers, 
  zones: initialZones = [],
  trips = [],
  selectedTripId = null,
  presenceMap = {},
  selectedDriverId,
  onDriverSelect
}: AdminLiveMapClientProps) {
  const { isLoaded, loadError } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS)

  // Use props as single source of truth - remove internal Realtime subscription
  const [zones, setZones] = useState<ZonePostGIS[]>(initialZones)
  const [selectedDriver, setSelectedDriver] = useState<Profile | null>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const prevDriversKeyRef = useRef<string>('')
  const isInitialMountRef = useRef(true)
  const supabase = createClient()

  // CRITICAL: Use state to ensure reactivity to prop changes
  // This ensures the component re-renders when parent updates drivers array
  const [drivers, setDrivers] = useState<Profile[]>(initialDrivers || [])
  
  // Update drivers state when prop changes (from parent Realtime subscription)
  // FIX: Use deep comparison to ensure all updates are caught
  useEffect(() => {
    if (!initialDrivers) return
    
    // Create a key from all driver IDs and their location to detect any change
    const currentKey = drivers.map(d => `${d.id}:${d.latitude}:${d.longitude}:${d.updated_at}`).join('|')
    const newKey = initialDrivers.map(d => `${d.id}:${d.latitude}:${d.longitude}:${d.updated_at}`).join('|')
    
    // Only update if there's an actual change to prevent unnecessary re-renders
    if (currentKey !== newKey) {
      console.log('[AdminMap] Drivers prop changed, updating state:', {
        oldCount: drivers.length,
        newCount: initialDrivers.length,
        changed: currentKey !== newKey
      })
      setDrivers(initialDrivers)
    }
  }, [initialDrivers, drivers])
  
  // Sync with external selectedDriverId prop (after drivers state is initialized)
  useEffect(() => {
    if (selectedDriverId) {
      const driver = drivers.find(d => d.id === selectedDriverId)
      if (driver) {
        setSelectedDriver(driver)
      }
    } else if (selectedDriverId === undefined) {
      // Only clear if explicitly set to null/undefined from parent
      // Internal selection is managed separately
    }
  }, [selectedDriverId, drivers])
  
  // Notify parent when selection changes internally
  const handleDriverSelect = useCallback((driver: Profile | null) => {
    setSelectedDriver(driver)
    onDriverSelect?.(driver)
  }, [onDriverSelect])

  // Debug: Log initial props and driver location data
  useEffect(() => {
    console.log('[AdminMap] Component mounted with:', {
      driversCount: drivers.length,
      zonesCount: zones.length,
      isLoaded,
      loadError: loadError?.message,
      onlineDrivers: drivers.filter(d => d.is_online).length,
      driversWithLocation: drivers.filter(d => d.latitude && d.longitude).length
    })
    
    // Log sample driver data for debugging
    if (drivers.length > 0) {
      const sampleDriver = drivers.find(d => d.is_online && d.latitude && d.longitude)
      if (sampleDriver) {
        console.log('[AdminMap] Sample driver location:', {
          id: sampleDriver.id,
          name: sampleDriver.full_name,
          lat: sampleDriver.latitude,
          lng: sampleDriver.longitude,
          is_online: sampleDriver.is_online,
          updated_at: sampleDriver.updated_at
        })
      }
    }
  }, [])
  
  // Debug: Log when drivers state changes (from parent subscription)
  useEffect(() => {
    if (drivers.length > 0) {
      const onlineWithLocation = drivers.filter(d => 
        d.is_online && 
        d.latitude && 
        d.longitude &&
        typeof d.latitude === 'number' &&
        typeof d.longitude === 'number'
      )
      console.log('[AdminMap] 🔄 Drivers state updated:', {
        total: drivers.length,
        online: drivers.filter(d => d.is_online).length,
        onlineWithLocation: onlineWithLocation.length,
        sampleLocations: onlineWithLocation.slice(0, 3).map(d => ({
          id: d.id,
          name: d.full_name,
          lat: d.latitude,
          lng: d.longitude,
          updated_at: d.updated_at
        }))
      })
    } else {
      console.log('[AdminMap] Drivers state is empty')
    }
  }, [drivers])

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

    // Debounce zone checks to avoid excessive API calls (500ms for faster updates)
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
    }, 500) // Check zones every 500ms for faster zone detection

    return () => clearTimeout(zoneCheckTimeout)
  }, [drivers, zones, isLoaded, supabase])

  // Memoize online drivers with validation
  const onlineDrivers = useMemo(() => {
    const valid = drivers.filter(d => {
      // Validate coordinates are valid numbers and within valid ranges
      const hasValidCoords = 
        typeof d.latitude === 'number' && 
        typeof d.longitude === 'number' &&
        !isNaN(d.latitude) && 
        !isNaN(d.longitude) &&
        d.latitude >= -90 && d.latitude <= 90 &&
        d.longitude >= -180 && d.longitude <= 180 &&
        (d.latitude !== 0 || d.longitude !== 0) // Exclude (0,0) which is invalid
      
      const isValid = d.is_online && 
                      d.role === 'driver' && 
                      hasValidCoords
      
      if (d.is_online && !hasValidCoords) {
        console.warn('[AdminMap] ⚠️ Driver has invalid coordinates:', {
          id: d.id,
          name: d.full_name,
          lat: d.latitude,
          lng: d.longitude,
          latType: typeof d.latitude,
          lngType: typeof d.longitude
        })
      }
      
      return isValid
    })
    
    console.log('[AdminMap] Valid online drivers:', valid.length, 'out of', drivers.length, 'total')
    return valid
  }, [drivers])

  // Create stable drivers key for comparison
  const driversKey = useMemo(() => {
    return onlineDrivers.map(d => `${d.id}:${d.latitude}:${d.longitude}`).join(',')
  }, [onlineDrivers])

  // Memoize map options (only when Google Maps is loaded)
  const mapOptions = useMemo<google.maps.MapOptions>(() => {
    // Check if google is available
    if (typeof window === 'undefined' || !window.google?.maps) {
      console.warn('[AdminMap] Google Maps API not available, using fallback options')
      return {
        disableDefaultUI: false,
        styles: silverMapStyle,
        center: ACRE_CENTER,
        zoom: 13,
        gestureHandling: 'greedy',
      }
    }

    try {
      // Check if Map ID is available (optional - for Advanced Markers)
      const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID
      
      const options: google.maps.MapOptions = {
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
      
      // Only add mapId if available (required for Advanced Markers)
      if (mapId) {
        options.mapId = mapId
      }
      
      return options
    } catch (error) {
      console.error('[AdminMap] Error creating map options:', error)
      return {
        disableDefaultUI: false,
        styles: silverMapStyle,
        center: ACRE_CENTER,
        zoom: 13,
        gestureHandling: 'greedy',
      }
    }
  }, [isLoaded])

  // Debug: Log Google Maps loading status
  useEffect(() => {
    console.log('[AdminMap] Google Maps loaded:', isLoaded)
    console.log('[AdminMap] window.google available:', typeof window !== 'undefined' && !!window.google)
    console.log('[AdminMap] Drivers count:', drivers.length)
    console.log('[AdminMap] Online drivers:', onlineDrivers.length)
    if (onlineDrivers.length > 0) {
      console.log('[AdminMap] Sample driver data:', {
        id: onlineDrivers[0].id,
        lat: onlineDrivers[0].latitude,
        lng: onlineDrivers[0].longitude,
        is_online: onlineDrivers[0].is_online
      })
    }
  }, [isLoaded, drivers.length, onlineDrivers.length])

  // Center map on selected driver
  useEffect(() => {
    if (!isLoaded || !mapRef.current || !selectedDriver || typeof window === 'undefined' || !window.google) return
    
    if (selectedDriver.latitude && selectedDriver.longitude) {
      mapRef.current.setCenter({ lat: selectedDriver.latitude, lng: selectedDriver.longitude })
      mapRef.current.setZoom(16)
    }
  }, [selectedDriver, isLoaded])

  // Update map bounds when drivers or trips change (but not when a driver is selected)
  useEffect(() => {
    if (!isLoaded || !mapRef.current || typeof window === 'undefined' || !window.google) return
    if (selectedDriver) return // Don't auto-fit bounds if a driver is selected

    // Create a key that includes drivers AND trips to detect any change
    const driversKey = onlineDrivers.map(d => `${d.id}:${d.latitude}:${d.longitude}`).join(',')
    const tripsKey = trips
      .filter(t => t.pickup_lat && t.pickup_lng)
      .map(t => `${t.id}:${t.pickup_lat}:${t.pickup_lng}`)
      .join(',')
    const combinedKey = `${driversKey}|${tripsKey}`
    
    if (combinedKey === prevDriversKeyRef.current && !isInitialMountRef.current) {
      return
    }

    prevDriversKeyRef.current = combinedKey

    const bounds = new window.google.maps.LatLngBounds()
    let hasValidCoords = false
    
    // Add all online drivers to bounds
    onlineDrivers.forEach(driver => {
      if (driver.latitude && driver.longitude) {
        bounds.extend({ lat: driver.latitude, lng: driver.longitude })
        hasValidCoords = true
      }
    })
    
    // Add all trip pickup and destination points to bounds
    trips.forEach(trip => {
      // Add pickup coordinates
      if (trip.pickup_lat && trip.pickup_lng) {
        bounds.extend({ lat: trip.pickup_lat, lng: trip.pickup_lng })
        hasValidCoords = true
      }
      // Add destination coordinates (check both possible field names)
      const destLat = (trip as any).destination_lat || (trip as any).destination_latitude
      const destLng = (trip as any).destination_lng || (trip as any).destination_longitude
      if (destLat && destLng) {
        bounds.extend({ lat: destLat, lng: destLng })
        hasValidCoords = true
      }
    })

    if (hasValidCoords) {
      // Fit bounds to include all drivers AND trip locations
      mapRef.current.fitBounds(bounds, {
        top: 50,
        right: 50,
        bottom: 50,
        left: 50,
      })
      
      const listener = window.google.maps.event.addListener(
        mapRef.current,
        'bounds_changed',
        () => {
          if (mapRef.current) {
            const currentZoom = mapRef.current.getZoom()
            if (currentZoom && currentZoom > 16) {
              mapRef.current.setZoom(16)
            }
          }
          window.google.maps.event.removeListener(listener)
        }
      )
    } else {
      // No valid coordinates - use default center
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
  }, [onlineDrivers, trips, isLoaded, selectedDriver])

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map
  }, [])

  const onUnmount = useCallback(() => {
    mapRef.current = null
  }, [])

  if (loadError) {
    console.error('[AdminMap] Google Maps load error:', loadError)
    return (
      <div className="h-full w-full bg-red-50 flex items-center justify-center">
        <div className="text-center p-6">
          <p className="text-red-600 font-medium mb-2">שגיאה בטעינת המפה</p>
          <p className="text-sm text-red-500">{loadError.message}</p>
          <p className="text-xs text-gray-500 mt-4">
            API Key: {process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ? 'מוגדר' : 'חסר'}
          </p>
        </div>
      </div>
    )
  }

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

  // Final safety check before rendering map
  if (!isLoaded || typeof window === 'undefined' || !window.google) {
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

        {/* Render driver markers using AdvancedMarkerElement - only when Google Maps is fully loaded */}
        {isLoaded && typeof window !== 'undefined' && window.google && mapRef.current && drivers.map((driver) => {
          if (!driver.latitude || !driver.longitude) {
            console.log('[AdminMap] Skipping driver without coordinates:', driver.id, driver.full_name)
            return null
          }
          
          if (!driver.is_online) {
            console.log('[AdminMap] Skipping offline driver:', driver.id, driver.full_name)
            return null
          }
          
          // CRITICAL: AdvancedMarkerElement requires a Map ID to work
          // Check if map has mapId before using Advanced Markers
          // If no mapId, fall back to classic Marker to avoid console errors
          const mapIdFromEnv = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID
          const mapIdFromOptions = (mapOptions as any)?.mapId
          const hasMapId = mapIdFromEnv || mapIdFromOptions
          
          const canUseAdvancedMarkers = 
            window.google.maps.marker && 
            window.google.maps.marker.AdvancedMarkerElement && 
            hasMapId
          
          // Log if Advanced Markers are disabled (only once per mount)
          if (!hasMapId && window.google.maps.marker?.AdvancedMarkerElement && isInitialMountRef.current) {
            console.info('[AdminMap] ℹ️ Using classic Markers (Advanced Markers require Map ID). To enable Advanced Markers, set NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID in .env.local')
          }
          
          // Use AdvancedMarkerElement only if Map ID is available
          if (canUseAdvancedMarkers) {
            return (
              <AdvancedDriverMarker
                key={driver.id}
                driver={driver}
                isSelected={selectedDriver?.id === driver.id}
                onSelect={() => handleDriverSelect(driver)}
                isDisconnected={driver.is_online && !presenceMap[driver.id]}
                google={window.google}
                map={mapRef.current}
              />
            )
          }
          
          // Fallback to classic Marker if AdvancedMarkerElement is not available or no Map ID
          // Classic Marker works without Map ID and provides full functionality
          return (
            <DriverMarker
              key={driver.id}
              driver={driver}
              isSelected={selectedDriver?.id === driver.id}
              onSelect={() => handleDriverSelect(driver)}
              isDisconnected={driver.is_online && !presenceMap[driver.id]}
              google={window.google}
            />
          )
        })}

        {/* Route Visualization - Show routes for selected trip */}
        {isLoaded && typeof window !== 'undefined' && window.google && selectedTripId && (() => {
          const selectedTrip = trips.find(t => t.id === selectedTripId)
          if (!selectedTrip) return null
          
          const tripDriver = selectedTrip.driver_id 
            ? drivers.find(d => d.id === selectedTrip.driver_id)
            : null
          
          if (!tripDriver) return null
          
          return (
            <RouteVisualization
              key={selectedTrip.id}
              trip={selectedTrip}
              driver={tripDriver}
              google={window.google}
            />
          )
        })()}

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
        onOpenChange={(open) => !open && handleDriverSelect(null)}
        hasActiveTrip={selectedDriver ? (driverTrips[selectedDriver.id]?.hasActiveTrip || false) : false}
        onAssignTrip={(driverId) => {
          console.log('Assign trip to driver:', driverId)
          handleDriverSelect(null)
          // TODO: Implement trip assignment
        }}
      />
    </>
  )
}
