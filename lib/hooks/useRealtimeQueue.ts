'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Profile } from '@/lib/supabase'

interface UseRealtimeQueueOptions {
  zoneId: string | null
  driverId: string
}

export function useRealtimeQueue({ zoneId, driverId }: UseRealtimeQueueOptions) {
  const [queuePosition, setQueuePosition] = useState<number>(0)
  const [totalInQueue, setTotalInQueue] = useState<number>(0)
  const supabase = createClient()

  useEffect(() => {
    if (!zoneId) {
      setQueuePosition(0)
      setTotalInQueue(0)
      return
    }

    const calculateQueuePosition = async () => {
      const { data: drivers, error } = await supabase
        .from('profiles')
        .select('id, is_online, updated_at')
        .eq('current_zone', zoneId)
        .eq('role', 'driver')
        .eq('is_online', true)
        .order('updated_at', { ascending: true })

      if (error) {
        console.error('Error fetching queue:', error)
        return
      }

      if (!drivers) {
        setQueuePosition(0)
        setTotalInQueue(0)
        return
      }

      const position = drivers.findIndex(d => d.id === driverId) + 1
      setQueuePosition(position > 0 ? position : 0)
      setTotalInQueue(drivers.length)
    }

    // Initial calculation
    calculateQueuePosition()

    // Subscribe to changes
    const channel = supabase
      .channel('driver-queue')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `current_zone=eq.${zoneId}`
        },
        () => {
          calculateQueuePosition()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [zoneId, driverId, supabase])

  return { queuePosition, totalInQueue }
}


