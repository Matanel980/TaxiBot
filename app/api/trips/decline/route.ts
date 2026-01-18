import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * POST /api/trips/decline
 * Decline a trip (from notification or UI)
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { tripId } = await request.json()

    if (!tripId) {
      return NextResponse.json({ error: 'tripId is required' }, { status: 400 })
    }

    // Check if trip exists and belongs to this driver
    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .select('id, driver_id, status')
      .eq('id', tripId)
      .single()

    if (tripError || !trip) {
      return NextResponse.json({ error: 'Trip not found' }, { status: 404 })
    }

    // If trip is assigned to this driver and pending, unassign it
    if (trip.driver_id === user.id && trip.status === 'pending') {
      const { error: updateError } = await supabase
        .from('trips')
        .update({
          driver_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', tripId)

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 400 })
      }
    }

    // TODO: In Phase 3 (Edge Functions), trigger reassignment to next driver
    // For now, just unassign the trip

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}





