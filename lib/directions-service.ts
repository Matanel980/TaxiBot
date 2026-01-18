/**
 * Directions Service - Uses Google Maps Directions API
 * Returns actual street-level routes (not straight lines)
 */

interface DirectionsResult {
  path: Array<{ lat: number; lng: number }>
  distance: number // meters
  duration: number // seconds
  error?: string
  status?: string // Google Maps status code
}

export async function getDirectionsRoute(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  google: typeof window.google
): Promise<DirectionsResult> {
  return new Promise((resolve) => {
    if (!google || !google.maps || !google.maps.DirectionsService || !google.maps.DirectionsStatus) {
      resolve({
        path: [],
        distance: 0,
        duration: 0,
        error: 'Google Maps API not available',
        status: 'API_NOT_AVAILABLE',
      })
      return
    }

    const directionsService = new google.maps.DirectionsService()

    directionsService.route(
      {
        origin: new google.maps.LatLng(origin.lat, origin.lng),
        destination: new google.maps.LatLng(destination.lat, destination.lng),
        travelMode: google.maps.TravelMode.DRIVING,
      },
      (result, status) => {
        // DETAILED STATUS HANDLING
        if (status !== google.maps.DirectionsStatus.OK) {
          let errorMessage = `Directions API failed with status: ${status}`
          
          // Map status codes to user-friendly messages
          switch (status) {
            case google.maps.DirectionsStatus.REQUEST_DENIED:
              errorMessage = 'REQUEST_DENIED: The API key is missing or invalid, or billing is not enabled, or the Directions API is not enabled in Google Cloud Console.'
              break
            case google.maps.DirectionsStatus.OVER_QUERY_LIMIT:
              errorMessage = 'OVER_QUERY_LIMIT: You have exceeded your quota. Check your Google Cloud Console quotas.'
              break
            case google.maps.DirectionsStatus.ZERO_RESULTS:
              errorMessage = 'ZERO_RESULTS: No route could be found between the origin and destination.'
              break
            case google.maps.DirectionsStatus.MAX_WAYPOINTS_EXCEEDED:
              errorMessage = 'MAX_WAYPOINTS_EXCEEDED: Too many waypoints in the request.'
              break
            case google.maps.DirectionsStatus.INVALID_REQUEST:
              errorMessage = 'INVALID_REQUEST: The request was malformed.'
              break
            case google.maps.DirectionsStatus.NOT_FOUND:
              errorMessage = 'NOT_FOUND: Origin or destination could not be geocoded.'
              break
            default:
              errorMessage = `Directions API failed with status: ${status}`
          }
          
          console.error('[Directions Service] Status code:', status)
          console.error('[Directions Service] Error message:', errorMessage)
          
          resolve({
            path: [],
            distance: 0,
            duration: 0,
            error: errorMessage,
            status: status,
          })
          return
        }

        if (!result || !result.routes || result.routes.length === 0) {
          resolve({
            path: [],
            distance: 0,
            duration: 0,
            error: 'Directions API returned no routes',
            status: 'NO_ROUTES',
          })
          return
        }

        const route = result.routes[0]
        const leg = route.legs[0]
        
        // Extract path from route steps (most reliable method)
        const path: Array<{ lat: number; lng: number }> = []
        
        if (route.overview_polyline && route.overview_polyline.points) {
          // Use overview polyline (decoded)
          const decodedPath = google.maps.geometry?.encoding?.decodePath(route.overview_polyline.points)
          if (decodedPath && decodedPath.length > 0) {
            decodedPath.forEach(point => {
              path.push({ lat: point.lat(), lng: point.lng() })
            })
          }
        }
        
        // Fallback: Use step points if overview polyline decoding fails
        if (path.length === 0 && leg.steps) {
          leg.steps.forEach(step => {
            if (step.path) {
              step.path.forEach(point => {
                path.push({ lat: point.lat(), lng: point.lng() })
              })
            }
          })
        }

        // Calculate total distance and duration
        const distance = leg.distance?.value || 0 // meters
        const duration = leg.duration?.value || 0 // seconds

        resolve({
          path,
          distance,
          duration,
        })
      }
    )
  })
}

/**
 * Calculate straight-line distance (fallback, not used for routes)
 */
export function calculateStraightDistance(
  point1: { lat: number; lng: number },
  point2: { lat: number; lng: number }
): number {
  const R = 6371e3 // Earth's radius in meters
  const φ1 = point1.lat * Math.PI / 180
  const φ2 = point2.lat * Math.PI / 180
  const Δφ = (point2.lat - point1.lat) * Math.PI / 180
  const Δλ = (point2.lng - point1.lng) * Math.PI / 180

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))

  return R * c // Distance in meters
}
