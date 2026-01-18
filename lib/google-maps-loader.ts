'use client'

// Google Maps configuration constants
// IMPORTANT: All components must use the EXACT same configuration
// to avoid "Loader must not be called again with different options" error
export const GOOGLE_MAPS_CONFIG = {
  apiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || '',
  language: 'iw', // Hebrew
  region: 'IL', // Israel
  libraries: ['places', 'geometry', 'drawing', 'marker'] as any[], // Added 'marker' for AdvancedMarkerElement
}

// Standard loader options for useJsApiLoader
export const GOOGLE_MAPS_LOADER_OPTIONS = {
  googleMapsApiKey: GOOGLE_MAPS_CONFIG.apiKey,
  language: GOOGLE_MAPS_CONFIG.language,
  region: GOOGLE_MAPS_CONFIG.region,
  libraries: GOOGLE_MAPS_CONFIG.libraries,
}

// Acre, Israel Center - Optimized for taxi operations
export const ACRE_CENTER = { lat: 32.9270, lng: 35.0830 }

// Center of Israel (fallback)
export const ISRAEL_CENTER = { lat: 31.0461, lng: 34.8516 }

// Silver Map Style - High contrast, clean streets for Acre
export const silverMapStyle: google.maps.MapTypeStyle[] = [
  {
    elementType: 'geometry',
    stylers: [{ color: '#f5f5f5' }]
  },
  {
    elementType: 'labels.icon',
    stylers: [{ visibility: 'off' }]
  },
  {
    elementType: 'labels.text.fill',
    stylers: [{ color: '#616161' }]
  },
  {
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#f5f5f5' }]
  },
  {
    featureType: 'administrative.land_parcel',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#bdbdbd' }]
  },
  {
    featureType: 'poi',
    elementType: 'geometry',
    stylers: [{ color: '#eeeeee' }]
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#757575' }]
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#e5e5e5' }]
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9e9e9e' }]
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#ffffff' }]
  },
  {
    featureType: 'road.arterial',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#757575' }]
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#dadada' }]
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#616161' }]
  },
  {
    featureType: 'road.local',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9e9e9e' }]
  },
  {
    featureType: 'transit.line',
    elementType: 'geometry',
    stylers: [{ color: '#e5e5e5' }]
  },
  {
    featureType: 'transit.station',
    elementType: 'geometry',
    stylers: [{ color: '#eeeeee' }]
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#c9c9c9' }]
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9e9e9e' }]
  }
]

// Dark/Night mode map style (existing, kept for backwards compatibility)
export const darkMapStyle = [
  { elementType: 'geometry', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.stroke', stylers: [{ color: '#242f3e' }] },
  { elementType: 'labels.text.fill', stylers: [{ color: '#746855' }] },
  {
    featureType: 'administrative.locality',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#d59563' }],
  },
  {
    featureType: 'poi',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#d59563' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'geometry',
    stylers: [{ color: '#263c3f' }],
  },
  {
    featureType: 'poi.park',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#6b9a76' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry',
    stylers: [{ color: '#38414e' }],
  },
  {
    featureType: 'road',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#212a37' }],
  },
  {
    featureType: 'road',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#9ca5b3' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry',
    stylers: [{ color: '#746855' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'geometry.stroke',
    stylers: [{ color: '#1f2835' }],
  },
  {
    featureType: 'road.highway',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#f3d19c' }],
  },
  {
    featureType: 'transit',
    elementType: 'geometry',
    stylers: [{ color: '#2f3948' }],
  },
  {
    featureType: 'transit.station',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#d59563' }],
  },
  {
    featureType: 'water',
    elementType: 'geometry',
    stylers: [{ color: '#17263c' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.fill',
    stylers: [{ color: '#515c6d' }],
  },
  {
    featureType: 'water',
    elementType: 'labels.text.stroke',
    stylers: [{ color: '#17263c' }],
  },
] as google.maps.MapTypeStyle[]

// Calculate distance between two coordinates (Haversine formula)
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371e3 // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lng2 - lng1) * Math.PI) / 180

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c
}

// Create custom taxi marker SVG with color coding and rotation
export function createTaxiMarkerSVG(status: 'available' | 'on-trip' | 'offline', heading: number = 0): string {
  const colors = {
    available: '#10B981', // Green
    'on-trip': '#EF4444',  // Red
    offline: '#6B7280'      // Gray
  }
  
  const color = colors[status]
  
  return `
    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
      <defs>
        <filter id="shadow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceAlpha" stdDeviation="2"/>
          <feOffset dx="0" dy="2" result="offsetblur"/>
          <feComponentTransfer>
            <feFuncA type="linear" slope="0.3"/>
          </feComponentTransfer>
          <feMerge>
            <feMergeNode/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <g filter="url(#shadow)" transform="rotate(${heading}, 24, 24)">
        <!-- Main taxi body -->
        <circle cx="24" cy="24" r="18" fill="${color}" stroke="white" stroke-width="3"/>
        <!-- Direction arrow indicator -->
        <path d="M24 8 L30 20 L24 17 L18 20 Z" fill="white" />
        <!-- Taxi emoji (smaller and centered) -->
        <text x="24" y="34" font-size="14" text-anchor="middle" fill="white">🚕</text>
        <!-- Status indicator dot (un-rotated to stay in position) -->
        <g transform="rotate(${-heading}, 24, 24)">
          <circle cx="36" cy="12" r="6" fill="white" stroke="${color}" stroke-width="2"/>
          <circle cx="36" cy="12" r="4" fill="${color}"/>
        </g>
      </g>
    </svg>
  `
}

// Helper to create Google Maps Icon from SVG
export function createTaxiIcon(
  status: 'available' | 'on-trip' | 'offline',
  google: typeof window.google,
  heading: number = 0
): google.maps.Icon {
  const svg = createTaxiMarkerSVG(status, heading)
  return {
    url: `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`,
    scaledSize: new google.maps.Size(48, 48),
    anchor: new google.maps.Point(24, 24),
  }
}

// Point-in-Polygon detection
export function isPointInPolygon(
  point: { lat: number; lng: number },
  polygon: google.maps.Polygon | null
): boolean {
  if (!polygon || typeof window === 'undefined' || !window.google) return false
  
  try {
    return google.maps.geometry.poly.containsLocation(
      new google.maps.LatLng(point.lat, point.lng),
      polygon
    )
  } catch (error) {
    console.error('Error checking point in polygon:', error)
    return false
  }
}

// Check which zone a point is in (GeoJSON format)
export function findZoneForPoint(
  point: { lat: number; lng: number },
  zones: Array<{ id: string; polygon_coordinates: any }>
): string | null {
  if (typeof window === 'undefined' || !window.google) return null
  
  for (const zone of zones) {
    try {
      if (!zone.polygon_coordinates?.coordinates?.[0]) continue
      
      const coords = zone.polygon_coordinates.coordinates[0].map((coord: number[]) => {
        const [first, second] = coord
        // Handle both [lng, lat] and [lat, lng] formats
        const lat = Math.abs(first) > 90 ? second : first
        const lng = Math.abs(first) > 90 ? first : second
        return new google.maps.LatLng(lat, lng)
      })
      
      const polygon = new google.maps.Polygon({ paths: coords })
      
      if (google.maps.geometry.poly.containsLocation(
        new google.maps.LatLng(point.lat, point.lng),
        polygon
      )) {
        return zone.id
      }
    } catch (error) {
      console.error('Error checking zone:', error)
    }
  }
  
  return null
}

// Reverse Geocoding utility
export async function getAddressFromCoords(lat: number, lng: number): Promise<string | null> {
  if (typeof window === 'undefined' || !window.google?.maps) return null

  const geocoder = new google.maps.Geocoder()
  try {
    const response = await geocoder.geocode({ location: { lat, lng } })
    if (response.results && response.results[0]) {
      return response.results[0].formatted_address
    }
    return null
  } catch (error) {
    console.error('Geocoding error:', error)
    return null
  }
}
