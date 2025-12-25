'use client'

import { useState } from 'react'
import { MapPin, X } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { AdminLiveMap } from '@/components/admin/AdminLiveMap'
import type { Profile } from '@/lib/supabase'

interface DriverLiveTrackProps {
  driver: Profile | null
  open: boolean
  onOpenChange: (open: boolean) => void
  allDrivers: Profile[]
}

export function DriverLiveTrack({ driver, open, onOpenChange, allDrivers }: DriverLiveTrackProps) {
  if (!driver) return null

  // Filter to show only the selected driver
  const trackedDrivers = allDrivers.filter(d => d.id === driver.id)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl h-[80vh] p-0">
        <DialogHeader className="p-6 pb-0">
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-right">מעקב חי: {driver.full_name}</DialogTitle>
              <p className="text-sm text-gray-500 mt-1 text-right">
                {driver.phone} • {driver.is_online ? 'פעיל' : 'לא פעיל'}
              </p>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-sm opacity-70 hover:opacity-100 transition-opacity"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </DialogHeader>
        
        <div className="flex-1 p-6 pt-4">
          {driver.latitude && driver.longitude ? (
            <div className="h-full rounded-lg overflow-hidden border border-gray-200">
              <AdminLiveMap drivers={trackedDrivers} className="h-full w-full" />
            </div>
          ) : (
            <div className="h-full flex items-center justify-center bg-gray-100 rounded-lg">
              <div className="text-center">
                <MapPin className="mx-auto text-gray-400 mb-2" size={48} />
                <p className="text-gray-500">אין מיקום זמין</p>
                <p className="text-sm text-gray-400 mt-1">
                  הנהג צריך להיות מחובר ולאפשר שיתוף מיקום
                </p>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

