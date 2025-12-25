'use client'

import { useEffect, useRef, useMemo, useCallback } from 'react'
import { GoogleMap, Marker, useJsApiLoader } from '@react-google-maps/api'
import { darkMapStyle, ISRAEL_CENTER, calculateDistance, GOOGLE_MAPS_LOADER_OPTIONS } from '@/lib/google-maps-loader'

const containerStyle = {
  width: '100%',
  height: '100%',
}

interface DriverMapClientProps {
  userPosition?: { lat: number; lng: number } | null
}

export function DriverMapClient({ userPosition }: DriverMapClientProps) {
  const { isLoaded } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS)

  const mapRef = useRef<google.maps.Map | null>(null)
  const prevPositionRef = useRef<{ lat: number; lng: number } | null>(null)
  const isInitialMountRef = useRef(true)

  // Memoize map center and zoom
  const mapCenter = useMemo(() => {
    if (userPosition) {
      return { lat: userPosition.lat, lng: userPosition.lng }
    }
    return ISRAEL_CENTER
  }, [userPosition])

  // Memoize map options to prevent unnecessary re-renders
  const mapOptions = useMemo<google.maps.MapOptions>(() => ({
    disableDefaultUI: false,
    zoomControl: true,
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: true,
    styles: darkMapStyle,
    center: mapCenter,
    zoom: 17, // Street-level zoom
  }), [mapCenter])

  // Update map center when user position changes
  useEffect(() => {
    if (!isLoaded || !mapRef.current || !userPosition) return

    // Check if position changed significantly (>100m)
    if (prevPositionRef.current && !isInitialMountRef.current) {
      const distance = calculateDistance(
        prevPositionRef.current.lat,
        prevPositionRef.current.lng,
        userPosition.lat,
        userPosition.lng
      )

      // Only update if moved more than 100 meters
      if (distance < 100) {
        return
      }
    }

    // Update map center with smooth pan (only if moved significantly)
    if (mapRef.current) {
      const currentCenter = mapRef.current.getCenter()
      if (currentCenter) {
        const currentLat = currentCenter.lat()
        const currentLng = currentCenter.lng()
        const distance = calculateDistance(
          currentLat,
          currentLng,
          userPosition.lat,
          userPosition.lng
        )
        
        // Only pan if moved more than 50 meters
        if (distance > 50 || isInitialMountRef.current) {
          mapRef.current.panTo({ lat: userPosition.lat, lng: userPosition.lng })
          mapRef.current.setZoom(17) // Ensure street-level zoom
        }
      } else {
        mapRef.current.setCenter({ lat: userPosition.lat, lng: userPosition.lng })
        mapRef.current.setZoom(17)
      }
      prevPositionRef.current = userPosition
    }

    // Mark initial mount as complete
    if (isInitialMountRef.current) {
      setTimeout(() => {
        isInitialMountRef.current = false
      }, 1000)
    }
  }, [userPosition, isLoaded])

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map
    // Set initial position if available
    if (userPosition) {
      map.setCenter({ lat: userPosition.lat, lng: userPosition.lng })
      map.setZoom(17)
    }
  }, [userPosition])

  const onUnmount = useCallback(() => {
    mapRef.current = null
  }, [])

  // Create custom driver marker icon
  const driverIcon = useMemo<google.maps.Icon | undefined>(() => {
    if (!userPosition || typeof window === 'undefined' || !window.google) return undefined
    return {
      url: `data:image/svg+xml;base64,${btoa(`
        <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
          <circle cx="16" cy="16" r="14" fill="#F7C948" stroke="white" stroke-width="3"/>
          <circle cx="16" cy="16" r="6" fill="#000"/>
        </svg>
      `)}`,
      scaledSize: new window.google.maps.Size(32, 32),
      anchor: new window.google.maps.Point(16, 16),
    }
  }, [userPosition])

  if (!isLoaded) {
    return (
      <div className="h-full w-full bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-taxi-yellow mx-auto mb-4"></div>
          <p className="text-white">טוען מפה...</p>
        </div>
      </div>
    )
  }

  return (
    <GoogleMap
      mapContainerStyle={containerStyle}
      options={mapOptions}
      onLoad={onLoad}
      onUnmount={onUnmount}
    >
      {userPosition && driverIcon && (
        <Marker
          position={{ lat: userPosition.lat, lng: userPosition.lng }}
          icon={driverIcon}
        />
      )}
    </GoogleMap>
  )
}
