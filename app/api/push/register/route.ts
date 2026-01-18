import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * POST /api/push/register
 * Register a push notification token for the authenticated driver
 */
export async function POST(request: NextRequest) {
  console.log('[API Push Register] 🔵 POST /api/push/register called')
  
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError) {
      console.error('[API Push Register] ❌ Auth error:', authError)
    }

    if (!user) {
      console.error('[API Push Register] ❌ No user found - Unauthorized')
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    console.log('[API Push Register] 🔵 User authenticated:', user.id)

    // Verify user is a driver
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', user.id)
      .single()

    if (profileError) {
      console.error('[API Push Register] ❌ Profile fetch error:', profileError)
    }

    if (profileError || !profile || profile.role !== 'driver') {
      console.error('[API Push Register] ❌ User is not a driver:', { profile, profileError })
      return NextResponse.json(
        { error: 'Only drivers can register push tokens' },
        { status: 403 }
      )
    }

    console.log('[API Push Register] 🔵 User is a driver:', profile.id)

    const body = await request.json()
    const { token, platform, user_agent } = body

    console.log('[API Push Register] 🔵 Request body:', {
      hasToken: !!token,
      tokenLength: token?.length,
      tokenPreview: token?.substring(0, 50) + '...',
      platform,
      hasUserAgent: !!user_agent
    })

    // Validate input
    if (!token || typeof token !== 'string') {
      console.error('[API Push Register] ❌ Token validation failed:', { token, type: typeof token })
      return NextResponse.json(
        { error: 'Token is required' },
        { status: 400 }
      )
    }

    if (!platform || !['web', 'ios', 'android'].includes(platform)) {
      console.error('[API Push Register] ❌ Platform validation failed:', platform)
      return NextResponse.json(
        { error: 'Platform must be one of: web, ios, android' },
        { status: 400 }
      )
    }

    // Calculate expiration (30 days for web, 90 days for mobile)
    const expirationDays = platform === 'web' ? 30 : 90
    const expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + expirationDays)

    const tokenData = {
      driver_id: user.id,
      token,
      platform,
      user_agent: user_agent || request.headers.get('user-agent') || null,
      expires_at: expiresAt.toISOString(),
      is_active: true,
      updated_at: new Date().toISOString(),
    }

    console.log('[API Push Register] 🔵 Inserting token data:', {
      driver_id: tokenData.driver_id,
      platform: tokenData.platform,
      tokenLength: tokenData.token.length,
      expires_at: tokenData.expires_at,
      is_active: tokenData.is_active
    })

    // Upsert push token (update if exists, insert if new)
    const { data, error } = await supabase
      .from('push_tokens')
      .upsert(
        tokenData,
        {
          onConflict: 'token',
          ignoreDuplicates: false,
        }
      )
      .select()
      .single()

    if (error) {
      console.error('[API Push Register] ❌ Database error:', error)
      console.error('[API Push Register] ❌ Error details:', {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint
      })
      return NextResponse.json(
        { error: 'Failed to register push token', details: error.message },
        { status: 500 }
      )
    }

    // ✅ Log token storage for verification
    console.log('[API Push Register] ✅ Push token saved to database:', {
      token_id: data.id,
      driver_id: data.driver_id,
      platform: data.platform,
      expires_at: data.expires_at,
      created_at: data.created_at,
      is_active: data.is_active
    })

    return NextResponse.json({
      success: true,
      token_id: data.id,
      expires_at: data.expires_at,
    })
  } catch (error: any) {
    console.error('[API Push Register] ❌ Unexpected error:', error)
    console.error('[API Push Register] ❌ Error stack:', error.stack)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}

