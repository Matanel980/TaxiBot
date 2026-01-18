'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

/**
 * Hook to get current user's station_id
 * Returns null if user is not assigned to a station
 */
export function useStation() {
  const [stationId, setStationId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    const fetchStationId = async () => {
      try {
        setLoading(true)
        setError(null)

        // Get current user
        const { data: { user }, error: authError } = await supabase.auth.getUser()
        
        if (authError || !user) {
          setStationId(null)
          setLoading(false)
          return
        }

        // Get user's profile with station_id
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('station_id')
          .eq('id', user.id)
          .single()

        if (profileError) {
          console.error('[useStation] Error fetching station_id:', profileError)
          setError(profileError.message)
          setStationId(null)
        } else {
          setStationId(profile?.station_id || null)
        }
      } catch (err: any) {
        console.error('[useStation] Unexpected error:', err)
        setError(err.message || 'Unknown error')
        setStationId(null)
      } finally {
        setLoading(false)
      }
    }

    fetchStationId()

    // Subscribe to profile changes to update station_id if it changes
    const channel = supabase
      .channel('station-updates')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
        },
        async (payload) => {
          // Check if this is the current user's profile
          const { data: { user } } = await supabase.auth.getUser()
          if (user && payload.new.id === user.id) {
            setStationId((payload.new as any).station_id || null)
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  return { stationId, loading, error }
}

