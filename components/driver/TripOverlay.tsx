'use client'

import { useEffect, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SlideToAccept } from './SlideToAccept'
import { X, MapPin, Navigation } from 'lucide-react'
import type { Trip } from '@/lib/supabase'
import { useRealtimeTripStatus } from '@/lib/hooks/useRealtimeTripStatus'
import { playMissedTripSound } from '@/lib/audio-manager'

interface TripOverlayProps {
  trip: Trip | null
  onAccept: () => void
  onDismiss: () => void
  currentDriverId?: string | null // Current driver's ID to detect if trip was taken by another driver
}

export function TripOverlay({ trip, onAccept, onDismiss, currentDriverId }: TripOverlayProps) {
  // All hooks must be called at the top, before any conditional returns
  const [isUnavailable, setIsUnavailable] = useState(false)
  const [shouldDismiss, setShouldDismiss] = useState(false)

  // Monitor trip status in real-time - hook must be called unconditionally
  const { isUnavailable: tripUnavailable } = useRealtimeTripStatus({
    tripId: trip?.id || null,
    onStatusChange: (status, driverId) => {
      // If trip status changed to 'active' and it's not the current driver, it was taken
      if (status === 'active' && driverId && driverId !== currentDriverId) {
        setIsUnavailable(true)
        playMissedTripSound().catch(() => {})
        
        // Auto-dismiss after 2 seconds
        setTimeout(() => {
          setShouldDismiss(true)
          setTimeout(() => {
            onDismiss()
          }, 300) // Wait for animation
        }, 2000)
      }
    }
  })

  // Update unavailable state from hook - hook must be called unconditionally
  useEffect(() => {
    if (tripUnavailable && trip?.driver_id && trip.driver_id !== currentDriverId) {
      setIsUnavailable(true)
      playMissedTripSound().catch(() => {})
      
      setTimeout(() => {
        setShouldDismiss(true)
        setTimeout(() => {
          onDismiss()
        }, 300)
      }, 2000)
    }
  }, [tripUnavailable, trip?.driver_id, currentDriverId, onDismiss])

  // Early return AFTER all hooks - this is safe now
  if (!trip || shouldDismiss) return null

  return (
    <AnimatePresence onExitComplete={() => {}}>
      <motion.div
        className="fixed inset-0 bg-black/80 z-[9999] flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        style={{ pointerEvents: 'auto' }} // Ensure overlay receives events
        onClick={(e) => {
          // Only dismiss if clicking the background, not the card
          if (e.target === e.currentTarget) {
            onDismiss()
          }
        }}
      >
        <motion.div
          className="w-full max-w-md"
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.95, y: 10, opacity: 0 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          style={{ pointerEvents: 'auto' }} // Ensure card receives events
          onClick={(e) => e.stopPropagation()} // Prevent click from bubbling to overlay
        >
          <Card 
            className={`bg-slate-800 border-slate-700 ${
              isUnavailable ? 'border-red-500/50 bg-red-900/20' : ''
            }`}
            style={{ pointerEvents: 'auto' }} // Ensure card content is interactive
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className={`text-2xl ${
                  isUnavailable ? 'text-red-400' : 'text-taxi-yellow'
                }`}>
                  {isUnavailable ? 'נסיעה זו נלקחה' : 'נסיעה חדשה!'}
                </CardTitle>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onDismiss}
                  className="text-gray-400 hover:text-white"
                >
                  <X size={20} />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4" style={{ pointerEvents: 'auto' }}>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <MapPin className={`mt-1 ${isUnavailable ? 'text-red-400' : 'text-taxi-yellow'}`} size={20} />
                  <div>
                    <p className="text-sm text-gray-400">נקודת איסוף</p>
                    <p className="font-semibold">{trip?.pickup_address || ''}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Navigation className={`mt-1 ${isUnavailable ? 'text-red-400' : 'text-taxi-yellow'}`} size={20} />
                  <div>
                    <p className="text-sm text-gray-400">יעד</p>
                    <p className="font-semibold">{trip?.destination_address || ''}</p>
                  </div>
                </div>
                <div className="pt-4 border-t border-slate-700" style={{ pointerEvents: 'auto' }}>
                  <SlideToAccept 
                    onAccept={onAccept} 
                    disabled={isUnavailable}
                    tripUnavailable={isUnavailable}
                    key={trip?.id} // Force remount on new trip to reset state
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
