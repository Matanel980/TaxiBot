import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient, createSupabaseAdminClient } from '@/lib/supabase-server'

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

    const { full_name, phone, email, password, vehicle_number, is_approved } = await request.json()

    if (!full_name || !phone || !email || !password) {
      return NextResponse.json(
        { success: false, error: 'שם מלא, טלפון, אימייל וסיסמה נדרשים' },
        { status: 400 }
      )
    }

    // Debug: Log phone number format
    console.log('[DEBUG] Phone number received:', phone)
    console.log('[DEBUG] Phone starts with +:', phone?.startsWith('+'))

    // Debug: Log environment variable status
    console.log('[DEBUG] Driver Creation API Route:')
    console.log('  - SUPABASE_SERVICE_ROLE_KEY defined:', !!process.env.SUPABASE_SERVICE_ROLE_KEY)
    console.log('  - NEXT_PUBLIC_SUPABASE_URL defined:', !!process.env.NEXT_PUBLIC_SUPABASE_URL)
    console.log('  - All SUPABASE env vars:', Object.keys(process.env).filter(k => k.includes('SUPABASE')).join(', '))

    // Create Supabase Admin Client (uses service role key to bypass RLS and email confirmation)
    let supabaseAdmin
    try {
      supabaseAdmin = createSupabaseAdminClient()
      console.log('[DEBUG] Supabase Admin Client created successfully')
    } catch (error: any) {
      console.error('[DEBUG] Failed to create Supabase Admin Client:', error.message)
      return NextResponse.json(
        { success: false, error: error.message || 'Service role key not configured. Please add SUPABASE_SERVICE_ROLE_KEY to .env.local' },
        { status: 500 }
      )
    }

    // Create auth user
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: password,
      phone: phone,
      email_confirm: true,
      phone_confirm: true,
    })

    if (authError) {
      console.error('Auth user creation error:', authError)
      console.error('Auth error details:', JSON.stringify(authError, null, 2))
      
      // Map common Supabase auth errors to user-friendly messages
      let errorMessage = authError.message
      
      // Check for phone number errors
      if (authError.message?.includes('User already registered')) {
        if (authError.message.includes('email')) {
          errorMessage = 'Email already registered by another user'
        } else if (authError.message.includes('phone') || authError.message.includes('Phone')) {
          errorMessage = 'Phone number already registered by another user'
        }
      }
      
      // Check for E.164 format errors
      if (authError.message?.includes('E.164') || authError.message?.includes('invalid phone number format')) {
        errorMessage = 'Invalid phone number format (E.164 required)'
      }
      
      return NextResponse.json({ success: false, error: errorMessage }, { status: 400 })
    }

    if (!authUser.user) {
      return NextResponse.json({ success: false, error: 'Failed to create auth user' }, { status: 500 })
    }

    // Create profile with the auth user ID using admin client to bypass RLS
    // Use the same phone format that was used for auth (E.164)
    // Explicitly specify all columns to avoid schema cache issues
    const profileData = {
      id: authUser.user.id,
      phone: phone, // Already in E.164 format from formatPhoneNumber
      role: 'driver' as const,
      full_name: full_name,
      vehicle_number: vehicle_number || null,
      is_approved: is_approved === true, // Explicitly set based on toggle (default false)
    }
    
    console.log('[DEBUG] Profile data to insert:', JSON.stringify(profileData, null, 2))
    
    const { data: newDriver, error: profileError } = await supabaseAdmin
      .from('profiles')
      .insert(profileData)
      .select('id, full_name, phone, vehicle_number, is_approved, role, is_online, current_zone, latitude, longitude, updated_at')
      .single()

    if (profileError) {
      console.error('[ERROR] Profile creation error:', profileError)
      console.error('[ERROR] Profile error details:', JSON.stringify(profileError, null, 2))
      console.error('[ERROR] Profile data attempted:', JSON.stringify(profileData, null, 2))
      
      // Rollback: delete auth user if profile creation fails
      try {
        await supabaseAdmin.auth.admin.deleteUser(authUser.user.id)
        console.log('[DEBUG] Auth user rolled back successfully')
      } catch (deleteError) {
        console.error('[ERROR] Failed to rollback auth user:', deleteError)
      }
      return NextResponse.json({ success: false, error: profileError.message }, { status: 400 })
    }
    
    console.log('[SUCCESS] Driver created successfully:', newDriver?.id)

    return NextResponse.json({ success: true, data: newDriver })
  } catch (error: any) {
    console.error('Unexpected error creating driver:', error)
    return NextResponse.json({ success: false, error: error.message || 'שגיאה בלתי צפויה' }, { status: 500 })
  }
}
