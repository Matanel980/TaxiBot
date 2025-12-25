'use client'

import { AdminLiveMap } from './AdminLiveMap'
import type { Profile } from '@/lib/supabase'

interface LiveMapProps {
  drivers: Profile[]
}

// Re-export AdminLiveMap for backward compatibility
export function LiveMap({ drivers }: LiveMapProps) {
  return <AdminLiveMap drivers={drivers} />
}

