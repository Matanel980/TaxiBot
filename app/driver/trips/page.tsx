'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { MapPin } from 'lucide-react'
import type { Trip } from '@/lib/supabase'

export default function DriverTripsPage() {
  const [trips, setTrips] = useState<Trip[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const fetchTrips = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user) {
        const { data, error: tripsError } = await supabase
          .from('trips')
          .select('id, customer_phone, pickup_address, destination_address, status, driver_id, created_at, updated_at')
          .eq('driver_id', user.id)
          .order('created_at', { ascending: false })
          .limit(20)

        if (tripsError) {
          console.error('[Driver Trips] Error fetching trips:', tripsError)
          if (tripsError.message?.includes('406') || tripsError.message?.includes('Not Acceptable')) {
            console.error('[Driver Trips] 406 Error - Attempting fallback...')
            // Try fallback
            const { data: fallbackData } = await supabase
              .from('trips')
              .select('id, status, driver_id, created_at')
              .eq('driver_id', user.id)
              .order('created_at', { ascending: false })
              .limit(20)
            
            if (fallbackData) {
              const mappedTrips = fallbackData.map((t: any) => ({
                ...t,
                customer_phone: '',
                pickup_address: '',
                destination_address: '',
                updated_at: t.created_at || new Date().toISOString()
              })) as Trip[]
              setTrips(mappedTrips)
            } else {
              setTrips([])
            }
          } else {
            setTrips([])
          }
        }

        if (data) {
          setTrips(data as Trip[])
        }
      }
      
      setLoading(false)
    }

    fetchTrips()
  }, [supabase])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>טוען...</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold mb-4">נסיעות שלי</h1>
      
      {trips.length === 0 ? (
        <Card className="bg-slate-800 border-slate-700">
          <CardContent className="p-6 text-center">
            <p className="text-gray-400">אין נסיעות עדיין</p>
          </CardContent>
        </Card>
      ) : (
        trips.map((trip) => (
          <Card key={trip.id} className="bg-slate-800 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <Badge
                  variant={
                    trip.status === 'completed' ? 'default' :
                    trip.status === 'active' ? 'secondary' : 'outline'
                  }
                >
                  {trip.status === 'pending' ? 'ממתין' :
                   trip.status === 'active' ? 'פעיל' : 'הושלם'}
                </Badge>
                <span className="text-xs text-gray-400">
                  {new Date(trip.created_at).toLocaleDateString('he-IL')}
                </span>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <MapPin size={16} className="text-taxi-yellow mt-1" />
                  <div className="flex-1">
                    <p className="text-xs text-gray-400">מ</p>
                    <p className="text-sm">{trip.pickup_address}</p>
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <MapPin size={16} className="text-gray-400 mt-1" />
                  <div className="flex-1">
                    <p className="text-xs text-gray-400">אל</p>
                    <p className="text-sm">{trip.destination_address}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  )
}


