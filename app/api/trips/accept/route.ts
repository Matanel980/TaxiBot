import { createClient } from '@/lib/supabase'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  try {
    const supabase = createClient()
    const body = await request.json()
    const { tripId } = body

    if (!tripId) {
      return NextResponse.json(
        { error: 'Trip ID is required' },
        { status: 400 }
      )
    }

    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser()
    if (userError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    // Get driver's station_id for verification
    const { data: driverProfile } = await supabase
      .from('profiles')
      .select('station_id')
      .eq('id', user.id)
      .single()

    if (!driverProfile?.station_id) {
      return NextResponse.json(
        { error: 'Driver not assigned to a station' },
        { status: 403 }
      )
    }

    // Get the trip first to check its current state and station_id
    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .select('id, status, driver_id, station_id')
      .eq('id', tripId)
      .single()

    if (tripError || !trip) {
      return NextResponse.json(
        { error: 'Trip not found' },
        { status: 404 }
      )
    }

    // CRITICAL: Verify trip belongs to driver's station (STATION ISOLATION)
    if (trip.station_id !== driverProfile.station_id) {
      return NextResponse.json(
        { error: 'Trip does not belong to your station' },
        { status: 403 }
      )
    }

    // Check if trip is still pending (race condition prevention)
    if (trip.status !== 'pending') {
      return NextResponse.json(
        { error: 'Trip is no longer available', currentStatus: trip.status },
        { status: 409 }
      )
    }

    // Check if trip already has a driver assigned
    if (trip.driver_id && trip.driver_id !== user.id) {
      return NextResponse.json(
        { error: 'Trip already assigned to another driver' },
        { status: 409 }
      )
    }

    // Use optimistic update with conflict detection
    // Update only if status is still 'pending' (prevents race conditions)
    const { data: updatedTrip, error: updateError } = await supabase
      .from('trips')
      .update({
        status: 'active',
        driver_id: user.id,
        accepted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', tripId)
      .eq('status', 'pending') // Critical: Only update if still pending (prevents 409 conflicts)
      .select()
      .single()

    if (updateError) {
      // Handle specific error codes
      if (updateError.code === 'PGRST116' || updateError.message?.includes('409') || updateError.message?.includes('Conflict')) {
        // Trip was already accepted by another driver or status changed
        return NextResponse.json(
          { error: 'Trip is no longer available', code: 'CONFLICT' },
          { status: 409 }
        )
      }

      console.error('[Accept Trip] Update error:', updateError)
      return NextResponse.json(
        { error: 'Failed to accept trip', details: updateError.message },
        { status: 500 }
      )
    }

    if (!updatedTrip) {
      // No rows updated - trip status changed before we could update
      return NextResponse.json(
        { error: 'Trip is no longer available' },
        { status: 409 }
      )
    }

    return NextResponse.json({
      success: true,
      trip: updatedTrip,
    })
  } catch (error: any) {
    console.error('[Accept Trip] Exception:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
