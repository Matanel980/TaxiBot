'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import { calculatePolygonArea, calculateCentroid, googlePathsToWKT, validatePolygon } from '@/lib/spatial-utils'

/**
 * ZoneMapEngine - Headless map logic for zone drawing
 * Separates map/drawing logic from UI components
 */

export interface ZoneMetadata {
  area: number
  center: { lat: number; lng: number }
  wkt: string
}

export interface UseZoneMapEngineOptions {
  onPolygonComplete?: (polygon: google.maps.Polygon, metadata: ZoneMetadata) => void
  initialGeometry?: any
  defaultCenter?: google.maps.LatLngLiteral
  defaultZoom?: number
}

export function useZoneMapEngine(options: UseZoneMapEngineOptions = {}) {
  const {
    onPolygonComplete,
    initialGeometry,
    defaultCenter = { lat: 32.9278, lng: 35.0817 }, // Acre, Israel
    defaultZoom = 14
  } = options

  const [polygon, setPolygon] = useState<google.maps.Polygon | null>(null)
  const [metadata, setMetadata] = useState<ZoneMetadata | null>(null)
  const [isDrawing, setIsDrawing] = useState(!initialGeometry) // Start in drawing mode if no initial geometry
  const [validationError, setValidationError] = useState<string | null>(null)

  const mapRef = useRef<google.maps.Map | null>(null)
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null)
  const onPolygonCompleteRef = useRef(onPolygonComplete)

  // Update ref when callback changes
  useEffect(() => {
    onPolygonCompleteRef.current = onPolygonComplete
  }, [onPolygonComplete])

  // Handle polygon complete event
  const handlePolygonComplete = useCallback((poly: google.maps.Polygon) => {
    setIsDrawing(false)
    
    // Stop drawing mode
    if (drawingManagerRef.current) {
      drawingManagerRef.current.setDrawingMode(null)
    }

    // Get paths
    const path = poly.getPath()
    const paths = path.getArray()

    // Validate polygon
    const validation = validatePolygon(paths)
    if (!validation.valid) {
      setValidationError(validation.error || 'Invalid polygon')
      poly.setMap(null) // Remove invalid polygon
      return
    }

    setValidationError(null)

    // Calculate metadata
    try {
      const area = calculatePolygonArea(paths)
      const center = calculateCentroid(paths)
      const wkt = googlePathsToWKT(paths)

      const meta: ZoneMetadata = { area, center, wkt }
      setMetadata(meta)
      setPolygon(poly)

      // Add listener for path changes
      google.maps.event.addListener(path, 'set_at', () => {
        updateMetadata(poly)
      })
      google.maps.event.addListener(path, 'insert_at', () => {
        updateMetadata(poly)
      })

      // Callback
      if (onPolygonCompleteRef.current) {
        onPolygonCompleteRef.current(poly, meta)
      }
    } catch (error) {
      console.error('Error calculating metadata:', error)
      setValidationError('Failed to calculate zone metadata')
      poly.setMap(null)
    }
  }, [])

  // Update metadata when polygon is edited
  const updateMetadata = useCallback((poly: google.maps.Polygon) => {
    const path = poly.getPath()
    const paths = path.getArray()

    try {
      const area = calculatePolygonArea(paths)
      const center = calculateCentroid(paths)
      const wkt = googlePathsToWKT(paths)

      setMetadata({ area, center, wkt })
    } catch (error) {
      console.error('Error updating metadata:', error)
    }
  }, [])

  // Load initial geometry (for editing existing zones)
  const loadInitialGeometry = useCallback(
    (map: google.maps.Map, geometry: any) => {
      if (!geometry || geometry.type !== 'Polygon') return

      const coordinates = geometry.coordinates[0].map(([lng, lat]: number[]) => ({
        lat,
        lng
      }))

      const poly = new google.maps.Polygon({
        paths: coordinates,
        fillColor: '#F7C948',
        fillOpacity: 0.3,
        strokeWeight: 2,
        strokeColor: '#F7C948',
        editable: true,
        draggable: false
      })

      poly.setMap(map)
      
      // Calculate metadata for existing polygon
      const path = poly.getPath()
      const paths = path.getArray()
      const area = calculatePolygonArea(paths)
      const center = calculateCentroid(paths)
      const wkt = googlePathsToWKT(paths)

      setMetadata({ area, center, wkt })
      setPolygon(poly)

      // Center map on polygon
      const bounds = new google.maps.LatLngBounds()
      paths.forEach(p => bounds.extend(p))
      map.fitBounds(bounds)
    },
    []
  )

  // Initialize map
  const initializeMap = useCallback((map: google.maps.Map) => {
    mapRef.current = map

    // Wait for drawing library to be available
    if (typeof window === 'undefined' || !window.google?.maps?.drawing) {
      console.error('Google Maps Drawing library not loaded')
      setValidationError('ספריית הציור של Google Maps לא נטענה. אנא רענן את הדף.')
      return
    }

    // Check for deprecation warning (library still works but may be deprecated)
    if (window.google?.maps?.drawing) {
      console.warn('Google Maps Drawing library is deprecated (August 2025). Consider migrating to a custom drawing solution in the future.')
    }

    // Initialize DrawingManager with error handling
    let drawingManager: google.maps.drawing.DrawingManager
    try {
      drawingManager = new google.maps.drawing.DrawingManager({
        drawingMode: null,
        drawingControl: false, // We'll use custom UI (no default toolbar)
        polygonOptions: {
          fillColor: '#F7C948',
          fillOpacity: 0.3,
          strokeWeight: 2,
          strokeColor: '#F7C948',
          editable: true,
          draggable: false,
          clickable: false,
          zIndex: 1
        }
      })
    } catch (error) {
      console.error('Error creating DrawingManager:', error)
      setValidationError('שגיאה ביצירת כלי הציור')
      return
    }

    // Set map to allow drawing interactions
    map.setOptions({
      draggable: true,
      zoomControl: true,
      streetViewControl: true,
      clickableIcons: false
    })

    try {
      drawingManager.setMap(map)
      drawingManagerRef.current = drawingManager

      // Listen for polygon complete
      const listener = google.maps.event.addListener(
        drawingManager,
        'polygoncomplete',
        (poly: google.maps.Polygon) => {
          handlePolygonComplete(poly)
        }
      )

      // Store listener for cleanup
      ;(drawingManager as any)._polygonCompleteListener = listener
    } catch (error) {
      console.error('Error setting up DrawingManager:', error)
      setValidationError('שגיאה בהגדרת כלי הציור')
      return
    }

    // Load initial geometry if provided
    if (initialGeometry) {
      loadInitialGeometry(map, initialGeometry)
    }
  }, [initialGeometry, handlePolygonComplete, loadInitialGeometry])

  // Start drawing mode
  const startDrawing = useCallback(() => {
    // Retry logic with initialization guard
    const attemptStartDrawing = (retries = 3, delay = 100) => {
      if (!drawingManagerRef.current) {
        if (retries > 0) {
          console.warn(`DrawingManager not initialized, retrying in ${delay}ms... (${retries} retries left)`)
          setTimeout(() => attemptStartDrawing(retries - 1, delay * 2), delay)
          return
        } else {
          console.error('DrawingManager not initialized after retries')
          setValidationError('שגיאה בהפעלת מצב ציור. אנא רענן את הדף.')
          return
        }
      }

      // Verify drawing library is available
      if (typeof window === 'undefined' || !window.google?.maps?.drawing) {
        console.error('Google Maps Drawing library not available')
        setValidationError('ספריית הציור לא זמינה')
        return
      }

      // Clear any existing polygon
      if (polygon) {
        polygon.setMap(null)
        setPolygon(null)
        setMetadata(null)
      }

      setIsDrawing(true)
      setValidationError(null)
      
      try {
        // Ensure DrawingManager is attached to map
        if (!drawingManagerRef.current.getMap()) {
          if (mapRef.current) {
            drawingManagerRef.current.setMap(mapRef.current)
          } else {
            console.error('Map reference not available')
            setValidationError('מפה לא זמינה')
            return
          }
        }

        drawingManagerRef.current.setDrawingMode(
          google.maps.drawing.OverlayType.POLYGON
        )
        console.log('Drawing mode activated: POLYGON')
      } catch (error) {
        console.error('Error activating drawing mode:', error)
        setValidationError('שגיאה בהפעלת מצב ציור')
      }
    }

    attemptStartDrawing()
  }, [polygon])

  // Clear current drawing
  const clearDrawing = useCallback(() => {
    if (polygon) {
      polygon.setMap(null)
      setPolygon(null)
      setMetadata(null)
    }
    setIsDrawing(true) // Keep drawing mode active after clearing
    setValidationError(null)

    if (drawingManagerRef.current) {
      // Stop current drawing mode
      drawingManagerRef.current.setDrawingMode(null)
      // Drawing mode will be reactivated by startDrawing if needed
    }
  }, [polygon])

  // Cancel drawing mode
  const cancelDrawing = useCallback(() => {
    setIsDrawing(false)
    if (drawingManagerRef.current) {
      drawingManagerRef.current.setDrawingMode(null)
    }
  }, [])

  // Get WKT representation
  const getWKT = useCallback(() => {
    return metadata?.wkt || null
  }, [metadata])

  // Get metadata
  const getMetadata = useCallback(() => {
    return metadata
  }, [metadata])

  // Reset drawing state (for after save)
  const resetDrawingState = useCallback(() => {
    // Clear polygon
    if (polygon) {
      polygon.setMap(null)
      setPolygon(null)
    }
    
    // Reset metadata
    setMetadata(null)
    
    // Reset drawing state
    setIsDrawing(false)
    setValidationError(null)
    
    // Reset DrawingManager
    if (drawingManagerRef.current) {
      try {
        drawingManagerRef.current.setDrawingMode(null)
        // Detach and reattach to ensure clean state
        const map = drawingManagerRef.current.getMap()
        if (map) {
          drawingManagerRef.current.setMap(null)
          // Small delay before reattaching to ensure cleanup
          setTimeout(() => {
            if (drawingManagerRef.current && mapRef.current) {
              drawingManagerRef.current.setMap(mapRef.current)
            }
          }, 100)
        }
      } catch (error) {
        console.error('Error resetting DrawingManager:', error)
      }
    }
  }, [polygon])

  // Cleanup
  useEffect(() => {
    return () => {
      if (polygon) {
        polygon.setMap(null)
      }
      if (drawingManagerRef.current) {
        // Remove event listeners
        const listener = (drawingManagerRef.current as any)?._polygonCompleteListener
        if (listener) {
          google.maps.event.removeListener(listener)
        }
        drawingManagerRef.current.setMap(null)
        drawingManagerRef.current = null
      }
    }
  }, [polygon])

  return {
    // State
    polygon,
    metadata,
    isDrawing,
    validationError,
    
    // Map refs
    mapRef,
    drawingManagerRef,
    
    // Actions
    initializeMap,
    startDrawing,
    clearDrawing,
    cancelDrawing,
    resetDrawingState,
    getWKT,
    getMetadata,
    
    // Config
    defaultCenter,
    defaultZoom
  }
}

