'use client'

import { useEffect, useRef, useMemo } from 'react'
import type { Profile } from '@/lib/supabase'
import { useMarkerInterpolation } from '@/lib/utils/marker-interpolation'
import React from 'react'

interface AdvancedDriverMarkerProps {
  driver: Profile
  isSelected: boolean
  onSelect: () => void
  isDisconnected?: boolean
  isStale?: boolean // True if driver hasn't updated location in 2+ minutes
  google: typeof window.google
  map: google.maps.Map
}

/**
 * AdvancedMarkerElement-based driver marker
 * Uses Google's new marker API for high-performance rendering
 */
export const AdvancedDriverMarker = React.memo(({ 
  driver, 
  isSelected,
  onSelect,
  isDisconnected = false,
  isStale = false,
  google,
  map
}: AdvancedDriverMarkerProps) => {
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null)

  // SMOOTH INTERPOLATION: Use shared utility for smooth marker movement
  // Handles 0-360 heading wrap-around and prevents "supersonic" movements
  // Optimized for performance with 1000+ concurrent markers
  // Memory leak prevention: Shared utility handles cleanup automatically
  const { position, heading } = useMarkerInterpolation(
    driver.latitude && driver.longitude 
      ? { lat: driver.latitude, lng: driver.longitude } 
      : null,
    driver.heading ?? null,
    {
      duration: 2000,           // 2 seconds glide
      minDistanceMeters: 5,     // Skip interpolation for tiny movements (< 5m)
      maxDistanceMeters: 200,   // Jump instantly for large movements (> 200m) to avoid "supersonic" movement
      enabled: true,
    }
  )

  // Create custom PinElement for AdvancedMarkerElement
  // Uses interpolated heading for smooth rotation
  const pinElement = useMemo(() => {
    if (!google?.maps?.marker) {
      console.warn('[AdvancedDriverMarker] AdvancedMarkerElement API not available, falling back to classic Marker')
      return null
    }

    // Determine status for color
    let status: 'available' | 'on-trip' | 'offline' = 'offline'
    if (driver.is_online) {
      status = 'available'
    }
    
    const colors = {
      available: '#10B981', // Green
      'on-trip': '#EF4444',  // Red
      offline: '#6B7280'      // Gray
    }
    
    // Gray out if stale (no update in 2+ minutes)
    const color = isStale ? '#9CA3AF' : colors[status]
    const opacity = isDisconnected || isStale ? 0.5 : 1.0

    // Create PinElement with custom content
    const pin = new google.maps.marker.PinElement({
      background: color,
      borderColor: '#ffffff',
      glyphColor: '#ffffff',
      scale: isSelected ? 1.2 : 1.0,
      glyph: '🚕',
    })

    // Create container for rotation
    // Uses interpolated heading for smooth rotation (handles 0-360 wrap-around)
    const container = document.createElement('div')
    container.style.transform = `rotate(${heading ?? 0}deg)`
    container.style.transition = 'transform 0.3s ease-out'
    container.appendChild(pin.element)

    return container
  }, [google, driver.is_online, isSelected, heading, isDisconnected, isStale])

  // Create and update AdvancedMarkerElement
  // Uses interpolated position for smooth movement
  useEffect(() => {
    if (!google?.maps?.marker || !map || !position) {
      return
    }

    // Create marker if it doesn't exist
    if (!markerRef.current) {
      markerRef.current = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat: position.lat, lng: position.lng },
        content: pinElement,
        title: driver.full_name,
        zIndex: isSelected ? 1000 : (isDisconnected ? 0 : 500),
      })

      // Add click listener
      markerRef.current.addListener('click', () => {
        onSelect()
      })
    } else {
      // Update existing marker with interpolated position
      markerRef.current.position = { lat: position.lat, lng: position.lng }
      markerRef.current.content = pinElement
      markerRef.current.zIndex = isSelected ? 1000 : (isDisconnected ? 0 : 500)
    }

    // MEMORY LEAK PREVENTION: Proper cleanup when component unmounts or driver disconnects
    // This is critical for 1000+ concurrent markers
    return () => {
      if (markerRef.current) {
        markerRef.current.map = null
        markerRef.current = null
      }
    }
  }, [map, position, pinElement, isSelected, isDisconnected, driver.full_name, onSelect, google])

  // Don't render anything - AdvancedMarkerElement is managed via Google Maps API
  return null
}, (prevProps, nextProps) => {
  // PERFORMANCE: React.memo comparison to prevent unnecessary re-renders
  // Critical for 1000+ concurrent markers
  // Only re-render if driver data actually changed
  return (
    prevProps.driver.id === nextProps.driver.id &&
    prevProps.driver.latitude === nextProps.driver.latitude &&
    prevProps.driver.longitude === nextProps.driver.longitude &&
    prevProps.driver.heading === nextProps.driver.heading &&
    prevProps.driver.updated_at === nextProps.driver.updated_at &&
    prevProps.driver.is_online === nextProps.driver.is_online &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isDisconnected === nextProps.isDisconnected &&
    prevProps.isStale === nextProps.isStale
  )
})

AdvancedDriverMarker.displayName = 'AdvancedDriverMarker'





