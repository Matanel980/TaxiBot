'use client'

import { useEffect, useRef, useMemo, useCallback, useState } from 'react'
import { GoogleMap, Marker, InfoWindow, Circle, useJsApiLoader } from '@react-google-maps/api'
import { darkMapStyle, ISRAEL_CENTER, calculateDistance, GOOGLE_MAPS_LOADER_OPTIONS, getAddressFromCoords, createTaxiIcon } from '@/lib/google-maps-loader'
import { useMarkerInterpolation } from '@/lib/utils/marker-interpolation'
import { Button } from '@/components/ui/button'
import { MapPin, Maximize2, Minimize2, Navigation2, X, Search, MapPin as MapPinIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'

const containerStyle = {
  width: '100%',
  height: '100%',
}

interface DriverMapClientProps {
  userPosition?: { lat: number; lng: number } | null
  heading?: number | null // Driver heading/orientation in degrees (0-360)
  onLocationMarked?: (location: { lat: number; lng: number; address?: string }) => void
  onAddressSearch?: (address: string) => void
}

export function DriverMapClient({ userPosition, heading, onLocationMarked, onAddressSearch }: DriverMapClientProps) {
  const { isLoaded } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS)
  const [mapSize, setMapSize] = useState<'normal' | 'fullscreen'>('normal')
  const [clickedPosition, setClickedPosition] = useState<{ lat: number; lng: number; address: string | null } | null>(null)
  const [loadingAddress, setLoadingAddress] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [autocompleteService, setAutocompleteService] = useState<google.maps.places.AutocompleteService | null>(null)
  const [geocoderService, setGeocoderService] = useState<google.maps.Geocoder | null>(null)
  const [searchSuggestions, setSearchSuggestions] = useState<google.maps.places.AutocompletePrediction[]>([])
  const [markingLocation, setMarkingLocation] = useState(false)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const autocompleteRef = useRef<HTMLDivElement>(null)

  const mapRef = useRef<google.maps.Map | null>(null)
  const prevPositionRef = useRef<{ lat: number; lng: number } | null>(null)
  const isInitialMountRef = useRef(true)

  // SMOOTH INTERPOLATION: Use shared interpolation utility for smooth marker movement
  // This prevents marker "jumps" and provides smooth 60fps animation
  const { position: interpolatedPosition, heading: interpolatedHeading } = useMarkerInterpolation(
    userPosition ? { lat: userPosition.lat, lng: userPosition.lng } : null,
    heading ?? null,
    {
      duration: 2000, // 2 seconds glide
      minDistanceMeters: 5, // Skip interpolation for tiny movements (< 5m)
      maxDistanceMeters: 200, // Jump instantly for large movements (> 200m) to avoid "supersonic" movement
      enabled: true,
    }
  )

  // Memoize map center and zoom
  // Uses interpolated position for smooth initial centering
  const mapCenter = useMemo(() => {
    if (interpolatedPosition) {
      return { lat: interpolatedPosition.lat, lng: interpolatedPosition.lng }
    }
    return ISRAEL_CENTER
  }, [interpolatedPosition])

  // Memoize map options to prevent unnecessary re-renders
  const mapOptions = useMemo<google.maps.MapOptions>(() => ({
    disableDefaultUI: false,
    zoomControl: true,
    zoomControlOptions: {
      position: window.google?.maps.ControlPosition.RIGHT_BOTTOM,
    },
    streetViewControl: false,
    mapTypeControl: false,
    fullscreenControl: false, // We'll use custom fullscreen button
    styles: darkMapStyle,
    center: mapCenter,
    zoom: 17, // Street-level zoom
    gestureHandling: 'greedy', // Enable pinch-to-zoom and scroll
    draggable: true, // Enable dragging/panning
  }), [mapCenter])

  // Handle map click to get address
  const handleMapClick = useCallback(async (e: google.maps.MapMouseEvent) => {
    if (!e.latLng) return
    
    const lat = e.latLng.lat()
    const lng = e.latLng.lng()
    
    setLoadingAddress(true)
    setClickedPosition({ lat, lng, address: null })
    
    try {
      const address = await getAddressFromCoords(lat, lng)
      setClickedPosition({ lat, lng, address })
    } catch (error) {
      console.error('Error getting address:', error)
      setClickedPosition({ lat, lng, address: 'לא ניתן לקבל כתובת' })
    } finally {
      setLoadingAddress(false)
    }
  }, [])

  // Initialize Google Maps services
  useEffect(() => {
    if (isLoaded && typeof window !== 'undefined' && window.google) {
      setAutocompleteService(new window.google.maps.places.AutocompleteService())
      setGeocoderService(new window.google.maps.Geocoder())
    }
  }, [isLoaded])

  // Handle address search autocomplete
  const handleSearchChange = useCallback((value: string) => {
    setSearchQuery(value)
    
    if (!autocompleteService || value.length < 3) {
      setSearchSuggestions([])
      return
    }

    autocompleteService.getPlacePredictions(
      {
        input: value,
        componentRestrictions: { country: 'il' }, // Restrict to Israel
        language: 'iw', // Hebrew
      },
      (predictions, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
          setSearchSuggestions(predictions)
        } else {
          setSearchSuggestions([])
        }
      }
    )
  }, [autocompleteService])

  // Handle address selection from autocomplete
  const handleAddressSelect = useCallback(async (placeId: string, description: string) => {
    if (!geocoderService || !mapRef.current) return

    setSearchQuery(description)
    setSearchSuggestions([])
    setShowSearch(false)

    // Geocode the selected place
    geocoderService.geocode({ placeId }, (results, status) => {
      if (status === 'OK' && results && results[0] && mapRef.current) {
        const location = results[0].geometry.location
        const lat = location.lat()
        const lng = location.lng()

        // Center map on selected location
        mapRef.current.setCenter({ lat, lng })
        mapRef.current.setZoom(17)

        // Mark the location
        setClickedPosition({
          lat,
          lng,
          address: results[0].formatted_address || description
        })

        // Notify parent component
        onAddressSearch?.(description)
      }
    })
  }, [geocoderService, onAddressSearch])

  // Mark current location
  const markCurrentLocation = useCallback(async () => {
    if (!interpolatedPosition || !mapRef.current || markingLocation) return

    setMarkingLocation(true)
    try {
      // Get address for current location
      const address = await getAddressFromCoords(interpolatedPosition.lat, interpolatedPosition.lng)
      
      // Center map on current position
      mapRef.current.setCenter({ lat: interpolatedPosition.lat, lng: interpolatedPosition.lng })
      mapRef.current.setZoom(17)

      // Show marker with address
      setClickedPosition({
        lat: interpolatedPosition.lat,
        lng: interpolatedPosition.lng,
        address: address || 'מיקום נוכחי'
      })

      // Notify parent component
      onLocationMarked?.({
        lat: interpolatedPosition.lat,
        lng: interpolatedPosition.lng,
        address: address || undefined
      })
    } catch (error) {
      console.error('Error marking location:', error)
    } finally {
      setMarkingLocation(false)
    }
  }, [interpolatedPosition, onLocationMarked, markingLocation])

  // Focus on driver's current position
  const focusOnSelf = useCallback(() => {
    if (!mapRef.current || !interpolatedPosition) return
    
    mapRef.current.setCenter({ lat: interpolatedPosition.lat, lng: interpolatedPosition.lng })
    mapRef.current.setZoom(17)
    setClickedPosition(null) // Close any open info window
  }, [interpolatedPosition])

  // Click outside to close search suggestions
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (autocompleteRef.current && !autocompleteRef.current.contains(event.target as Node)) {
        setSearchSuggestions([])
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Toggle map size
  const toggleMapSize = useCallback(() => {
    setMapSize(prev => prev === 'normal' ? 'fullscreen' : 'normal')
  }, [])

  // Update map center when interpolated position changes
  // Uses interpolated position for smooth map following
  useEffect(() => {
    if (!isLoaded || !mapRef.current || !interpolatedPosition) return

    // Check if position changed significantly (>100m)
    if (prevPositionRef.current && !isInitialMountRef.current) {
      const distance = calculateDistance(
        prevPositionRef.current.lat,
        prevPositionRef.current.lng,
        interpolatedPosition.lat,
        interpolatedPosition.lng
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
          interpolatedPosition.lat,
          interpolatedPosition.lng
        )
        
        // Only pan if moved more than 50 meters
        if (distance > 50 || isInitialMountRef.current) {
          mapRef.current.panTo({ lat: interpolatedPosition.lat, lng: interpolatedPosition.lng })
          mapRef.current.setZoom(17) // Ensure street-level zoom
        }
      } else {
        mapRef.current.setCenter({ lat: interpolatedPosition.lat, lng: interpolatedPosition.lng })
        mapRef.current.setZoom(17)
      }
      prevPositionRef.current = { lat: interpolatedPosition.lat, lng: interpolatedPosition.lng }
    }

    // Mark initial mount as complete
    if (isInitialMountRef.current) {
      setTimeout(() => {
        isInitialMountRef.current = false
      }, 1000)
    }
  }, [interpolatedPosition, isLoaded])

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map
    // Set initial position if available (use interpolated position)
    if (interpolatedPosition) {
      map.setCenter({ lat: interpolatedPosition.lat, lng: interpolatedPosition.lng })
      map.setZoom(17)
    }
  }, [interpolatedPosition])

  const onUnmount = useCallback(() => {
    mapRef.current = null
  }, [])

  // Create custom driver marker icon with heading indicator
  // Uses interpolated heading for smooth rotation
  const driverIcon = useMemo<google.maps.Icon | undefined>(() => {
    if (!interpolatedPosition || typeof window === 'undefined' || !window.google) return undefined
    
    // Use interpolated heading for smooth rotation (handles 0-360 wrap-around)
    const headingValue = interpolatedHeading ?? 0 // Default to 0 if heading not available
    
    try {
      return createTaxiIcon('available', window.google, headingValue)
    } catch (error) {
      // Fallback to simple marker if createTaxiIcon fails
      console.warn('[DriverMap] Failed to create taxi icon with heading, using fallback:', error)
      return {
        url: `data:image/svg+xml;base64,${btoa(`
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
            <g transform="rotate(${headingValue}, 16, 16)">
              <circle cx="16" cy="16" r="14" fill="#F7C948" stroke="white" stroke-width="3"/>
              <circle cx="16" cy="16" r="6" fill="#000"/>
              <path d="M16 4 L20 12 L16 10 L12 12 Z" fill="white" />
            </g>
          </svg>
        `)}`,
        scaledSize: new window.google.maps.Size(32, 32),
        anchor: new window.google.maps.Point(16, 16),
      }
    }
  }, [interpolatedPosition, interpolatedHeading])

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
    <div className={`relative ${mapSize === 'fullscreen' ? 'fixed inset-0 z-50' : 'h-full w-full'}`}>
      {/* Address search bar - Position below profile card */}
      <div className="absolute top-20 left-4 right-20 z-[1000] max-w-md pointer-events-auto">
        <div className="relative" ref={autocompleteRef}>
          <div className="relative">
            <Input
              ref={searchInputRef}
              type="text"
              placeholder="חפש כתובת..."
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              onFocus={() => setShowSearch(true)}
              className="bg-white/95 backdrop-blur-sm pr-10 pl-10 border border-gray-200 shadow-lg w-full"
            />
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('')
                  setSearchSuggestions([])
                }}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* Autocomplete suggestions */}
          {showSearch && searchSuggestions.length > 0 && (
            <Card className="absolute top-full left-0 right-0 mt-1 bg-white shadow-xl max-h-60 overflow-y-auto z-20">
              <div className="divide-y">
                {searchSuggestions.map((prediction) => (
                  <button
                    key={prediction.place_id}
                    onClick={() => handleAddressSelect(prediction.place_id, prediction.description)}
                    className="w-full text-right p-3 hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex items-start gap-2">
                      <MapPinIcon className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-gray-900 truncate">
                          {prediction.structured_formatting.main_text}
                        </div>
                        <div className="text-sm text-gray-500 truncate">
                          {prediction.structured_formatting.secondary_text}
                        </div>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Control buttons overlay - Position below profile card */}
      <div className="absolute top-20 right-4 z-[1000] flex flex-col gap-2 pointer-events-auto">
        {/* Mark current location button */}
        {interpolatedPosition && (
          <Button
            variant="outline"
            size="sm"
            onClick={markCurrentLocation}
            disabled={markingLocation}
            className="bg-white/95 backdrop-blur-sm shadow-lg hover:bg-white border border-gray-200"
            title="סמן מיקום נוכחי"
          >
            {markingLocation ? (
              <div className="animate-spin h-4 w-4 border-2 border-gray-400 border-t-transparent rounded-full" />
            ) : (
              <MapPinIcon className="h-4 w-4 text-blue-600" />
            )}
          </Button>
        )}

        {/* Focus on self button */}
        {interpolatedPosition && (
          <Button
            variant="outline"
            size="sm"
            onClick={focusOnSelf}
            className="bg-white/95 backdrop-blur-sm shadow-lg hover:bg-white border border-gray-200"
            title="מרכז עליי"
          >
            <Navigation2 className="h-4 w-4 text-green-600" />
          </Button>
        )}

        {/* Toggle map size button */}
        <Button
          variant="outline"
          size="sm"
          onClick={toggleMapSize}
          className="bg-white/95 backdrop-blur-sm shadow-lg hover:bg-white border border-gray-200"
          title={mapSize === 'normal' ? 'מסך מלא' : 'מסך רגיל'}
        >
          {mapSize === 'normal' ? (
            <Maximize2 className="h-4 w-4 text-gray-700" />
          ) : (
            <Minimize2 className="h-4 w-4 text-gray-700" />
          )}
        </Button>
      </div>

      <GoogleMap
        mapContainerStyle={containerStyle}
        options={mapOptions}
        onLoad={onLoad}
        onUnmount={onUnmount}
        onClick={handleMapClick}
      >
        {/* Driver's current position marker with GPS accuracy circle */}
        {/* Uses interpolated position for smooth movement (60fps) */}
        {interpolatedPosition && driverIcon && (
          <>
            <Marker
              position={{ lat: interpolatedPosition.lat, lng: interpolatedPosition.lng }}
              icon={driverIcon}
              title="המיקום שלך"
              onClick={focusOnSelf}
            />
            {/* GPS Accuracy Circle - Visual indicator of location precision */}
            {/* Uses interpolated position for smooth circle movement */}
            {(() => {
              // Default accuracy: ~10 meters (typical GPS accuracy)
              const accuracyMeters = 10
              const accuracyRadius = accuracyMeters / 111000 // Convert meters to degrees (approximate)
              
              return (
                <Circle
                  center={{ lat: interpolatedPosition.lat, lng: interpolatedPosition.lng }}
                  radius={accuracyMeters}
                  options={{
                    fillColor: '#3B82F6',
                    fillOpacity: 0.15,
                    strokeColor: '#3B82F6',
                    strokeOpacity: 0.5,
                    strokeWeight: 2,
                    clickable: false,
                    zIndex: 1,
                  }}
                />
              )
            })()}
          </>
        )}

        {/* Clicked position marker with address info */}
        {clickedPosition && (
          <>
            <Marker
              position={{ lat: clickedPosition.lat, lng: clickedPosition.lng }}
              icon={{
                url: `data:image/svg+xml;base64,${btoa(`
                  <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 32 32">
                    <circle cx="16" cy="16" r="14" fill="#3B82F6" stroke="white" stroke-width="3"/>
                    <circle cx="16" cy="16" r="6" fill="white"/>
                  </svg>
                `)}`,
                scaledSize: new window.google.maps.Size(32, 32),
                anchor: new window.google.maps.Point(16, 32),
              }}
            />
            <InfoWindow
              position={{ lat: clickedPosition.lat, lng: clickedPosition.lng }}
              onCloseClick={() => setClickedPosition(null)}
            >
              <div className="p-2 min-w-[200px]">
                {loadingAddress ? (
                  <div className="text-sm text-gray-600">טוען כתובת...</div>
                ) : (
                  <>
                    <div className="font-semibold text-gray-900 mb-1">כתובת:</div>
                    <div className="text-sm text-gray-700">
                      {clickedPosition.address || 'לא ניתן לקבל כתובת'}
                    </div>
                    <div className="text-xs text-gray-500 mt-2">
                      {clickedPosition.lat.toFixed(6)}, {clickedPosition.lng.toFixed(6)}
                    </div>
                  </>
                )}
              </div>
            </InfoWindow>
          </>
        )}
      </GoogleMap>

      {/* Instructions overlay */}
      {mapSize === 'normal' && (
        <div className="absolute bottom-4 left-4 right-4 z-10 flex gap-2">
          <Card className="bg-white/90 backdrop-blur-sm p-2 shadow-lg">
            <div className="text-xs text-gray-600 flex items-center gap-2">
              <MapPin className="h-3 w-3" />
              <span>לחץ על המפה כדי לראות כתובת</span>
            </div>
          </Card>
          {clickedPosition && (
            <Card className="bg-blue-50 border-blue-200 p-2 shadow-lg">
              <div className="text-xs text-blue-700">
                {clickedPosition.address || 'מיקום מסומן'}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  )
}
