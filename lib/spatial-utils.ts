'use client'

/**
 * Spatial Utilities for Zone Management
 * Handles conversion between Google Maps, WKT, and GeoJSON formats
 */

// Convert Google Maps LatLng array to WKT (Well-Known Text)
export function googlePathsToWKT(paths: google.maps.LatLng[]): string {
  if (!paths || paths.length < 3) {
    throw new Error('Polygon must have at least 3 points')
  }

  const coords = paths.map(p => `${p.lng()} ${p.lat()}`).join(', ')
  
  // Check if polygon needs closing
  const firstPoint = paths[0]
  const lastPoint = paths[paths.length - 1]
  const needsClosing = 
    Math.abs(firstPoint.lat() - lastPoint.lat()) > 0.0001 || 
    Math.abs(firstPoint.lng() - lastPoint.lng()) > 0.0001
  
  const closedCoords = needsClosing 
    ? coords + `, ${firstPoint.lng()} ${firstPoint.lat()}` 
    : coords
    
  return `POLYGON((${closedCoords}))`
}

// Convert WKT to GeoJSON for n8n/API consumers
export function wktToGeoJSON(wkt: string): GeoJSON.Polygon {
  // Parse WKT POLYGON((lng lat, lng lat, ...))
  const coordString = wkt.match(/POLYGON\(\((.*?)\)\)/)?.[1]
  if (!coordString) {
    throw new Error('Invalid WKT format')
  }
  
  const coordinates = coordString.split(',').map(pair => {
    const [lng, lat] = pair.trim().split(/\s+/).map(Number)
    if (isNaN(lng) || isNaN(lat)) {
      throw new Error('Invalid coordinate in WKT')
    }
    return [lng, lat]
  })
  
  return {
    type: 'Polygon',
    coordinates: [coordinates]
  }
}

// Convert PostGIS geometry (GeoJSON) to Google Maps paths
export function geometryToGooglePaths(geometry: any): google.maps.LatLngLiteral[] {
  if (!geometry || geometry.type !== 'Polygon') {
    throw new Error('Unsupported geometry type')
  }
  
  if (!geometry.coordinates || !geometry.coordinates[0]) {
    throw new Error('Invalid geometry coordinates')
  }
  
  return geometry.coordinates[0].map(([lng, lat]: number[]) => ({
    lat,
    lng
  }))
}

// Calculate polygon area using spherical Earth approximation
export function calculatePolygonArea(paths: google.maps.LatLng[]): number {
  if (!paths || paths.length < 3) return 0
  
  // Use Google Maps geometry library if available
  if (typeof window !== 'undefined' && window.google?.maps?.geometry) {
    return google.maps.geometry.spherical.computeArea(paths)
  }
  
  // Fallback: Spherical excess algorithm
  const EARTH_RADIUS = 6371000 // meters
  
  const toRadians = (deg: number) => (deg * Math.PI) / 180
  
  let area = 0
  const n = paths.length
  
  for (let i = 0; i < n; i++) {
    const p1 = paths[i]
    const p2 = paths[(i + 1) % n]
    
    const lat1 = toRadians(p1.lat())
    const lat2 = toRadians(p2.lat())
    const lng1 = toRadians(p1.lng())
    const lng2 = toRadians(p2.lng())
    
    area += (lng2 - lng1) * (2 + Math.sin(lat1) + Math.sin(lat2))
  }
  
  area = Math.abs(area * EARTH_RADIUS * EARTH_RADIUS / 2)
  
  return area
}

// Calculate center point (centroid) of polygon
export function calculateCentroid(paths: google.maps.LatLng[]): { lat: number; lng: number } {
  if (!paths || paths.length === 0) {
    throw new Error('Cannot calculate centroid of empty polygon')
  }
  
  // Simple arithmetic mean (works well for small areas)
  const sum = paths.reduce((acc, p) => ({
    lat: acc.lat + p.lat(),
    lng: acc.lng + p.lng()
  }), { lat: 0, lng: 0 })
  
  return {
    lat: sum.lat / paths.length,
    lng: sum.lng / paths.length
  }
}

// Format area for display (converts to appropriate unit)
export function formatArea(areaSqm: number): string {
  if (areaSqm < 1000) {
    return `${Math.round(areaSqm)} מ"ר`
  } else if (areaSqm < 1000000) {
    return `${(areaSqm / 1000).toFixed(2)} דונם`
  } else {
    return `${(areaSqm / 1000000).toFixed(2)} קמ"ר`
  }
}

// Validate polygon (must be closed and have at least 3 points)
export function validatePolygon(paths: google.maps.LatLng[]): { valid: boolean; error?: string } {
  if (!paths || paths.length < 3) {
    return { valid: false, error: 'Polygon must have at least 3 points' }
  }
  
  // Check for self-intersection (basic check)
  for (let i = 0; i < paths.length; i++) {
    const p1 = paths[i]
    const p2 = paths[(i + 1) % paths.length]
    
    for (let j = i + 2; j < paths.length - 1; j++) {
      const p3 = paths[j]
      const p4 = paths[(j + 1) % paths.length]
      
      // Skip adjacent segments
      if (Math.abs(i - j) <= 1 || (i === 0 && j === paths.length - 2)) {
        continue
      }
      
      // Check if segments intersect
      if (doSegmentsIntersect(p1, p2, p3, p4)) {
        return { valid: false, error: 'Polygon edges cannot intersect' }
      }
    }
  }
  
  return { valid: true }
}

// Helper: Check if two line segments intersect
function doSegmentsIntersect(
  p1: google.maps.LatLng,
  p2: google.maps.LatLng,
  p3: google.maps.LatLng,
  p4: google.maps.LatLng
): boolean {
  const ccw = (A: google.maps.LatLng, B: google.maps.LatLng, C: google.maps.LatLng) => {
    return (C.lat() - A.lat()) * (B.lng() - A.lng()) > (B.lat() - A.lat()) * (C.lng() - A.lng())
  }
  
  return ccw(p1, p3, p4) !== ccw(p2, p3, p4) && ccw(p1, p2, p3) !== ccw(p1, p2, p4)
}

// Convert GeoJSON Feature to zone data
export function featureToZone(feature: any) {
  return {
    id: feature.id,
    name: feature.properties.name,
    color: feature.properties.color,
    area_sqm: feature.properties.area_sqm,
    center_lat: feature.properties.center_lat,
    center_lng: feature.properties.center_lng,
    geometry: feature.geometry,
    created_at: feature.properties.created_at
  }
}

// Convert zone to GeoJSON Feature
export function zoneToFeature(zone: any): GeoJSON.Feature {
  return {
    type: 'Feature',
    id: zone.id,
    geometry: zone.geometry,
    properties: {
      name: zone.name,
      color: zone.color,
      area_sqm: zone.area_sqm,
      center_lat: zone.center_lat,
      center_lng: zone.center_lng,
      created_at: zone.created_at
    }
  }
}

