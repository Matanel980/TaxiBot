'use client'

import { useEffect, useState, useMemo, useRef } from 'react'
import { Polyline, Marker } from '@react-google-maps/api'
import type { Trip, Profile } from '@/lib/supabase'
import { getDirectionsRoute, calculateStraightDistance } from '@/lib/directions-service'
import { geocodeAddress } from '@/lib/geocoding'

interface RouteVisualizationProps {
  trip: Trip
  driver: Profile | null
  google: typeof window.google
}

interface RouteData {
  pickupToDriverPath: Array<{ lat: number; lng: number }>
  driverToDestinationPath: Array<{ lat: number; lng: number }>
  completedPath: Array<{ lat: number; lng: number }>
  pickupCoords: { lat: number; lng: number } | null
  destinationCoords: { lat: number; lng: number } | null
  loading: boolean
  hasDirectionsRoute: boolean
  eta: number | null // ETA in minutes
  error: string | null // Error message from Directions API
  useFallback: boolean // Whether to show dashed fallback line
}

export function RouteVisualization({ trip, driver, google }: RouteVisualizationProps) {
  const [routeData, setRouteData] = useState<RouteData>({
    pickupToDriverPath: [],
    driverToDestinationPath: [],
    completedPath: [],
    pickupCoords: null,
    destinationCoords: null,
    loading: true,
    hasDirectionsRoute: false,
    eta: null,
    error: null,
    useFallback: false,
  })

  const calculationInProgressRef = useRef(false)

  // Calculate routes when trip or driver changes - USING RAW COORDINATES FIRST
  useEffect(() => {
    if (!trip || !google || calculationInProgressRef.current) return

    const calculateRoutes = async () => {
      calculationInProgressRef.current = true
      
      try {
        console.log('[RouteVisualization] 🗺️ Starting route calculation for trip:', trip.id)
        setRouteData(prev => ({ ...prev, loading: true, error: null, useFallback: false }))

        // MISSION-CRITICAL: Use ONLY raw coordinates from database - NO GEOCODING FALLBACK
        // If coordinates are missing, fail gracefully - this indicates a data integrity issue
        
        // Step 1: Get pickup coordinates (REQUIRED - must exist in DB)
        let pickupCoords: { lat: number; lng: number } | null = null
        if (trip.pickup_lat && trip.pickup_lng && 
            typeof trip.pickup_lat === 'number' && typeof trip.pickup_lng === 'number' &&
            !isNaN(trip.pickup_lat) && !isNaN(trip.pickup_lng)) {
          pickupCoords = { lat: trip.pickup_lat, lng: trip.pickup_lng }
          console.log('[RouteVisualization] ✅ Using pickup coordinates from DB:', pickupCoords)
        } else {
          // DATA INTEGRITY ERROR: Coordinates missing - this should never happen
          console.error('[RouteVisualization] ❌ DATA INTEGRITY ERROR: Pickup coordinates missing from trip:', trip.id)
          setRouteData(prev => ({ 
            ...prev, 
            loading: false, 
            error: 'Data integrity error: Pickup coordinates missing. Trip must be recreated with coordinates.' 
          }))
          calculationInProgressRef.current = false
          return
        }

        // Step 2: Get destination coordinates (REQUIRED - must exist in DB)
        let destinationCoords: { lat: number; lng: number } | null = null
        if (trip.destination_lat && trip.destination_lng && 
            typeof trip.destination_lat === 'number' && typeof trip.destination_lng === 'number' &&
            !isNaN(trip.destination_lat) && !isNaN(trip.destination_lng)) {
          destinationCoords = { lat: trip.destination_lat, lng: trip.destination_lng }
          console.log('[RouteVisualization] ✅ Using destination coordinates from DB:', destinationCoords)
        } else {
          // DATA INTEGRITY ERROR: Coordinates missing - this should never happen
          console.error('[RouteVisualization] ❌ DATA INTEGRITY ERROR: Destination coordinates missing from trip:', trip.id)
          setRouteData(prev => ({ 
            ...prev, 
            loading: false, 
            error: 'Data integrity error: Destination coordinates missing. Trip must be recreated with coordinates.' 
          }))
          calculationInProgressRef.current = false
          return
        }

        // CRITICAL: If we don't have coordinates, abort (but log it)
        if (!pickupCoords || !destinationCoords) {
          console.error('[RouteVisualization] ❌ Missing coordinates - pickup:', pickupCoords, 'destination:', destinationCoords)
          setRouteData(prev => ({ ...prev, loading: false, error: 'Missing coordinates' }))
          calculationInProgressRef.current = false
          return
        }

        // CRITICAL: If we don't have driver coordinates, abort (but log it)
        if (!driver?.latitude || !driver.longitude) {
          console.error('[RouteVisualization] ❌ Missing driver coordinates - driver:', driver)
          setRouteData(prev => ({ ...prev, loading: false, error: 'Missing driver coordinates' }))
          calculationInProgressRef.current = false
          return
        }

        const driverCoords = { lat: driver.latitude, lng: driver.longitude }
        console.log('[RouteVisualization] 📍 Driver coordinates:', driverCoords)

        // Step 3: USE DIRECTIONS API ONLY - No straight lines, only real routes
        if (trip.status === 'pending') {
          console.log('[RouteVisualization] 🔄 Calling Directions API for pending route (driver to pickup)...')
          const directionsResult = await getDirectionsRoute(
            driverCoords,
            pickupCoords,
            google
          )
          
          if (directionsResult.error) {
            // DETAILED ERROR LOGGING
            const errorMessage = directionsResult.error
            console.error('[RouteVisualization] ❌ Directions API ERROR for pending route:', errorMessage)
            console.error('[RouteVisualization] Error details:', {
              error: errorMessage,
              status: directionsResult.status || 'UNKNOWN',
              origin: driverCoords,
              destination: pickupCoords,
            })
            
            // FALLBACK: Show dashed line between coordinates
            console.log('[RouteVisualization] ⚠️ Showing fallback dashed line due to Directions API error')
            setRouteData(prev => ({
              ...prev,
              loading: false,
              error: `Directions API Error: ${errorMessage}${directionsResult.status ? ` (Status: ${directionsResult.status})` : ''}`,
              pickupCoords,
              destinationCoords,
              pickupToDriverPath: [driverCoords, pickupCoords], // Fallback dashed line
              useFallback: true,
            }))
            calculationInProgressRef.current = false
            return
          }
          
          if (!directionsResult.path || directionsResult.path.length === 0) {
            console.error('[RouteVisualization] ❌ Directions API returned empty path')
            // FALLBACK: Show dashed line
            setRouteData(prev => ({
              ...prev,
              loading: false,
              error: 'Directions API returned empty path',
              pickupCoords,
              destinationCoords,
              pickupToDriverPath: [driverCoords, pickupCoords], // Fallback dashed line
              useFallback: true,
            }))
            calculationInProgressRef.current = false
            return
          }
          
          console.log('[RouteVisualization] ✅ Directions API succeeded for pending route:', directionsResult.path.length, 'points')
          setRouteData(prev => ({
            ...prev,
            pickupCoords,
            destinationCoords,
            pickupToDriverPath: directionsResult.path,
            hasDirectionsRoute: true,
            loading: false,
            eta: directionsResult.duration ? Math.round(directionsResult.duration / 60) : null,
            error: null,
            useFallback: false,
          }))
        } else if (trip.status === 'active') {
          console.log('[RouteVisualization] 🔄 Calling Directions API for active route (driver to destination)...')
          const directionsResult = await getDirectionsRoute(
            driverCoords,
            destinationCoords,
            google
          )
          
          if (directionsResult.error) {
            // DETAILED ERROR LOGGING
            const errorMessage = directionsResult.error
            console.error('[RouteVisualization] ❌ Directions API ERROR for active route:', errorMessage)
            console.error('[RouteVisualization] Error details:', {
              error: errorMessage,
              status: directionsResult.status || 'UNKNOWN',
              origin: driverCoords,
              destination: destinationCoords,
            })
            
            // FALLBACK: Show dashed line between coordinates
            console.log('[RouteVisualization] ⚠️ Showing fallback dashed line due to Directions API error')
            setRouteData(prev => ({
              ...prev,
              loading: false,
              error: `Directions API Error: ${errorMessage}${directionsResult.status ? ` (Status: ${directionsResult.status})` : ''}`,
              pickupCoords,
              destinationCoords,
              driverToDestinationPath: [driverCoords, destinationCoords], // Fallback dashed line
              useFallback: true,
            }))
            calculationInProgressRef.current = false
            return
          }
          
          if (!directionsResult.path || directionsResult.path.length === 0) {
            console.error('[RouteVisualization] ❌ Directions API returned empty path')
            // FALLBACK: Show dashed line
            setRouteData(prev => ({
              ...prev,
              loading: false,
              error: 'Directions API returned empty path',
              pickupCoords,
              destinationCoords,
              driverToDestinationPath: [driverCoords, destinationCoords], // Fallback dashed line
              useFallback: true,
            }))
            calculationInProgressRef.current = false
            return
          }
          
          console.log('[RouteVisualization] ✅ Directions API succeeded for active route:', directionsResult.path.length, 'points')
          setRouteData(prev => ({
            ...prev,
            pickupCoords,
            destinationCoords,
            driverToDestinationPath: directionsResult.path,
            hasDirectionsRoute: true,
            loading: false,
            eta: directionsResult.duration ? Math.round(directionsResult.duration / 60) : null,
            error: null,
            useFallback: false,
          }))
        }
      } catch (error) {
        console.error('[RouteVisualization] ❌ Route calculation exception:', error)
        setRouteData(prev => ({ 
          ...prev, 
          loading: false, 
          error: `Exception: ${error instanceof Error ? error.message : String(error)}` 
        }))
      } finally {
        calculationInProgressRef.current = false
      }
    }

    calculateRoutes()

    // Reset calculation flag when trip changes
    return () => {
      calculationInProgressRef.current = false
    }
  }, [trip.id, trip.status, trip.pickup_lat, trip.pickup_lng, trip.pickup_address, trip.destination_address, driver?.id, driver?.latitude, driver?.longitude, google])

  // Create custom marker icons
  const pickupIcon = useMemo(() => {
    if (!google) return undefined
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
        <svg width="32" height="48" viewBox="0 0 32 48" xmlns="http://www.w3.org/2000/svg">
          <circle cx="16" cy="16" r="12" fill="#10b981" stroke="#ffffff" stroke-width="2">
            <animate attributeName="r" values="12;16;12" dur="2s" repeatCount="indefinite"/>
            <animate attributeName="opacity" values="1;0.5;1" dur="2s" repeatCount="indefinite"/>
          </circle>
          <text x="16" y="20" text-anchor="middle" fill="white" font-size="14" font-weight="bold">A</text>
          <path d="M 16 28 L 8 48 L 24 48 Z" fill="#10b981"/>
        </svg>
      `)}`,
      scaledSize: new google.maps.Size(32, 48),
      anchor: new google.maps.Point(16, 48),
    }
  }, [google])

  const destinationIcon = useMemo(() => {
    if (!google) return undefined
    return {
      url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
        <svg width="32" height="48" viewBox="0 0 32 48" xmlns="http://www.w3.org/2000/svg">
          <circle cx="16" cy="16" r="12" fill="#ef4444" stroke="#ffffff" stroke-width="2"/>
          <text x="16" y="20" text-anchor="middle" fill="white" font-size="14" font-weight="bold">B</text>
          <path d="M 16 28 L 8 48 L 24 48 Z" fill="#ef4444"/>
        </svg>
      `)}`,
      scaledSize: new google.maps.Size(32, 48),
      anchor: new google.maps.Point(16, 48),
    }
  }, [google])

  // Render routes - ONLY if we have Directions API routes OR fallback coordinates
  if (!routeData.pickupCoords || !routeData.destinationCoords) {
    if (routeData.error) {
      console.error('[RouteVisualization] ⚠️ Error state:', routeData.error)
    }
    return null
  }

  // Log when we're about to render
  console.log('[RouteVisualization] 🎨 RENDERING ROUTES - pending path:', routeData.pickupToDriverPath.length, 'points, active path:', routeData.driverToDestinationPath.length, 'points, fallback:', routeData.useFallback)

  return (
    <>
      {/* Orange polyline: Driver to Pickup (Pending) - DIRECTIONS API or FALLBACK */}
      {trip.status === 'pending' && routeData.pickupToDriverPath.length > 0 && (
        <Polyline
          path={routeData.pickupToDriverPath}
          options={{
            strokeColor: '#f97316', // Orange
            strokeOpacity: routeData.useFallback ? 0.5 : 0.8,
            strokeWeight: routeData.useFallback ? 3 : 4,
            icons: routeData.useFallback ? undefined : [{
              icon: {
                path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                strokeColor: '#f97316',
                fillColor: '#f97316',
                fillOpacity: 1,
                scale: 4,
              },
              offset: '50%',
              repeat: '100px',
            }],
            geodesic: routeData.useFallback, // Use geodesic for fallback (straight line)
            zIndex: 10,
          }}
        />
      )}

      {/* Blue polyline: Driver to Destination (Active) - DIRECTIONS API or FALLBACK */}
      {trip.status === 'active' && routeData.driverToDestinationPath.length > 0 && (
        <>
          <Polyline
            path={routeData.driverToDestinationPath}
            options={{
              strokeColor: '#3b82f6', // Neon Blue
              strokeOpacity: routeData.useFallback ? 0.5 : 0.9,
              strokeWeight: routeData.useFallback ? 3 : 5,
              icons: routeData.useFallback ? undefined : [{
                icon: {
                  path: google.maps.SymbolPath.FORWARD_CLOSED_ARROW,
                  strokeColor: '#3b82f6',
                  fillColor: '#3b82f6',
                  fillOpacity: 1,
                  scale: 5,
                },
                offset: '50%',
                repeat: '120px',
              }],
              geodesic: routeData.useFallback, // Use geodesic for fallback (straight line)
              zIndex: 11,
            }}
          />

          {/* Emerald green polyline: Completed portion (simplified for now) */}
          {routeData.completedPath.length > 0 && (
            <Polyline
              path={routeData.completedPath}
              options={{
                strokeColor: '#10b981', // Emerald Green
                strokeOpacity: 1,
                strokeWeight: 6,
                geodesic: false,
                zIndex: 12,
              }}
            />
          )}
        </>
      )}

      {/* Pickup Marker (A) - Pulsing for pending trips */}
      {routeData.pickupCoords && (
        <Marker
          position={routeData.pickupCoords}
          icon={pickupIcon}
          label={{
            text: 'A',
            color: 'white',
            fontWeight: 'bold',
            fontSize: '14px',
          }}
          zIndex={20}
        />
      )}

      {/* Destination Marker (B) */}
      {routeData.destinationCoords && (
        <Marker
          position={routeData.destinationCoords}
          icon={destinationIcon}
          label={{
            text: 'B',
            color: 'white',
            fontWeight: 'bold',
            fontSize: '14px',
          }}
          zIndex={20}
        />
      )}
    </>
  )
}
