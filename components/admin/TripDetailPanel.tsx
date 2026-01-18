'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Trip, Profile } from '@/lib/supabase'
import { X, Phone, User, MapPin, Navigation, Clock, AlertCircle, RotateCcw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface TripDetailPanelProps {
  trip: Trip | null
  driver: Profile | null
  onClose: () => void
  onCancel?: (tripId: string) => void
  onReassign?: (tripId: string) => void
  eta?: number // Estimated time in minutes
}

export function TripDetailPanel({ 
  trip, 
  driver, 
  onClose, 
  onCancel, 
  onReassign,
  eta 
}: TripDetailPanelProps) {
  if (!trip) return null

  const handleCall = (phone: string) => {
    window.location.href = `tel:${phone}`
  }

  const getStatusColor = (status: Trip['status']) => {
    switch (status) {
      case 'pending': return 'text-orange-400 bg-orange-500/10 border-orange-500/50'
      case 'active': return 'text-blue-400 bg-blue-500/10 border-blue-500/50'
      case 'completed': return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/50'
      default: return 'text-slate-400 bg-slate-800/50 border-slate-700/50'
    }
  }

  const getStatusText = (status: Trip['status']) => {
    switch (status) {
      case 'pending': return 'ממתינה'
      case 'active': return 'פעילה'
      case 'completed': return 'הושלמה'
      default: return status
    }
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="fixed bottom-6 left-1/2 transform -translate-x-1/2 w-full max-w-md z-50 px-4"
      >
        <div className="bg-slate-900/95 backdrop-blur-md border border-slate-800/50 rounded-xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className={`text-xs font-semibold px-2 py-1 rounded border ${getStatusColor(trip.status)}`}>
                {getStatusText(trip.status)}
              </span>
              {trip.id && (
                <span className="text-xs text-slate-500 font-mono">#{trip.id.slice(0, 8)}</span>
              )}
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-8 w-8 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {/* Customer Phone */}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">טלפון לקוח</label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleCall(trip.customer_phone)}
                className="w-full justify-start border-blue-500/50 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"
              >
                <Phone className="w-4 h-4 ml-2" />
                {trip.customer_phone}
              </Button>
            </div>

            {/* Driver Info */}
            {driver && (
              <div>
                <label className="text-xs text-slate-400 mb-1 block">נהג</label>
                <div className="flex items-center gap-2 text-base font-medium text-white">
                  <User className="w-4 h-4 text-slate-400" />
                  {driver.full_name}
                  {driver.vehicle_number && (
                    <span className="text-sm text-slate-400">({driver.vehicle_number})</span>
                  )}
                </div>
              </div>
            )}

            {/* ETA */}
            {eta !== undefined && trip.status === 'active' && (
              <div>
                <label className="text-xs text-slate-400 mb-1 block">זמן הגעה משוער</label>
                <div className="flex items-center gap-2 text-base font-semibold text-emerald-400">
                  <Clock className="w-4 h-4" />
                  {eta} דקות
                </div>
              </div>
            )}

            {/* Pickup Address */}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">נקודת איסוף</label>
              <div className="flex items-start gap-2">
                <MapPin className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm font-medium text-white">{trip.pickup_address}</p>
              </div>
            </div>

            {/* Destination Address */}
            <div>
              <label className="text-xs text-slate-400 mb-1 block">יעד</label>
              <div className="flex items-start gap-2">
                <Navigation className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
                <p className="text-sm font-medium text-white">{trip.destination_address}</p>
              </div>
            </div>

            {/* Actions */}
            {trip.status !== 'completed' && (
              <div className="pt-4 border-t border-slate-800 flex gap-2">
                {onCancel && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onCancel(trip.id)}
                    className="flex-1 border-red-500/50 text-red-400 hover:bg-red-500/10 hover:text-red-300"
                  >
                    <AlertCircle className="w-4 h-4 ml-2" />
                    ביטול
                  </Button>
                )}
                {onReassign && trip.status === 'pending' && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onReassign(trip.id)}
                    className="flex-1 border-blue-500/50 text-blue-400 hover:bg-blue-500/10 hover:text-blue-300"
                  >
                    <RotateCcw className="w-4 h-4 ml-2" />
                    הקצה מחדש
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  )
}

