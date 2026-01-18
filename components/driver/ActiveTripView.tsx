'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Phone, CheckCircle, MapPin, Navigation } from 'lucide-react'
import { motion } from 'framer-motion'
import type { Trip } from '@/lib/supabase'

interface ActiveTripViewProps {
  trip: Trip
  onStatusUpdate: (status: 'active' | 'completed') => void
}

type TripStep = 'arrived' | 'started' | 'completed'

export function ActiveTripView({ trip, onStatusUpdate }: ActiveTripViewProps) {
  const [currentStep, setCurrentStep] = useState<TripStep>('arrived')

  const steps: { key: TripStep; label: string; action: string }[] = [
    { key: 'arrived', label: 'הגעתי', action: 'התחל נסיעה' },
    { key: 'started', label: 'בנסיעה', action: 'סיים נסיעה' },
    { key: 'completed', label: 'הושלם', action: '' },
  ]

  const handleStepAction = () => {
    if (currentStep === 'arrived') {
      setCurrentStep('started')
      onStatusUpdate('active')
    } else if (currentStep === 'started') {
      setCurrentStep('completed')
      onStatusUpdate('completed')
    }
  }

  return (
    <div className="space-y-4">
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-6">
          <div className="space-y-4">
            <div className="h-48 bg-slate-700 rounded-lg flex items-center justify-center">
              <MapPin className="text-gray-500" size={48} />
              <p className="text-gray-500 mr-2">מפה</p>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-sm text-gray-400 mb-1">נקודת איסוף</p>
                <p className="font-semibold">{trip.pickup_address}</p>
              </div>
              <div>
                <p className="text-sm text-gray-400 mb-1">יעד</p>
                <p className="font-semibold">{trip.destination_address}</p>
              </div>
            </div>

            <div className="flex items-center gap-2 pt-4 border-t border-slate-700">
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => {
                  // Open Google Maps with directions to pickup address
                  const encodedAddress = encodeURIComponent(trip.pickup_address)
                  window.open(`https://www.google.com/maps/dir/?api=1&destination=${encodedAddress}`, '_blank')
                }}
              >
                <Navigation size={16} className="ml-2" />
                ניווט
              </Button>
              <Button
                variant="outline"
                className="flex-1"
                onClick={() => window.location.href = `tel:${trip.customer_phone}`}
              >
                <Phone size={16} className="ml-2" />
                התקשר ללקוח
              </Button>
            </div>

            <div className="pt-4 border-t border-slate-700">
              <div className="flex items-center justify-between mb-4">
                {steps.map((step, index) => (
                  <div key={step.key} className="flex items-center flex-1">
                    <div className="flex flex-col items-center flex-1">
                      <motion.div
                        className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          index <= steps.findIndex(s => s.key === currentStep)
                            ? 'bg-taxi-yellow text-black'
                            : 'bg-slate-700 text-gray-400'
                        }`}
                        initial={{ scale: 0.8 }}
                        animate={{ scale: 1 }}
                      >
                        {index < steps.findIndex(s => s.key === currentStep) ? (
                          <CheckCircle size={20} />
                        ) : (
                          <span>{index + 1}</span>
                        )}
                      </motion.div>
                      <span className="text-xs mt-2 text-center">{step.label}</span>
                    </div>
                    {index < steps.length - 1 && (
                      <div
                        className={`h-1 flex-1 mx-2 ${
                          index < steps.findIndex(s => s.key === currentStep)
                            ? 'bg-taxi-yellow'
                            : 'bg-slate-700'
                        }`}
                      />
                    )}
                  </div>
                ))}
              </div>

              {currentStep !== 'completed' && (
                <Button
                  onClick={handleStepAction}
                  className="w-full bg-taxi-yellow text-black hover:bg-yellow-400"
                >
                  {steps.find(s => s.key === currentStep)?.action}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}





