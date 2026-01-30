'use client'

import { MapPin, Navigation, Circle } from 'lucide-react'
import type { Profile, Trip } from '@/lib/supabase'

interface DashboardSummaryProps {
  profile: Profile | null
  isOnline: boolean
  activeTrip: Trip | null
  queuePosition?: number
  totalInQueue?: number
}

export function DashboardSummary({
  profile,
  isOnline,
  activeTrip,
  queuePosition,
  totalInQueue,
}: DashboardSummaryProps) {
  // Count active trips
  const tripCount = activeTrip ? 1 : 0
  const tripText = tripCount === 1 ? 'נסיעה פעילה' : 'אין נסיעות פעילות'

  return (
    <div className="flex items-center justify-between text-right">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 justify-end mb-1">
          <Circle
            className={isOnline ? 'text-green-500 fill-green-500' : 'text-gray-500 fill-gray-500'}
            size={8}
          />
          <span className="text-sm font-semibold text-white truncate">
            {profile?.full_name || 'נהג'}
          </span>
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-400">
          {activeTrip && (
            <span className="flex items-center gap-1">
              <Navigation size={12} />
              {tripText}
            </span>
          )}
          {queuePosition && queuePosition > 0 && (
            <span>מיקום בתור: #{queuePosition}</span>
          )}
        </div>
      </div>
    </div>
  )
}
