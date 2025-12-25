'use client'

import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import type { Profile } from '@/lib/supabase'
import { Phone, Car, MapPin, Navigation, User, CheckCircle, XCircle } from 'lucide-react'

interface DriverDetailSheetProps {
  driver: Profile | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onAssignTrip?: (driverId: string) => void
  hasActiveTrip?: boolean
}

export function DriverDetailSheet({ driver, open, onOpenChange, onAssignTrip, hasActiveTrip = false }: DriverDetailSheetProps) {
  if (!driver) return null

  const getStatusColor = () => {
    if (!driver.is_online) return 'text-gray-500'
    if (hasActiveTrip) return 'text-red-500'
    return 'text-green-500'
  }

  const getStatusText = () => {
    if (!driver.is_online) return 'לא מחובר'
    if (hasActiveTrip) return 'בנסיעה'
    return 'זמין'
  }

  const getStatusIcon = () => {
    if (!driver.is_online) return <XCircle className="w-4 h-4" />
    if (hasActiveTrip) return <Car className="w-4 h-4" />
    return <CheckCircle className="w-4 h-4" />
  }

  return (
    <BottomSheet
      open={open}
      onOpenChange={onOpenChange}
      title="פרטי נהג"
      description="מידע ופעולות על הנהג"
    >
      <div className="space-y-6">
        {/* Driver Header */}
        <div className="flex items-center gap-4 pb-4 border-b border-gray-200">
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-2xl font-bold">
            {driver.full_name.charAt(0)}
          </div>
          <div className="flex-1">
            <h3 className="text-xl font-bold text-gray-900">{driver.full_name}</h3>
            <div className="flex items-center gap-2 mt-1">
              <div className={`w-2 h-2 rounded-full ${driver.is_online ? (hasActiveTrip ? 'bg-red-500' : 'bg-green-500') : 'bg-gray-400'}`} />
              <span className={`text-sm font-medium flex items-center gap-1 ${getStatusColor()}`}>
                {getStatusIcon()}
                {getStatusText()}
              </span>
            </div>
          </div>
        </div>

        {/* Driver Details */}
        <div className="space-y-4">
          {/* Phone */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <Phone className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <div className="text-xs text-gray-500">טלפון</div>
              <a href={`tel:${driver.phone}`} className="text-sm font-medium text-gray-900 hover:text-blue-600">
                {driver.phone}
              </a>
            </div>
          </div>

          {/* Vehicle Number */}
          {driver.vehicle_number && (
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-purple-100 flex items-center justify-center">
                <Car className="w-5 h-5 text-purple-600" />
              </div>
              <div className="flex-1">
                <div className="text-xs text-gray-500">מספר רכב</div>
                <div className="text-sm font-medium text-gray-900">{driver.vehicle_number}</div>
              </div>
            </div>
          )}

          {/* Location */}
          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
            <div className="w-10 h-10 rounded-full bg-green-100 flex items-center justify-center">
              <Navigation className="w-5 h-5 text-green-600" />
            </div>
            <div className="flex-1">
              <div className="text-xs text-gray-500">מיקום נוכחי</div>
              <div className="text-sm font-medium text-gray-900">
                {driver.current_address || `${driver.latitude?.toFixed(5)}, ${driver.longitude?.toFixed(5)}`}
              </div>
            </div>
          </div>

          {/* Current Zone */}
          {driver.current_zone && (
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center">
                <MapPin className="w-5 h-5 text-amber-600" />
              </div>
              <div className="flex-1">
                <div className="text-xs text-gray-500">אזור נוכחי</div>
                <div className="text-sm font-medium text-gray-900">באזור מוגדר</div>
              </div>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="space-y-3 pt-4 border-t border-gray-200">
          {onAssignTrip && driver.is_online && !hasActiveTrip && (
            <Button
              onClick={() => onAssignTrip(driver.id)}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg"
              size="lg"
            >
              <User className="ml-2" size={20} />
              שייך נסיעה
            </Button>
          )}
          
          {hasActiveTrip && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
              <div className="flex items-center gap-2 text-red-700">
                <Car className="w-5 h-5" />
                <span className="text-sm font-medium">הנהג כרגע בנסיעה פעילה</span>
              </div>
            </div>
          )}
          
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full"
          >
            סגור
          </Button>
        </div>
      </div>
    </BottomSheet>
  )
}

