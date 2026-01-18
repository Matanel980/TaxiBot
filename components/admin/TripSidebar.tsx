'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Trip } from '@/lib/supabase'
import { MapPin, Clock, User, Phone, Navigation } from 'lucide-react'
// Helper function to format time ago (fallback if date-fns not available)
const formatTimeAgo = (dateString: string): string => {
  try {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    
    if (diffMins < 1) return 'עכשיו'
    if (diffMins < 60) return `לפני ${diffMins} דקות`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `לפני ${diffHours} שעות`
    const diffDays = Math.floor(diffHours / 24)
    return `לפני ${diffDays} ימים`
  } catch {
    return ''
  }
}

interface TripSidebarProps {
  trips: Trip[]
  selectedTripId: string | null
  onTripSelect: (trip: Trip | null) => void
  onCancelTrip?: (tripId: string) => void
  onReassignTrip?: (tripId: string) => void
}

export function TripSidebar({ 
  trips, 
  selectedTripId, 
  onTripSelect,
  onCancelTrip,
  onReassignTrip 
}: TripSidebarProps) {
  // Group trips by status
  const pendingTrips = trips.filter(t => t.status === 'pending')
  const activeTrips = trips.filter(t => t.status === 'active')
  const completedTrips = trips.filter(t => t.status === 'completed').slice(0, 5) // Show last 5 completed

  const getStatusColor = (status: Trip['status']) => {
    switch (status) {
      case 'pending': return 'border-orange-500/50 bg-orange-500/10'
      case 'active': return 'border-blue-500/50 bg-blue-500/10'
      case 'completed': return 'border-slate-700/50 bg-slate-800/50'
      default: return 'border-slate-700/50 bg-slate-800/50'
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
    <div className="h-full bg-slate-900/95 backdrop-blur-sm border-l border-slate-800 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="h-14 border-b border-slate-800 flex items-center justify-between px-4">
        <h2 className="text-lg font-semibold text-white">נסיעות פעילות</h2>
        <span className="text-xs text-slate-400">{trips.filter(t => t.status !== 'completed').length}</span>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-4 space-y-4">
          {/* Active Trips */}
          {activeTrips.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase mb-2">פעילות</h3>
              <div className="space-y-2">
                {activeTrips.map((trip) => (
                  <TripCard
                    key={trip.id}
                    trip={trip}
                    isSelected={selectedTripId === trip.id}
                    onSelect={() => onTripSelect(trip)}
                    statusColor={getStatusColor(trip.status)}
                    statusText={getStatusText(trip.status)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Pending Trips */}
          {pendingTrips.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase mb-2">ממתינות</h3>
              <div className="space-y-2">
                {pendingTrips.map((trip) => (
                  <TripCard
                    key={trip.id}
                    trip={trip}
                    isSelected={selectedTripId === trip.id}
                    onSelect={() => onTripSelect(trip)}
                    statusColor={getStatusColor(trip.status)}
                    statusText={getStatusText(trip.status)}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Completed Trips (Last 5) */}
          {completedTrips.length > 0 && (
            <div>
              <h3 className="text-xs font-semibold text-slate-400 uppercase mb-2">הושלמו</h3>
              <div className="space-y-2">
                {completedTrips.map((trip) => (
                  <TripCard
                    key={trip.id}
                    trip={trip}
                    isSelected={selectedTripId === trip.id}
                    onSelect={() => onTripSelect(trip)}
                    statusColor={getStatusColor(trip.status)}
                    statusText={getStatusText(trip.status)}
                  />
                ))}
              </div>
            </div>
          )}

          {trips.length === 0 && (
            <div className="text-center py-12 text-slate-500">
              <MapPin className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="text-sm">אין נסיעות פעילות</p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

interface TripCardProps {
  trip: Trip
  isSelected: boolean
  onSelect: () => void
  statusColor: string
  statusText: string
}

function TripCard({ trip, isSelected, onSelect, statusColor, statusText }: TripCardProps) {
  const timeAgo = trip.created_at ? formatTimeAgo(trip.created_at) : ''

  return (
    <motion.div
      className={`cursor-pointer rounded-lg border-2 p-3 transition-all ${
        isSelected 
          ? 'border-blue-500 bg-blue-500/20 shadow-lg shadow-blue-500/20' 
          : `${statusColor} hover:border-slate-600`
      }`}
      onClick={onSelect}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
    >
      {/* Status Badge */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-slate-300">{statusText}</span>
        {timeAgo && (
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {timeAgo}
          </span>
        )}
      </div>

      {/* Pickup */}
      <div className="flex items-start gap-2 mb-2">
        <MapPin className="w-4 h-4 text-orange-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400">איסוף</p>
          <p className="text-sm font-medium text-white truncate">{trip.pickup_address}</p>
        </div>
      </div>

      {/* Destination */}
      <div className="flex items-start gap-2">
        <Navigation className="w-4 h-4 text-blue-400 mt-0.5 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-slate-400">יעד</p>
          <p className="text-sm font-medium text-white truncate">{trip.destination_address}</p>
        </div>
      </div>

      {/* Driver Info */}
      {trip.driver_id && (
        <div className="mt-2 pt-2 border-t border-slate-700/50">
          <div className="flex items-center gap-2">
            <User className="w-3 h-3 text-slate-400" />
            <span className="text-xs text-slate-400">נהג מוקצה</span>
          </div>
        </div>
      )}
    </motion.div>
  )
}

