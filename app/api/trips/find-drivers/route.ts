import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-server'
import type { FindNearestDriversResponse } from '@/lib/supabase'

/**
 * POST /api/trips/find-drivers
 * 
 * REST-friendly endpoint for n8n/Automation to find nearest available drivers
 * 
 * Authentication: Service Role Key (via Authorization header)
 * 
 * Request Body:
 * {
 *   "pickup_lat": 32.9,
 *   "pickup_lng": 35.1,
 *   "zone_id": "optional-zone-uuid",
 *   "station_id": "optional-station-uuid" // If not provided, auto-detected
 * }
 * 
 * Response (n8n-friendly JSON):
 * {
 *   "success": true,
 *   "station_id": "detected-or-provided-station-id",
 *   "pickup_location": {
 *     "latitude": 32.9,
 *     "longitude": 35.1
 *   },
 *   "drivers": [
 *     {
 *       "id": "driver-uuid",
 *       "full_name": "Driver Name",
 *       "phone": "+972501234567",
 *       "latitude": 32.91,
 *       "longitude": 35.11,
 *       "distance_meters": 1234.56,
 *       "distance_km": 1.23,
 *       "station_id": "station-uuid",
 *       "vehicle_number": "123-45-678",
 *       "car_type": "Sedan"
 *     }
 *   ],
 *   "driver_count": 1
 * }
 */
export async function POST(request: NextRequest) {
  try {
    // Authenticate using service role (for n8n/webhook access)
    const authHeader = request.headers.get('authorization')
    const expectedKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!authHeader || !expectedKey) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Missing or invalid authorization. Provide Authorization: Bearer <service_role_key>' 
        },
        { status: 401 }
      )
    }

    // Verify service role key
    const token = authHeader.replace('Bearer ', '').trim()
    if (token !== expectedKey) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Invalid authorization token' 
        },
        { status: 401 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { pickup_lat, pickup_lng, zone_id, station_id } = body

    // Validate required fields
    if (!pickup_lat || !pickup_lng) {
      return NextResponse.json(
        { 
          success: false,
          error: 'pickup_lat and pickup_lng are required' 
        },
        { status: 400 }
      )
    }

    // Validate coordinate ranges
    if (
      typeof pickup_lat !== 'number' ||
      typeof pickup_lng !== 'number' ||
      pickup_lat < -90 ||
      pickup_lat > 90 ||
      pickup_lng < -180 ||
      pickup_lng > 180
    ) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Invalid coordinates. Latitude must be -90 to 90, Longitude must be -180 to 180' 
        },
        { status: 400 }
      )
    }

    // Create Supabase admin client (bypasses RLS for service role)
    const supabase = createSupabaseAdminClient()

    // Call the enhanced PostGIS function with auto station detection
    const rpcResponse = await supabase.rpc('find_nearest_drivers_auto' as any, {
      pickup_lat,
      pickup_lng,
      zone_id_filter: zone_id || null,
      station_id_override: station_id || null,
    } as any)
    
    const data = rpcResponse.data
    const error = rpcResponse.error

    if (error) {
      console.error('[Find Drivers API] Error:', error)
      return NextResponse.json(
        { 
          success: false,
          error: 'Failed to find drivers',
          details: error.message 
        },
        { status: 500 }
      )
    }

    // Return clean JSON format for n8n
    return NextResponse.json((data as FindNearestDriversResponse | null) || {
      success: false,
      error: 'No data returned from database function'
    })

  } catch (error: any) {
    console.error('[Find Drivers API] Unexpected error:', error)

    // Handle JSON parse errors
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Invalid JSON payload' 
        },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { 
        success: false,
        error: 'Internal server error',
        details: error.message 
      },
      { status: 500 }
    )
  }
}

/**
 * GET /api/trips/find-drivers
 * 
 * Same functionality as POST, but using query parameters
 * Useful for simple n8n HTTP Request nodes
 */
export async function GET(request: NextRequest) {
  try {
    // Authenticate using service role
    const authHeader = request.headers.get('authorization')
    const expectedKey = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!authHeader || !expectedKey) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Missing or invalid authorization. Provide Authorization: Bearer <service_role_key>' 
        },
        { status: 401 }
      )
    }

    const token = authHeader.replace('Bearer ', '').trim()
    if (token !== expectedKey) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Invalid authorization token' 
        },
        { status: 401 }
      )
    }

    // Parse query parameters
    const { searchParams } = new URL(request.url)
    const pickup_lat = parseFloat(searchParams.get('pickup_lat') || '')
    const pickup_lng = parseFloat(searchParams.get('pickup_lng') || '')
    const zone_id = searchParams.get('zone_id') || null
    const station_id = searchParams.get('station_id') || null

    // Validate required fields
    if (!pickup_lat || !pickup_lng || isNaN(pickup_lat) || isNaN(pickup_lng)) {
      return NextResponse.json(
        { 
          success: false,
          error: 'pickup_lat and pickup_lng query parameters are required' 
        },
        { status: 400 }
      )
    }

    // Validate coordinate ranges
    if (
      pickup_lat < -90 ||
      pickup_lat > 90 ||
      pickup_lng < -180 ||
      pickup_lng > 180
    ) {
      return NextResponse.json(
        { 
          success: false,
          error: 'Invalid coordinates' 
        },
        { status: 400 }
      )
    }

    // Create Supabase admin client
    const supabase = createSupabaseAdminClient()

    // Call the enhanced PostGIS function
    const rpcResponse2 = await supabase.rpc('find_nearest_drivers_auto' as any, {
      pickup_lat,
      pickup_lng,
      zone_id_filter: zone_id || null,
      station_id_override: station_id || null,
    } as any)
    
    const data = rpcResponse2.data
    const error = rpcResponse2.error

    if (error) {
      console.error('[Find Drivers API] Error:', error)
      return NextResponse.json(
        { 
          success: false,
          error: 'Failed to find drivers',
          details: error.message 
        },
        { status: 500 }
      )
    }

    return NextResponse.json((data as FindNearestDriversResponse | null) || {
      success: false,
      error: 'No data returned from database function'
    })

  } catch (error: any) {
    console.error('[Find Drivers API] Unexpected error:', error)
    return NextResponse.json(
      { 
        success: false,
        error: 'Internal server error',
        details: error.message 
      },
      { status: 500 }
    )
  }
}
