import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-server'

// POST - Link existing profile to auth user by migrating data
// This handles the case where profile.id doesn't match auth user.id
// Uses atomic database transaction via migrate_profile_id() function
export async function POST(request: NextRequest) {
  const { oldProfileId, newUserId, phone } = await request.json()

  // Validate inputs with detailed logging
  if (!oldProfileId || !newUserId || !phone) {
    console.error('[Link Profile] Missing parameters:', {
      oldProfileId: oldProfileId || 'MISSING',
      newUserId: newUserId || 'MISSING',
      phone: phone || 'MISSING'
    })
    return NextResponse.json(
      { 
        success: false,
        error: 'Missing required parameters: oldProfileId, newUserId, phone' 
      },
      { status: 400 }
    )
  }

  console.log('[Link Profile] Starting migration:', {
    oldProfileId,
    newUserId,
    phone,
    timestamp: new Date().toISOString()
  })

  try {
    // Use admin client to bypass RLS
    const adminSupabase = createSupabaseAdminClient()

    // Step 1: Verify old profile exists before migration
    const { data: oldProfile, error: fetchError } = await adminSupabase
      .from('profiles')
      .select('*')
      .eq('id', oldProfileId)
      .single()

    if (fetchError || !oldProfile) {
      console.error('[Link Profile] Old profile not found:', {
        oldProfileId,
        error: fetchError?.message,
        code: fetchError?.code
      })
      return NextResponse.json(
        { 
          success: false,
          error: `Profile not found with old ID: ${oldProfileId}`,
          errorCode: fetchError?.code || 'PROFILE_NOT_FOUND'
        },
        { status: 404 }
      )
    }

    // Step 2: Check if profile already exists with new ID (already linked)
    const { data: existingProfile } = await adminSupabase
      .from('profiles')
      .select('id, phone, role, station_id')
      .eq('id', newUserId)
      .single()

    if (existingProfile) {
      console.log('[Link Profile] Profile already linked:', {
        newUserId,
        existingPhone: existingProfile.phone,
        role: existingProfile.role
      })
      return NextResponse.json({
        success: true,
        message: 'Profile already linked',
        profile: existingProfile
      })
    }

    // Step 3: Validate new profile ID doesn't exist in profiles (double-check)
    // This ensures we don't attempt migration if target already exists
    const { data: conflictingProfile } = await adminSupabase
      .from('profiles')
      .select('id, phone')
      .eq('id', newUserId)
      .maybeSingle()

    if (conflictingProfile) {
      console.error('[Link Profile] New profile ID already exists:', {
        newUserId,
        conflictingPhone: conflictingProfile.phone
      })
      return NextResponse.json(
        { 
          success: false,
          error: `Profile ID ${newUserId} already exists in profiles table`,
          errorCode: 'ID_CONFLICT'
        },
        { status: 409 }
      )
    }

    // Step 4: Call atomic database function to perform migration
    // This function handles the migration in a transaction:
    // 1. Temporarily updates old profile phone
    // 2. Creates new profile with new ID
    // 3. Updates trips.driver_id references
    // 4. Deletes old profile
    // All within a single atomic transaction
    const { data: migrationResult, error: migrationError } = await adminSupabase
      .rpc('migrate_profile_id', {
        old_profile_id: oldProfileId,
        new_user_id: newUserId
      })

    if (migrationError) {
      console.error('[Link Profile] Database migration function failed:', {
        error: migrationError.message,
        code: migrationError.code,
        details: migrationError.details,
        hint: migrationError.hint,
        oldProfileId,
        newUserId
      })

      return NextResponse.json(
        { 
          success: false,
          error: `Migration failed: ${migrationError.message}`,
          errorCode: migrationError.code || 'MIGRATION_FAILED',
          details: migrationError.details,
          hint: migrationError.hint
        },
        { status: 500 }
      )
    }

    if (!migrationResult || !migrationResult.success) {
      console.error('[Link Profile] Migration returned failure:', {
        migrationResult,
        oldProfileId,
        newUserId
      })
      return NextResponse.json(
        { 
          success: false,
          error: migrationResult?.message || 'Migration function returned failure',
          errorCode: 'MIGRATION_FAILED'
        },
        { status: 500 }
      )
    }

    console.log('[Link Profile] Migration successful:', {
      oldProfileId,
      newUserId,
      tripsUpdated: migrationResult.trips_updated || 0,
      role: migrationResult.role,
      phone: migrationResult.phone
    })

    // Step 5: Verify new profile exists after migration
    const { data: newProfile, error: verifyError } = await adminSupabase
      .from('profiles')
      .select('*')
      .eq('id', newUserId)
      .single()

    if (verifyError || !newProfile) {
      console.error('[Link Profile] Verification failed - new profile not found:', {
        newUserId,
        error: verifyError?.message,
        code: verifyError?.code
      })
      return NextResponse.json(
        { 
          success: false,
          error: `Migration completed but profile not found with new ID: ${newUserId}`,
          errorCode: 'VERIFICATION_FAILED'
        },
        { status: 500 }
      )
    }

    // Return success with migrated profile
    return NextResponse.json({
      success: true,
      message: 'Profile linked successfully',
      profile: newProfile,
      migrationDetails: {
        tripsUpdated: migrationResult.trips_updated || 0,
        role: migrationResult.role
      }
    })
  } catch (error: any) {
    console.error('[Link Profile] Unexpected error:', {
      error: error.message || error,
      errorCode: error.code,
      errorName: error.name,
      stack: error.stack,
      oldProfileId,
      newUserId,
      phone
    })
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'Internal server error',
        errorCode: error.code || 'UNKNOWN_ERROR',
        errorName: error.name
      },
      { status: 500 }
    )
  }
}

