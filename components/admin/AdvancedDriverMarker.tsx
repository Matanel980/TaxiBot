'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
import type { Profile } from '@/lib/supabase'
import React from 'react'

interface AdvancedDriverMarkerProps {
  driver: Profile
  isSelected: boolean
  onSelect: () => void
  isDisconnected?: boolean
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
  google,
  map
}: AdvancedDriverMarkerProps) => {
  const markerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null)
  const [position, setPosition] = useState({ lat: driver.latitude || 0, lng: driver.longitude || 0 })
  const [heading, setHeading] = useState(driver.heading || 0)
  const animationFrameRef = useRef<number | null>(null)

  // Smooth interpolation (glide) effect for position updates
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

  // Create custom PinElement for AdvancedMarkerElement
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
    
    const color = colors[status]
    const opacity = isDisconnected ? 0.5 : 1.0

    // Create PinElement with custom content
    const pin = new google.maps.marker.PinElement({
      background: color,
      borderColor: '#ffffff',
      glyphColor: '#ffffff',
      scale: isSelected ? 1.2 : 1.0,
      glyph: '🚕',
    })

    // Create container for rotation
    const container = document.createElement('div')
    container.style.transform = `rotate(${heading}deg)`
    container.style.transition = 'transform 0.3s ease-out'
    container.appendChild(pin.element)

    return container
  }, [google, driver.is_online, isSelected, heading, isDisconnected])

  // Create and update AdvancedMarkerElement
  useEffect(() => {
    if (!google?.maps?.marker || !map || !driver.latitude || !driver.longitude) {
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
      // Update existing marker
      markerRef.current.position = { lat: position.lat, lng: position.lng }
      markerRef.current.content = pinElement
      markerRef.current.zIndex = isSelected ? 1000 : (isDisconnected ? 0 : 500)
    }

    // Cleanup
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
  return (
    prevProps.driver.id === nextProps.driver.id &&
    prevProps.driver.latitude === nextProps.driver.latitude &&
    prevProps.driver.longitude === nextProps.driver.longitude &&
    prevProps.driver.heading === nextProps.driver.heading &&
    prevProps.isSelected === nextProps.isSelected &&
    prevProps.isDisconnected === nextProps.isDisconnected
  )
})

AdvancedDriverMarker.displayName = 'AdvancedDriverMarker'





