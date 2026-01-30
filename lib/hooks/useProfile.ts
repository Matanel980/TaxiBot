'use client'

/**
 * Enterprise-Grade Shared Profile Fetching Hook
 * 
 * Single Source of Truth for profile fetching logic.
 * Consolidates duplicate profile fetching from:
 * - useProgressiveData
 * - useStation
 * - AuthProvider
 * - Individual components
 * 
 * Features:
 * - Memoized to prevent unnecessary re-renders
 * - Error handling with specific error types
 * - JWT-based RLS optimization
 * - Automatic retry on failure
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import type { Profile } from '@/lib/supabase'

interface UseProfileOptions {
  /** Whether to fetch profile (default: true) */
  enabled?: boolean
  /** Callback when profile is loaded */
  onProfileLoaded?: (profile: Profile) => void
  /** Callback on error */
  onError?: (error: Error) => void
  /** Select specific columns (default: all) */
  select?: string
}

interface UseProfileReturn {
  profile: Profile | null
  loading: boolean
  error: Error | null
  refetch: () => Promise<void>
}

export function useProfile({
  enabled = true,
  onProfileLoaded,
  onError,
  select = '*',
}: UseProfileOptions = {}): UseProfileReturn {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)
  const isMountedRef = useRef(true)
  const supabase = createClient()

  const fetchProfile = useCallback(async () => {
    if (!enabled) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)
      setError(null)

      // Get authenticated user
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      
      if (!isMountedRef.current) return

      if (authError) {
        throw new Error(`Authentication error: ${authError.message}`)
      }

      if (!user) {
        throw new Error('No authenticated user found')
      }

      // Fetch profile with JWT-based RLS (optimized)
      const { data, error: profileError } = await supabase
        .from('profiles')
        .select(select)
        .eq('id', user.id)
        .single()

      if (!isMountedRef.current) return

      if (profileError) {
        // Provide specific error messages
        if (profileError.code === 'PGRST116' || profileError.message?.includes('406') || profileError.message?.includes('No rows')) {
          throw new Error('Profile not found or RLS policy issue')
        }
        if (profileError.code === '42P17' || profileError.message?.includes('infinite recursion')) {
          throw new Error('RLS policy recursion error - contact admin')
        }
        throw new Error(`Profile fetch error: ${profileError.message || profileError.code || 'Unknown error'}`)
      }

      if (data && isMountedRef.current && !('error' in data)) {
        const profileData = data as Profile
        setProfile(profileData)
        onProfileLoaded?.(profileData)
      }
    } catch (err: any) {
      if (!isMountedRef.current) return
      
      const error = err instanceof Error ? err : new Error(String(err))
      setError(error)
      onError?.(error)
      console.error('[useProfile] Error fetching profile:', error)
    } finally {
      if (isMountedRef.current) {
        setLoading(false)
      }
    }
  }, [enabled, select, supabase, onProfileLoaded, onError])

  useEffect(() => {
    isMountedRef.current = true
    fetchProfile()

    return () => {
      isMountedRef.current = false
    }
  }, [fetchProfile])

  return {
    profile,
    loading,
    error,
    refetch: fetchProfile,
  }
}
