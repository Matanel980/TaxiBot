// Supabase Edge Function: Auto-Assign Trip
// Finds the nearest online driver in the same zone and assigns the trip

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TripRecord {
  id: string
  pickup_lat: number
  pickup_lng: number
  zone_id: string | null
  station_id: string | null // CRITICAL: For multi-tenant isolation
  status: string
  driver_id: string | null
}

serve(async (req) => {
  // 🔵 LOG: Function started
  console.log('[auto-assign-trip] 🔵 ============================================')
  console.log('[auto-assign-trip] 🔵 Function invoked at:', new Date().toISOString())
  console.log('[auto-assign-trip] 🔵 Method:', req.method)
  console.log('[auto-assign-trip] 🔵 URL:', req.url)

  // Log all headers (redact sensitive data)
  const headers: Record<string, string> = {}
  req.headers.forEach((value, key) => {
    if (key.toLowerCase().includes('authorization')) {
      headers[key] = value.substring(0, 20) + '...' // Redact token
    } else {
      headers[key] = value
    }
  })
  console.log('[auto-assign-trip] 🔵 Headers:', JSON.stringify(headers, null, 2))

  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    console.log('[auto-assign-trip] ✅ CORS preflight request - returning OK')
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 🔵 LOG: Environment check
    const supabaseUrl = Deno.env.get('SUPABASE_URL')
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    
    console.log('[auto-assign-trip] 🔵 Environment check:', {
      hasSupabaseUrl: !!supabaseUrl,
      hasServiceKey: !!supabaseServiceKey,
      supabaseUrl: supabaseUrl ? supabaseUrl.substring(0, 30) + '...' : 'MISSING'
    })

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[auto-assign-trip] ❌ Missing environment variables')
      return new Response(
        JSON.stringify({ error: 'Missing environment variables' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey)
    console.log('[auto-assign-trip] ✅ Supabase client created')

    // 🔵 LOG: Parse request body
    let requestBody: any
    try {
      const bodyText = await req.text()
      console.log('[auto-assign-trip] 🔵 Raw request body:', bodyText.substring(0, 500))
      requestBody = JSON.parse(bodyText)
      console.log('[auto-assign-trip] 🔵 Parsed request body:', JSON.stringify(requestBody, null, 2))
    } catch (parseError) {
      console.error('[auto-assign-trip] ❌ Failed to parse request body:', parseError)
      return new Response(
        JSON.stringify({ error: 'Invalid JSON in request body', details: String(parseError) }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Handle Database Webhook format: { record: { id: "...", ... }, old_record: null }
    // OR direct format: { trip_id: "..." }
    let trip_id: string | undefined
    
    if (requestBody.record && requestBody.record.id) {
      // Database Webhook format (INSERT event)
      trip_id = requestBody.record.id
      console.log('[auto-assign-trip] 🔵 Using Database Webhook format - trip_id from record:', trip_id)
      console.log('[auto-assign-trip] 🔵 Full record data:', JSON.stringify(requestBody.record, null, 2))
    } else if (requestBody.trip_id) {
      // Direct format (manual invocation)
      trip_id = requestBody.trip_id
      console.log('[auto-assign-trip] 🔵 Using direct format - trip_id:', trip_id)
    } else {
      console.error('[auto-assign-trip] ❌ Missing trip_id in request body')
      console.error('[auto-assign-trip] ❌ Request body keys:', Object.keys(requestBody))
      return new Response(
        JSON.stringify({ 
          error: 'trip_id is required', 
          received: Object.keys(requestBody),
          hint: 'Expected { trip_id: "..." } or { record: { id: "..." } }'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[auto-assign-trip] 🔵 Trip ID to process:', trip_id)

    // Fetch trip details with station_id (CRITICAL for multi-tenant isolation)
    console.log('[auto-assign-trip] 🔵 Fetching trip from database:', trip_id)
    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .select('id, pickup_lat, pickup_lng, zone_id, station_id, status, driver_id')
      .eq('id', trip_id)
      .single()

    if (tripError) {
      console.error('[auto-assign-trip] ❌ Trip fetch error:', tripError)
      console.error('[auto-assign-trip] ❌ Error details:', JSON.stringify(tripError, null, 2))
      return new Response(
        JSON.stringify({ error: 'Trip not found', details: tripError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!trip) {
      console.error('[auto-assign-trip] ❌ Trip not found (no data returned)')
      return new Response(
        JSON.stringify({ error: 'Trip not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[auto-assign-trip] ✅ Trip fetched:', JSON.stringify(trip, null, 2))

    const tripData = trip as TripRecord

    // CRITICAL: Validate trip has station_id (required for multi-tenant isolation)
    if (!tripData.station_id) {
      console.error('[auto-assign-trip] ❌ Trip missing station_id - cannot assign driver')
      return new Response(
        JSON.stringify({ error: 'Trip missing station_id. Cannot assign driver without station assignment.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Skip if trip already has a driver or is not pending
    if (tripData.driver_id || tripData.status !== 'pending') {
      return new Response(
        JSON.stringify({ message: 'Trip already assigned or not pending', trip: tripData }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Skip if trip doesn't have coordinates
    if (!tripData.pickup_lat || !tripData.pickup_lng) {
      console.error('[auto-assign-trip] Trip missing coordinates')
      return new Response(
        JSON.stringify({ error: 'Trip missing pickup coordinates' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Find nearest online driver using database function or fallback
    let drivers: any[] | null = null
    let driversError: any = null

    // CRITICAL: All driver queries must filter by trip's station_id for multi-tenant isolation
    const tripStationId = tripData.station_id
    console.log('[auto-assign-trip] 🔵 Filtering drivers by station_id:', tripStationId)

    // Try using PostGIS database function first (if available)
    // NOTE: Database function should also filter by station_id
    try {
      const { data: dbDrivers, error: dbError } = await supabase.rpc('find_nearest_driver', {
        pickup_lat: tripData.pickup_lat,
        pickup_lng: tripData.pickup_lng,
        zone_id_filter: tripData.zone_id || null,
        station_id_filter: tripStationId, // CRITICAL: Pass station_id to function
      })

      if (!dbError && dbDrivers && dbDrivers.length > 0) {
        // Additional client-side filter by station_id (defense-in-depth)
        const filteredDrivers = dbDrivers.filter((d: any) => d.station_id === tripStationId)
        if (filteredDrivers.length > 0) {
          drivers = filteredDrivers
        } else {
          driversError = { message: 'No drivers found in station' }
        }
      } else {
        driversError = dbError
      }
    } catch (error) {
      // Database function not available, use fallback
      driversError = error
    }

    // Fallback: Use regular query with Haversine distance calculation
    // CRITICAL: Filter by station_id for multi-tenant isolation
    if (!drivers) {
      let driverQuery = supabase
        .from('profiles')
        .select('id, full_name, latitude, longitude, current_zone, station_id')
        .eq('role', 'driver')
        .eq('is_online', true)
        .eq('is_approved', true)
        .eq('station_id', tripStationId) // CRITICAL: STATION FILTER
        .not('latitude', 'is', null)
        .not('longitude', 'is', null)

      if (tripData.zone_id) {
        driverQuery = driverQuery.eq('current_zone', tripData.zone_id)
      }

      // Exclude drivers who already have pending/active trips
      // CRITICAL: Filter active trips by station_id as well
      const { data: activeTrips } = await supabase
        .from('trips')
        .select('driver_id')
        .eq('station_id', tripStationId) // CRITICAL: STATION FILTER
        .in('status', ['pending', 'active'])
        .not('driver_id', 'is', null)

      const busyDriverIds = (activeTrips || []).map((t: any) => t.driver_id)
      if (busyDriverIds.length > 0) {
        // Filter out busy drivers in memory (Supabase doesn't support NOT IN with array)
        // We'll filter after fetching
      }

      const { data: allDrivers, error: queryError } = await driverQuery

      if (queryError) {
        driversError = queryError
      } else if (allDrivers && allDrivers.length > 0) {
        // Filter out busy drivers
        const availableDrivers = busyDriverIds.length > 0
          ? allDrivers.filter((d: any) => !busyDriverIds.includes(d.id))
          : allDrivers

        if (availableDrivers.length > 0) {
          // Calculate distance in memory (Haversine formula) and sort
          const driversWithDistance = availableDrivers
            .map((driver: any) => {
              const distance = calculateDistance(
                tripData.pickup_lat,
                tripData.pickup_lng,
                driver.latitude!,
                driver.longitude!
              )
              return { ...driver, distance_meters: distance }
            })
            .sort((a: any, b: any) => a.distance_meters - b.distance_meters)

          drivers = [driversWithDistance[0]] // Get nearest driver
        }
      }
    }

    if (driversError && !drivers) {
      console.error('[auto-assign-trip] Driver query error:', driversError)
      return new Response(
        JSON.stringify({ error: 'Failed to find drivers', details: driversError?.message || String(driversError) }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!drivers || drivers.length === 0) {
      console.log('[auto-assign-trip] No available drivers found')
      return new Response(
        JSON.stringify({ message: 'No available drivers found', trip_id: trip_id }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const nearestDriver = drivers[0]

    // Assign trip to nearest driver
    const { data: updatedTrip, error: updateError } = await supabase
      .from('trips')
      .update({
        driver_id: nearestDriver.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', trip_id)
      .select()
      .single()

    if (updateError) {
      console.error('[auto-assign-trip] Trip update error:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to assign trip', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log(`[auto-assign-trip] Trip ${trip_id} assigned to driver ${nearestDriver.id}`)

    // Invoke send-push-notification function
    const functionUrl = `${supabaseUrl}/functions/v1/send-push-notification`
    const functionResponse = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${supabaseServiceKey}`,
      },
      body: JSON.stringify({
        trip_id: trip_id,
        driver_id: nearestDriver.id,
      }),
    }).catch((error) => {
      console.error('[auto-assign-trip] Failed to invoke send-push-notification:', error)
      // Don't fail the assignment if push notification fails
      return null
    })

    return new Response(
      JSON.stringify({
        success: true,
        trip: updatedTrip,
        driver: {
          id: nearestDriver.id,
          name: nearestDriver.full_name,
          distance_meters: nearestDriver.distance_meters,
        },
        push_notification_sent: functionResponse?.ok || false,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[auto-assign-trip] ❌ Unexpected error:', error)
    console.error('[auto-assign-trip] ❌ Error type:', typeof error)
    console.error('[auto-assign-trip] ❌ Error details:', JSON.stringify(error, Object.getOwnPropertyNames(error), 2))
    if (error instanceof Error) {
      console.error('[auto-assign-trip] ❌ Error message:', error.message)
      console.error('[auto-assign-trip] ❌ Error stack:', error.stack)
    }
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : String(error),
        type: typeof error
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})

// Haversine formula to calculate distance between two coordinates (in meters)
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3 // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180
  const φ2 = (lat2 * Math.PI) / 180
  const Δφ = ((lat2 - lat1) * Math.PI) / 180
  const Δλ = ((lon2 - lon1) * Math.PI) / 180

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))

  return R * c // Distance in meters
}

