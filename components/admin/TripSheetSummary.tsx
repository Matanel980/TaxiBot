'use client'

import { Clock, MapPin } from 'lucide-react'
import type { Trip } from '@/lib/supabase'

interface TripSheetSummaryProps {
  pendingTrips: number
  activeTrips: number
  completedToday: number
}

export function TripSheetSummary({
  pendingTrips,
  activeTrips,
  completedToday,
}: TripSheetSummaryProps) {
  const totalActive = pendingTrips + activeTrips

  return (
    <div className="flex items-center justify-between text-right">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-3 justify-end">
          {pendingTrips > 0 && (
            <span className="text-sm font-semibold text-orange-400">
              {pendingTrips} ממתינות
            </span>
          )}
          {activeTrips > 0 && (
            <span className="text-sm font-semibold text-blue-400">
              {activeTrips} פעילות
            </span>
          )}
          {totalActive === 0 && (
            <span className="text-sm text-slate-400">אין נסיעות פעילות</span>
          )}
        </div>
      </div>
    </div>
  )
}
