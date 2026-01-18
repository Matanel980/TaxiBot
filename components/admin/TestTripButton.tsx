'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase'
import { useStation } from '@/lib/hooks/useStation'
import { toast } from 'sonner'
import { MapPin, CheckCircle2 } from 'lucide-react'

/**
 * Test Trip Creation Button
 * Creates a trip with pre-calculated coordinates (no geocoding)
 * Perfect for testing route visualization
 */
export function TestTripButton() {
  const [creating, setCreating] = useState(false)
  const supabase = createClient()
  const { stationId } = useStation()

  const createTestTrip = async () => {
    if (!stationId) {
      toast.error('שגיאה', {
        description: 'לא ניתן ליצור נסיעת בדיקה ללא תחנה. אנא פנה למנהל המערכת.',
      })
      return
    }

    setCreating(true)
    
    try {
      // Pre-calculated coordinates for Acre, Israel (test area)
      // Pickup: Acre city center
      const pickupLat = 32.9270
      const pickupLng = 35.0830
      
      // Destination: Haifa (nearby city for realistic route)
      const destinationLat = 32.7940
      const destinationLng = 35.0520

      // Create trip with ALL coordinates pre-calculated - STATION-AWARE
      const { data: trip, error } = await supabase
        .from('trips')
        .insert({
          customer_phone: '+972501234567',
          pickup_address: 'עכו, רחוב ויצמן 1', // Acre, Weizmann St 1
          destination_address: 'חיפה, שדרות הנשיא 1', // Haifa, President Ave 1
          status: 'pending',
          pickup_lat: pickupLat,
          pickup_lng: pickupLng,
          destination_lat: destinationLat,
          destination_lng: destinationLng,
          zone_id: null, // Will be auto-detected if zone detection is enabled
          station_id: stationId, // AUTO-ASSIGN STATION
        })
        .select()
        .single()

      if (error) {
        console.error('[TestTrip] Error creating trip:', error)
        toast.error('שגיאה', {
          description: `לא ניתן ליצור נסיעת בדיקה: ${error.message}`,
        })
        return
      }

      console.log('[TestTrip] ✅ Test trip created successfully:', trip)
      toast.success('נסיעת בדיקה נוצרה', {
        description: `נסיעה #${trip.id.substring(0, 8)} עם קואורדינטות מלאות`,
      })
    } catch (error: any) {
      console.error('[TestTrip] Unexpected error:', error)
      toast.error('שגיאה', {
        description: `שגיאה בלתי צפויה: ${error.message}`,
      })
    } finally {
      setCreating(false)
    }
  }

  return (
    <Button
      onClick={createTestTrip}
      disabled={creating}
      variant="outline"
      size="sm"
      className="gap-2"
    >
      {creating ? (
        <>
          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
          יוצר נסיעת בדיקה...
        </>
      ) : (
        <>
          <MapPin className="w-4 h-4" />
          צור נסיעת בדיקה
        </>
      )}
    </Button>
  )
}

