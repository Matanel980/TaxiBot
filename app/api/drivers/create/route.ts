import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseAdminClient } from '@/lib/supabase-server'
import { normalizeIsraeliPhone } from '@/lib/phone-utils'

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 })
    }

    const { full_name, phone, vehicle_number, car_type, is_approved, station_id } = await request.json()

    if (!full_name || !phone) {
      return NextResponse.json(
        { success: false, error: 'שם מלא וטלפון נדרשים' },
        { status: 400 }
      )
    }

    // CRITICAL: Normalize phone number using SINGLE SOURCE OF TRUTH
    let normalizedPhone: string
    try {
      normalizedPhone = normalizeIsraeliPhone(phone)
      console.log('[DEBUG] Normalized phone:', normalizedPhone, 'from input:', phone)
    } catch (normalizeError: any) {
      return NextResponse.json(
        { success: false, error: normalizeError.message || 'מספר טלפון לא תקין' },
        { status: 400 }
      )
    }

    // Get admin's station_id if not provided
    let finalStationId = station_id
    if (!finalStationId) {
      const { data: adminProfile } = await supabase
        .from('profiles')
        .select('station_id')
        .eq('id', user.id)
        .single()
      
      if (adminProfile?.station_id) {
        finalStationId = adminProfile.station_id
      }
    }

    // VALIDATE: station_id is required for multi-tenant isolation
    if (!finalStationId) {
      return NextResponse.json(
        { success: false, error: 'station_id is required. Admin must be assigned to a station.' },
        { status: 400 }
      )
    }

    // Debug: Log phone number format
    console.log('[DEBUG] Creating driver profile for phone:', normalizedPhone)

    // Create Supabase Admin Client to bypass RLS
    let supabaseAdmin
    try {
      supabaseAdmin = createSupabaseAdminClient()
      console.log('[DEBUG] Supabase Admin Client created successfully')
    } catch (error: any) {
      console.error('[DEBUG] Failed to create Supabase Admin Client:', error.message)
      return NextResponse.json(
        { success: false, error: error.message || 'Service role key not configured' },
        { status: 500 }
      )
    }

    // Create profile entry ONLY (no auth user yet)
    // Driver will create their auth user on first login via OTP
    const profileData = {
      id: crypto.randomUUID(), // Generate UUID for future auth user linkage
      phone: normalizedPhone, // E.164 format from normalizeIsraeliPhone()
      role: 'driver' as const,
      full_name: full_name,
      vehicle_number: vehicle_number || null,
      car_type: car_type || null,
      is_approved: is_approved === true,
      is_online: false,
      station_id: finalStationId, // AUTO-ASSIGN STATION (CRITICAL)
      current_zone: null,
      latitude: null,
      longitude: null,
      current_address: null,
      heading: null,
    }
    
    console.log('[DEBUG] Profile data to insert:', JSON.stringify(profileData, null, 2))
    
    const insertResult = await supabaseAdmin
      .from('profiles')
      .insert(profileData as any)
      .select('id, full_name, phone, vehicle_number, car_type, is_approved, role, is_online, current_zone, latitude, longitude, updated_at')
      .single()
    
    const newDriver = insertResult.data as { id: string; full_name: string; phone: string; vehicle_number: string | null; car_type: string | null; is_approved: boolean; role: string; is_online: boolean; current_zone: string | null; latitude: number | null; longitude: number | null; updated_at: string } | null
    const profileError = insertResult.error

    if (profileError) {
      console.error('[ERROR] Profile creation error:', profileError)
      console.error('[ERROR] Profile error details:', JSON.stringify(profileError, null, 2))
      
      // Check for duplicate phone number
      if (profileError.code === '23505' || profileError.message?.includes('duplicate') || profileError.message?.includes('unique')) {
        return NextResponse.json({ 
          success: false, 
          error: 'מספר הטלפון כבר רשום במערכת' 
        }, { status: 400 })
      }
      
      return NextResponse.json({ success: false, error: profileError.message }, { status: 400 })
    }
    
    console.log('[SUCCESS] Driver profile created successfully:', newDriver?.id)
    console.log('[INFO] Driver can now log in with phone:', normalizedPhone)

    return NextResponse.json({ success: true, data: newDriver })
  } catch (error: any) {
    console.error('Unexpected error creating driver:', error)
    return NextResponse.json({ success: false, error: error.message || 'שגיאה בלתי צפויה' }, { status: 500 })
  }
}
