import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'
import { authenticateWebhookRequest, verifyWebhookSignature } from '@/lib/webhook-auth'
import { geocodeAddress } from '@/lib/geocoding'

/**
 * POST /api/webhooks/trips/create
 * Create a trip from external service (WhatsApp, AI Voice, etc.)
 * 
 * Authentication: API Key + HMAC signature
 * Headers:
 *   - X-API-Key: API key
 *   - X-Signature: HMAC-SHA256 signature (optional if HMAC_SECRET not set)
 */
export async function POST(request: NextRequest) {
  try {
    // Get raw body for HMAC signature verification
    const rawBody = await request.text()
    const body = JSON.parse(rawBody)

    // Authenticate request
    const authError = authenticateWebhookRequest(request)
    if (authError) {
      return NextResponse.json(
        { error: authError.error },
        { status: authError.status }
      )
    }

    // Verify HMAC signature if secret is configured
    const secret = process.env.WEBHOOK_SECRET_KEY
    const signature = request.headers.get('x-signature')
    if (secret && signature) {
      const isValid = verifyWebhookSignature(rawBody, signature, secret)
      if (!isValid) {
        return NextResponse.json(
          { error: 'Invalid signature' },
          { status: 401 }
        )
      }
    }

    // Validate payload
    const {
      customer_phone,
      pickup_address,
      destination_address,
      pickup_lat,
      pickup_lng,
      destination_lat,
      destination_lng,
      zone_id,
      station_id, // CRITICAL: station_id from webhook payload
      metadata,
    } = body

    // Required fields validation
    if (!customer_phone || typeof customer_phone !== 'string') {
      return NextResponse.json(
        { error: 'customer_phone is required' },
        { status: 400 }
      )
    }

    if (!pickup_address || typeof pickup_address !== 'string') {
      return NextResponse.json(
        { error: 'pickup_address is required' },
        { status: 400 }
      )
    }

    if (!destination_address || typeof destination_address !== 'string') {
      return NextResponse.json(
        { error: 'destination_address is required' },
        { status: 400 }
      )
    }

    // Validate phone format (basic validation)
    const phoneRegex = /^\+972\d{9}$/
    if (!phoneRegex.test(customer_phone)) {
      return NextResponse.json(
        { error: 'customer_phone must be in E.164 format (+972XXXXXXXXX)' },
        { status: 400 }
      )
    }

    // MISSION-CRITICAL: Validate and geocode BOTH pickup AND destination coordinates
    // NO TRIP CAN BE CREATED WITHOUT COMPLETE COORDINATES
    
    // Validate pickup coordinates if provided
    let finalPickupLat = pickup_lat
    let finalPickupLng = pickup_lng

    if (pickup_lat !== undefined || pickup_lng !== undefined) {
      if (
        typeof pickup_lat !== 'number' ||
        typeof pickup_lng !== 'number' ||
        pickup_lat < -90 ||
        pickup_lat > 90 ||
        pickup_lng < -180 ||
        pickup_lng > 180
      ) {
        return NextResponse.json(
          { error: 'Invalid pickup coordinates' },
          { status: 400 }
        )
      }
    }

    // Geocode pickup if coordinates not provided
    if (!finalPickupLat || !finalPickupLng) {
      const geocodeResult = await geocodeAddress(pickup_address)
      if ('error' in geocodeResult) {
        return NextResponse.json(
          { error: `Pickup geocoding failed: ${geocodeResult.error}` },
          { status: 400 }
        )
      }
      finalPickupLat = geocodeResult.lat
      finalPickupLng = geocodeResult.lng
    }

    // Validate destination coordinates if provided
    let finalDestinationLat = destination_lat
    let finalDestinationLng = destination_lng

    if (destination_lat !== undefined || destination_lng !== undefined) {
      if (
        typeof destination_lat !== 'number' ||
        typeof destination_lng !== 'number' ||
        destination_lat < -90 ||
        destination_lat > 90 ||
        destination_lng < -180 ||
        destination_lng > 180
      ) {
        return NextResponse.json(
          { error: 'Invalid destination coordinates' },
          { status: 400 }
        )
      }
    }

    // Geocode destination if coordinates not provided (REQUIRED)
    if (!finalDestinationLat || !finalDestinationLng) {
      const geocodeResult = await geocodeAddress(destination_address)
      if ('error' in geocodeResult) {
        return NextResponse.json(
          { error: `Destination geocoding failed: ${geocodeResult.error}` },
          { status: 400 }
        )
      }
      finalDestinationLat = geocodeResult.lat
      finalDestinationLng = geocodeResult.lng
    }

    // FINAL VALIDATION: Both sets of coordinates must be present
    if (!finalPickupLat || !finalPickupLng || !finalDestinationLat || !finalDestinationLng) {
      return NextResponse.json(
        { error: 'Missing required coordinates. Both pickup and destination coordinates are required.' },
        { status: 400 }
      )
    }

    // Detect zone if not provided
    let finalZoneId = zone_id
    if (!finalZoneId) {
      const supabase = await createServerSupabaseClient()
      const { data: zoneData, error: zoneError } = await supabase.rpc(
        'get_zone_for_point',
        {
          lat: finalPickupLat,
          lng: finalPickupLng,
        }
      )

      if (!zoneError && zoneData && zoneData.length > 0) {
        finalZoneId = zoneData[0].zone_id
      }
    }

    // CRITICAL: Get station_id from payload or validate it exists
    // If not provided, try to get from authenticated user (if webhook supports auth)
    let finalStationId = station_id
    
    // If station_id not in payload, try to get from authenticated user
    if (!finalStationId) {
      const supabaseAuth = await createServerSupabaseClient()
      const { data: { user } } = await supabaseAuth.auth.getUser()
      
      if (user) {
        const { data: profile } = await supabaseAuth
          .from('profiles')
          .select('station_id')
          .eq('id', user.id)
          .single()
        
        if (profile?.station_id) {
          finalStationId = profile.station_id
        }
      }
    }

    // VALIDATE: station_id is required for multi-tenant isolation
    if (!finalStationId) {
      return NextResponse.json(
        { error: 'station_id is required. Provide it in the webhook payload or ensure the authenticated user has a station_id assigned.' },
        { status: 400 }
      )
    }

    // Create trip with ALL coordinates and station_id (MISSION-CRITICAL)
    const supabase = await createServerSupabaseClient()
    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .insert({
        customer_phone,
        pickup_address,
        destination_address,
        status: 'pending',
        zone_id: finalZoneId || null,
        station_id: finalStationId, // AUTO-ASSIGN STATION (CRITICAL)
        pickup_lat: finalPickupLat,
        pickup_lng: finalPickupLng,
        destination_lat: finalDestinationLat,
        destination_lng: finalDestinationLng,
      })
      .select()
      .single()

    if (tripError) {
      console.error('[Webhook Create Trip] Database error:', tripError)
      return NextResponse.json(
        { error: 'Failed to create trip', details: tripError.message },
        { status: 500 }
      )
    }

    // Trigger auto-assignment Edge Function (if configured)
    // The Edge Function will be triggered automatically via database webhook
    // For immediate invocation, you can also call it here:
    const edgeFunctionUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/auto-assign-trip`
    fetch(edgeFunctionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
      body: JSON.stringify({ trip_id: trip.id }),
    }).catch((error) => {
      console.error('[Webhook] Failed to trigger auto-assign function:', error)
      // Don't fail the request if Edge Function call fails
    })

    return NextResponse.json({
      success: true,
      trip: {
        id: trip.id,
        customer_phone: trip.customer_phone,
        pickup_address: trip.pickup_address,
        destination_address: trip.destination_address,
        status: trip.status,
        zone_id: trip.zone_id,
        pickup_lat: trip.pickup_lat,
        pickup_lng: trip.pickup_lng,
        destination_lat: trip.destination_lat,
        destination_lng: trip.destination_lng,
        created_at: trip.created_at,
      },
    })
  } catch (error: any) {
    console.error('[Webhook Create Trip] Unexpected error:', error)

    // Handle JSON parse errors
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON payload' },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

