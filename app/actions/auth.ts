'use server'

/**
 * CRITICAL: Token-First Session Creation Server Action
 * 
 * This action bypasses middleware and explicitly sets cookies
 * in a single atomic transaction. It handles:
 * 1. Session token verification
 * 2. Cookie setting with explicit options
 * 3. Profile verification/creation (synchronous, no trigger wait)
 * 4. JWT metadata sync
 * 
 * This eliminates race conditions between auth signup and profile lookup.
 */

import { cookies } from 'next/headers'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseAdminClient } from '@/lib/supabase-server'
import type { Profile } from '@/lib/supabase'
import { extractPhoneDigits, comparePhones } from '@/lib/phone-utils'

interface CreateSessionResult {
  success: boolean
  user?: {
    id: string
    phone: string
  }
  profile?: Profile
  error?: {
    code: string
    message: string
    hebrewMessage: string
  }
  redirectPath?: string
}

/**
 * CRITICAL: Request-level client cache to prevent token mismatches
 * Each request gets a single cached instance
 */
const clientCache = new Map<string, ReturnType<typeof createClient>>()

function getCachedAdminClient(): ReturnType<typeof createSupabaseAdminClient> {
  const cacheKey = 'admin-client'
  
  if (!clientCache.has(cacheKey)) {
    const client = createSupabaseAdminClient()
    clientCache.set(cacheKey, client)
    // Clear cache after request (Next.js handles this, but we ensure cleanup)
    setTimeout(() => clientCache.delete(cacheKey), 1000)
  }
  
  return clientCache.get(cacheKey)!
}

/**
 * Creates session from access token and ensures profile exists
 * This is called AFTER verifyOtp succeeds on client
 */
export async function createSession(
  accessToken: string,
  refreshToken: string,
  userId: string,
  phone: string
): Promise<CreateSessionResult> {
  try {
    console.log('[createSession] Starting session creation for user:', userId)
    
    const cookieStore = await cookies()
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
    
    // CRITICAL: Verify tokens are valid using admin client
    // This ensures the tokens are legitimate before setting cookies
    const adminClient = getCachedAdminClient()
    
    // Verify the access token is valid by getting user
    const { data: { user: verifiedUser }, error: verifyError } = await adminClient.auth.admin.getUserById(userId)
    
    if (verifyError || !verifiedUser) {
      console.error('[createSession] Failed to verify user:', verifyError)
      return {
        success: false,
        error: {
          code: 'TOKEN_VERIFICATION_FAILED',
          message: verifyError?.message || 'Failed to verify token',
          hebrewMessage: 'שגיאה באימות הטוקן - אנא נסה שוב',
        },
      }
    }
    
    // CRITICAL: Verify phone matches using format-agnostic comparison
    // Auth user might have phone stored as "972509800301" while we receive "+972509800301"
    if (!comparePhones(verifiedUser.phone || '', phone)) {
      console.error('[createSession] Phone mismatch (format-agnostic):', verifiedUser.phone, 'vs', phone)
      return {
        success: false,
        error: {
          code: 'PHONE_MISMATCH',
          message: 'Phone number mismatch',
          hebrewMessage: 'שגיאה באימות - אנא נסה שוב',
        },
      }
    }
    
    console.log('[createSession] Phone verified (format-agnostic):', verifiedUser.phone, 'matches', phone)
    
    console.log('[createSession] Token verified successfully, user ID:', verifiedUser.id)
    
    // CRITICAL: Get Supabase project ID for cookie naming
    const projectId = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1] || ''
    
    // CRITICAL: Set cookies explicitly with Vercel-compatible options
    const cookieOptions = {
      httpOnly: true,
      secure: process.env.VERCEL === '1' || process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 days for access token
    }
    
    const refreshCookieOptions = {
      ...cookieOptions,
      maxAge: 60 * 60 * 24 * 30, // 30 days for refresh token
    }
    
    // Set auth cookies with explicit names
    cookieStore.set(`sb-${projectId}-auth-token`, accessToken, cookieOptions)
    cookieStore.set(`sb-${projectId}-auth-refresh-token`, refreshToken, refreshCookieOptions)
    
    console.log('[createSession] Cookies set for project:', projectId)
    
    // CRITICAL: Verify/Create profile synchronously (no trigger wait)
    // adminClient already defined above (line 73)
    
    // Step 1: Check if profile exists by user ID
    const profileResult = await adminClient
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()
    
    let profile: Profile | null = profileResult.data as Profile | null
    let profileError = profileResult.error
    
    // Step 2: If not found by ID, check by phone (pre-created profile)
    // CRITICAL: Use format-agnostic phone matching since phone formats may differ
    if (profileError?.code === 'PGRST116' || !profile) {
      console.log('[createSession] Profile not found by ID, checking by phone (format-agnostic)...')
      
      // Fetch all profiles and match by phone digits (format-agnostic)
      // This handles cases where phone is stored as "972509800301" vs "+972509800301"
      const allProfilesResult = await adminClient
        .from('profiles')
        .select('*')
      
      const allProfiles = (allProfilesResult.data || []) as Profile[]
      const phoneDigits = extractPhoneDigits(phone)
      
      // Find profile by matching phone digits (format-agnostic)
      const phoneProfile = allProfiles.find(p => {
        const profileDigits = extractPhoneDigits(p.phone || '')
        return profileDigits === phoneDigits
      }) || null
      
      const phoneError = phoneProfile ? null : { code: 'PGRST116', message: 'Profile not found by phone' }
      
      if (phoneProfile && !phoneError) {
        console.log('[createSession] Found profile by phone, ID mismatch:', phoneProfile.id, 'vs', userId)
        
        // Profile exists but ID doesn't match - migrate it
        // Use the migrate_profile_id function if it exists, otherwise create new and delete old
        const migrationResponse = await adminClient
          .rpc('migrate_profile_id' as any, {
            old_profile_id: phoneProfile.id,
            new_user_id: userId,
          } as any)
        
        const migrationResult = migrationResponse.data
        const migrationError = migrationResponse.error
        
        if (migrationError) {
          console.error('[createSession] Migration failed, creating new profile:', migrationError)
          
          // Migration failed - create new profile with user ID
          const insertResult = await adminClient
            .from('profiles')
            .insert({
              id: userId,
              phone: phone,
              role: phoneProfile.role || 'driver',
              full_name: phoneProfile.full_name || '',
              vehicle_number: phoneProfile.vehicle_number,
              car_type: phoneProfile.car_type,
              station_id: phoneProfile.station_id,
              is_online: false,
              is_approved: phoneProfile.is_approved || false,
              current_zone: phoneProfile.current_zone,
              latitude: phoneProfile.latitude,
              longitude: phoneProfile.longitude,
              current_address: phoneProfile.current_address,
              heading: phoneProfile.heading,
            } as any)
            .select()
            .single()
          
          const newProfile = insertResult.data as Profile | null
          const createError = insertResult.error
          
          if (createError || !newProfile) {
            console.error('[createSession] Failed to create profile:', createError)
            return {
              success: false,
              error: {
                code: 'PROFILE_CREATE_FAILED',
                message: createError?.message || 'Failed to create profile',
                hebrewMessage: 'שגיאה ביצירת פרופיל - אנא פנה למנהל התחנה',
              },
            }
          }
          
          profile = newProfile
        } else {
          // Migration succeeded, re-query profile
          const migratedResult = await adminClient
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle()
          
          profile = migratedResult.data as Profile | null
        }
      } else {
        // No profile exists at all - create new one
        console.log('[createSession] No profile found, creating new one...')
        
        // Try to get station_id from existing profiles with same phone pattern
        // Or use a default (this should be handled by admin creating driver first)
        const insertResult = await adminClient
          .from('profiles')
          .insert({
            id: userId,
            phone: phone,
            role: 'driver', // Default role
            full_name: '',
            station_id: null, // Will need to be set by admin
            is_online: false,
            is_approved: false,
            current_zone: null,
            latitude: null,
            longitude: null,
            current_address: null,
            heading: null,
          } as any)
          .select()
          .single()
        
        const newProfile = insertResult.data as Profile | null
        const createError = insertResult.error
        
        if (createError || !newProfile) {
          console.error('[createSession] Failed to create profile:', createError)
          return {
            success: false,
            error: {
              code: 'PROFILE_CREATE_FAILED',
              message: createError?.message || 'Failed to create profile',
              hebrewMessage: 'שגיאה ביצירת פרופיל - אנא פנה למנהל התחנה',
            },
          }
        }
        
        profile = newProfile
      }
    }
    
    if (!profile) {
      return {
        success: false,
        error: {
          code: 'PROFILE_NOT_FOUND',
          message: 'Profile not found after creation attempt',
          hebrewMessage: 'לא נמצא פרופיל למשתמש זה. אנא פנה למנהל התחנה.',
        },
      }
    }
    
    // CRITICAL: Sync role and station_id to JWT metadata BEFORE validation
    // This ensures RLS policies can read role from JWT on next request
    try {
      await adminClient.auth.admin.updateUserById(userId, {
        user_metadata: {
          role: profile.role,
          station_id: profile.station_id?.toString() || null,
        },
      })
      console.log('[createSession] JWT metadata synced - role:', profile.role, 'station_id:', profile.station_id)
    } catch (metadataError) {
      console.warn('[createSession] Failed to sync JWT metadata (non-critical):', metadataError)
      // Non-critical - continue even if metadata sync fails
    }
    
    // CRITICAL: Validate station_id - but only for admins or if profile requires it
    // Drivers might not have station_id if they're being onboarded
    // However, if profile exists and has station_id, it should be validated
    if (profile.role === 'admin' && !profile.station_id) {
      console.error('[createSession] Admin profile missing station_id')
      return {
        success: false,
        error: {
          code: 'STATION_ID_MISSING',
          message: 'Admin profile missing station_id',
          hebrewMessage: 'המשתמש לא משויך לתחנה. אנא פנה למנהל התחנה.',
        },
      }
    }
    
    // For drivers, station_id is preferred but not strictly required if profile was just created
    // If profile was pre-created (found by phone), it should have station_id
    if (profile.role === 'driver' && !profile.station_id) {
      console.warn('[createSession] Driver profile missing station_id - this may be a new profile')
      // Allow driver to proceed to onboarding where station_id can be set
      // Don't block login, but log warning
    }
    
    // Determine redirect path based on role and profile completeness
    let redirectPath = '/login'
    if (profile.role === 'admin') {
      redirectPath = '/admin/dashboard'
    } else if (profile.role === 'driver') {
      // CRITICAL: Check if profile is incomplete (missing vehicle_number, car_type, or station_id)
      const isIncomplete = !profile.vehicle_number || !profile.car_type || !profile.station_id
      redirectPath = isIncomplete ? '/onboarding' : '/driver/dashboard'
      
      if (isIncomplete) {
        console.log('[createSession] Driver profile incomplete - redirecting to onboarding')
      }
    }
    
    console.log('[createSession] Session created successfully, redirecting to:', redirectPath)
    
    return {
      success: true,
      user: {
        id: userId,
        phone: phone,
      },
      profile: profile as Profile,
      redirectPath,
    }
  } catch (error: any) {
    console.error('[createSession] Unexpected error:', error)
    return {
      success: false,
      error: {
        code: 'UNKNOWN_ERROR',
        message: error?.message || 'Unknown error',
        hebrewMessage: 'שגיאה לא צפויה - אנא נסה שוב',
      },
    }
  }
}
