import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { tripId, status } = await request.json()

    if (!['active', 'completed'].includes(status)) {
      return NextResponse.json({ error: 'Invalid status' }, { status: 400 })
    }

    // Get driver's station_id for verification (TENANT ISOLATION)
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

    // Get trip to verify station_id match (TENANT ISOLATION)
    const { data: trip, error: tripFetchError } = await supabase
      .from('trips')
      .select('id, status, driver_id, station_id')
      .eq('id', tripId)
      .single()

    if (tripFetchError || !trip) {
      return NextResponse.json(
        { error: 'Trip not found' },
        { status: 404 }
      )
    }

    // CRITICAL: Verify trip belongs to driver's station (TENANT ISOLATION)
    if (trip.station_id !== driverProfile.station_id) {
      return NextResponse.json(
        { error: 'Trip does not belong to your station' },
        { status: 403 }
      )
    }

    // Verify trip belongs to this driver
    if (trip.driver_id !== user.id) {
      return NextResponse.json(
        { error: 'Trip does not belong to you' },
        { status: 403 }
      )
    }

    // Update trip status with station_id verification
    const { data, error } = await supabase
      .from('trips')
      .update({
        status,
        updated_at: new Date().toISOString()
      })
      .eq('id', tripId)
      .eq('driver_id', user.id)
      .eq('station_id', driverProfile.station_id) // Additional station_id check for defense-in-depth
      .select()
      .single()

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ trip: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

