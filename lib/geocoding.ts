/**
 * Geocoding Utility
 * Convert addresses to coordinates using Google Geocoding API
 */

const GEOCODING_API_URL = 'https://maps.googleapis.com/maps/api/geocode/json'

export interface GeocodeResult {
  lat: number
  lng: number
  formatted_address: string
  place_id?: string
}

export interface GeocodeError {
  error: string
  details?: any
}

/**
 * Geocode an address to coordinates
 */
export async function geocodeAddress(
  address: string
): Promise<GeocodeResult | GeocodeError> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  if (!apiKey) {
    return {
      error: 'Google Maps API key is not configured',
    }
  }

  try {
    const url = new URL(GEOCODING_API_URL)
    url.searchParams.set('address', address)
    url.searchParams.set('key', apiKey)
    url.searchParams.set('language', 'he') // Hebrew language
    url.searchParams.set('region', 'il') // Israel region

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      return {
        error: `Geocoding API error: ${response.statusText}`,
        details: { status: response.status },
      }
    }

    const data = await response.json()

    if (data.status === 'ZERO_RESULTS') {
      return {
        error: 'Address not found',
        details: { address },
      }
    }

    if (data.status !== 'OK') {
      return {
        error: `Geocoding failed: ${data.status}`,
        details: data,
      }
    }

    const result = data.results[0]
    const location = result.geometry.location

    return {
      lat: location.lat,
      lng: location.lng,
      formatted_address: result.formatted_address,
      place_id: result.place_id,
    }
  } catch (error: any) {
    console.error('[Geocoding] Error:', error)
    return {
      error: 'Geocoding request failed',
      details: error.message,
    }
  }
}

/**
 * Reverse geocode coordinates to address
 */
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<string | GeocodeError> {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY

  if (!apiKey) {
    return {
      error: 'Google Maps API key is not configured',
    }
  }

  try {
    const url = new URL(GEOCODING_API_URL)
    url.searchParams.set('latlng', `${lat},${lng}`)
    url.searchParams.set('key', apiKey)
    url.searchParams.set('language', 'he')
    url.searchParams.set('region', 'il')

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    })

    if (!response.ok) {
      return {
        error: `Reverse geocoding API error: ${response.statusText}`,
        details: { status: response.status },
      }
    }

    const data = await response.json()

    if (data.status !== 'OK' || !data.results || data.results.length === 0) {
      return {
        error: 'Reverse geocoding failed',
        details: data,
      }
    }

    return data.results[0].formatted_address
  } catch (error: any) {
    console.error('[Reverse Geocoding] Error:', error)
    return {
      error: 'Reverse geocoding request failed',
      details: error.message,
    }
  }
}





