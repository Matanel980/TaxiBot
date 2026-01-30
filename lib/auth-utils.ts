/**
 * Authentication Utilities
 * 
 * Provides robust error handling, retry logic, and standardized error codes
 * for authentication operations.
 */

import { createClient } from '@/lib/supabase'
import type { Profile } from '@/lib/supabase'

export type LoginErrorCode =
  | 'SESSION_PERSISTENCE_FAILED'      // Session not saved to cookies
  | 'PROFILE_NOT_FOUND'                // Profile doesn't exist
  | 'PROFILE_RLS_BLOCKED'              // RLS policy blocked query
  | 'PROFILE_ID_MISMATCH'              // Profile.id ≠ user.id
  | 'PROFILE_LINK_FAILED'              // Linking via API failed
  | 'STATION_ID_MISSING'               // Profile missing station_id
  | 'NETWORK_TIMEOUT'                  // Request timed out
  | 'OTP_VERIFICATION_FAILED'          // OTP verification failed
  | 'UNKNOWN_ERROR'                    // Unexpected error

export interface LoginError {
  code: LoginErrorCode
  message: string
  details?: any
  retryable: boolean
  hebrewMessage: string
}

/**
 * Maps Supabase errors to standardized error codes
 */
export function mapAuthError(error: any, context: string): LoginError {
  // Session persistence errors
  if (error?.message?.includes('session') || error?.message?.includes('cookie')) {
    return {
      code: 'SESSION_PERSISTENCE_FAILED',
      message: 'Session not saved to cookies',
      details: error,
      retryable: true,
      hebrewMessage: 'שגיאה בשמירת ההתחברות - אנא נסה שוב'
    }
  }

  // Profile not found errors
  if (error?.code === 'PGRST116' || error?.message?.includes('No rows')) {
    return {
      code: 'PROFILE_NOT_FOUND',
      message: 'Profile not found in database',
      details: error,
      retryable: false,
      hebrewMessage: 'לא נמצא פרופיל למשתמש זה. אנא פנה למנהל התחנה.'
    }
  }

  // RLS policy errors
  if (error?.code === '42501' || 
      error?.message?.includes('permission denied') ||
      error?.message?.includes('RLS') ||
      error?.code === '42P17') {
    return {
      code: 'PROFILE_RLS_BLOCKED',
      message: 'RLS policy blocked query',
      details: error,
      retryable: true,
      hebrewMessage: 'שגיאת הרשאות - אנא נסה שוב'
    }
  }

  // Network/timeout errors
  if (error?.message?.includes('timeout') || 
      error?.message?.includes('network') ||
      error?.code === 'ETIMEDOUT') {
    return {
      code: 'NETWORK_TIMEOUT',
      message: 'Request timed out',
      details: error,
      retryable: true,
      hebrewMessage: 'שגיאת רשת - אנא נסה שוב'
    }
  }

  // OTP verification errors
  if (error?.message?.includes('OTP') || 
      error?.message?.includes('token') ||
      error?.code === 'invalid_grant') {
    return {
      code: 'OTP_VERIFICATION_FAILED',
      message: 'OTP verification failed',
      details: error,
      retryable: false,
      hebrewMessage: 'קוד אימות שגוי - אנא נסה שוב'
    }
  }

  // Unknown error
  return {
    code: 'UNKNOWN_ERROR',
    message: error?.message || 'Unknown error',
    details: error,
    retryable: false,
    hebrewMessage: 'שגיאה לא צפויה - אנא נסה שוב'
  }
}

/**
 * Waits for session to be available with retry logic
 */
export async function waitForSession(
  supabase: ReturnType<typeof createClient>,
  maxRetries: number = 5,
  initialDelay: number = 200
): Promise<{ session: any; error: LoginError | null }> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const { data: { session }, error } = await supabase.auth.getSession()
      
      if (error) {
        // If it's a retryable error and we have retries left, continue
        if (i < maxRetries - 1) {
          const delay = initialDelay * Math.pow(2, i) // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
        
        return {
          session: null,
          error: mapAuthError(error, 'waitForSession')
        }
      }
      
      if (session) {
        return { session, error: null }
      }
      
      // Session not available yet, wait and retry
      if (i < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, i) // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay))
      }
    } catch (err: any) {
      if (i === maxRetries - 1) {
        return {
          session: null,
          error: mapAuthError(err, 'waitForSession')
        }
      }
      
      const delay = initialDelay * Math.pow(2, i)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  return {
    session: null,
    error: {
      code: 'SESSION_PERSISTENCE_FAILED',
      message: 'Session not available after retries',
      retryable: true,
      hebrewMessage: 'שגיאה בשמירת ההתחברות - אנא נסה שוב'
    }
  }
}

/**
 * Queries profile by user ID with retry logic
 */
export async function queryProfileById(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  maxRetries: number = 3
): Promise<{ profile: Profile | null; error: LoginError | null }> {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('id, role, full_name, vehicle_number, car_type, station_id, phone, is_online, is_approved')
        .eq('id', userId)
        .single()
      
      if (error) {
        const mappedError = mapAuthError(error, 'queryProfileById')
        
        // If RLS blocked and we have retries left, wait and retry
        if (mappedError.code === 'PROFILE_RLS_BLOCKED' && i < maxRetries - 1) {
          const delay = 500 * (i + 1) // Linear backoff for RLS
          await new Promise(resolve => setTimeout(resolve, delay))
          continue
        }
        
        return { profile: null, error: mappedError }
      }
      
      if (profile) {
        return { profile: profile as Profile, error: null }
      }
      
      // Profile not found
      return {
        profile: null,
        error: {
          code: 'PROFILE_NOT_FOUND',
          message: 'Profile not found',
          retryable: false,
          hebrewMessage: 'לא נמצא פרופיל למשתמש זה. אנא פנה למנהל התחנה.'
        }
      }
    } catch (err: any) {
      if (i === maxRetries - 1) {
        return {
          profile: null,
          error: mapAuthError(err, 'queryProfileById')
        }
      }
      
      const delay = 500 * (i + 1)
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  return {
    profile: null,
    error: {
      code: 'PROFILE_NOT_FOUND',
      message: 'Profile query failed after retries',
      retryable: false,
      hebrewMessage: 'לא נמצא פרופיל למשתמש זה. אנא פנה למנהל התחנה.'
    }
  }
}

/**
 * Queries profile by phone number
 */
export async function queryProfileByPhone(
  supabase: ReturnType<typeof createClient>,
  phone: string
): Promise<{ profile: Profile | null; error: LoginError | null }> {
  try {
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, role, full_name, vehicle_number, car_type, station_id, phone, is_online, is_approved')
      .eq('phone', phone)
      .single()
    
    if (error) {
      return { profile: null, error: mapAuthError(error, 'queryProfileByPhone') }
    }
    
    return { profile: profile as Profile | null, error: null }
  } catch (err: any) {
    return { profile: null, error: mapAuthError(err, 'queryProfileByPhone') }
  }
}

/**
 * Links profile to auth user via API route
 */
export async function linkProfile(
  oldProfileId: string,
  newUserId: string,
  phone: string
): Promise<{ success: boolean; error: LoginError | null }> {
  try {
    const response = await fetch('/api/auth/link-profile', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        oldProfileId,
        newUserId,
        phone
      })
    })
    
    const result = await response.json()
    
    if (!response.ok || !result.success) {
      return {
        success: false,
        error: {
          code: 'PROFILE_LINK_FAILED',
          message: result.error || 'Profile linking failed',
          details: result,
          retryable: true,
          hebrewMessage: 'שגיאה בקישור הפרופיל. אנא נסה שוב.'
        }
      }
    }
    
    return { success: true, error: null }
  } catch (err: any) {
    return {
      success: false,
      error: mapAuthError(err, 'linkProfile')
    }
  }
}

/**
 * Validates profile has required fields
 */
export function validateProfile(profile: Profile | null): { valid: boolean; error: LoginError | null } {
  if (!profile) {
    return {
      valid: false,
      error: {
        code: 'PROFILE_NOT_FOUND',
        message: 'Profile is null',
        retryable: false,
        hebrewMessage: 'לא נמצא פרופיל למשתמש זה. אנא פנה למנהל התחנה.'
      }
    }
  }
  
  if (!profile.station_id) {
    return {
      valid: false,
      error: {
        code: 'STATION_ID_MISSING',
        message: 'Profile missing station_id',
        retryable: false,
        hebrewMessage: 'המשתמש לא משויך לתחנה. אנא פנה למנהל התחנה.'
      }
    }
  }
  
  return { valid: true, error: null }
}
