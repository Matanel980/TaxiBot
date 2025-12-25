'use client'

import { motion, AnimatePresence } from 'framer-motion'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SlideToAccept } from './SlideToAccept'
import { X, MapPin, Navigation } from 'lucide-react'
import type { Trip } from '@/lib/supabase'

interface TripOverlayProps {
  trip: Trip | null
  onAccept: () => void
  onDismiss: () => void
}

export function TripOverlay({ trip, onAccept, onDismiss }: TripOverlayProps) {
  if (!trip) return null

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <motion.div
          className="w-full max-w-md"
          initial={{ scale: 0.9, y: 20 }}
          animate={{ scale: 1, y: 0 }}
          exit={{ scale: 0.9, y: 20 }}
        >
          <Card className="bg-slate-800 border-slate-700">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-2xl text-taxi-yellow">נסיעה חדשה!</CardTitle>
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
            <CardContent className="space-y-4">
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <MapPin className="text-taxi-yellow mt-1" size={20} />
                  <div>
                    <p className="text-sm text-gray-400">נקודת איסוף</p>
                    <p className="font-semibold">{trip.pickup_address}</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Navigation className="text-taxi-yellow mt-1" size={20} />
                  <div>
                    <p className="text-sm text-gray-400">יעד</p>
                    <p className="font-semibold">{trip.destination_address}</p>
                  </div>
                </div>
                <div className="pt-4 border-t border-slate-700">
                  <SlideToAccept onAccept={onAccept} />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}


