'use client'

import { useState, useRef } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useMediaQuery } from '@/lib/hooks/useMediaQuery'
import { useStation } from '@/lib/hooks/useStation'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

interface NewTripModalProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function NewTripModal({ open, onOpenChange }: NewTripModalProps) {
  const [customerName, setCustomerName] = useState('')
  const [customerPhone, setCustomerPhone] = useState('')
  const [pickupAddress, setPickupAddress] = useState('')
  const [destinationAddress, setDestinationAddress] = useState('')
  const [price, setPrice] = useState('')
  const [saving, setSaving] = useState(false)
  const [geocoding, setGeocoding] = useState(false)
  const pickupTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const isMobile = useMediaQuery('(max-width: 768px)')
  const supabase = createClient()
  const router = useRouter()
  const { stationId } = useStation()

  // Geocode pickup address and detect zone
  const geocodePickupAddress = async (address: string) => {
    if (!address || address.length < 3) return null

    setGeocoding(true)
    try {
      const response = await fetch('/api/geocode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ address }),
      })

      if (!response.ok) {
        console.error('Geocoding failed:', await response.text())
        return null
      }

      const result = await response.json()
      return result
    } catch (error) {
      console.error('Geocoding error:', error)
      return null
    } finally {
      setGeocoding(false)
    }
  }

  // Detect zone for coordinates
  const detectZone = async (lat: number, lng: number) => {
    try {
      const response = await fetch('/api/zones/check-point', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ lat, lng }),
      })

      if (!response.ok) return null

      const result = await response.json()
      return result.zone?.id || null
    } catch (error) {
      console.error('Zone detection error:', error)
      return null
    }
  }

  // Geocode destination address
  const geocodeDestinationAddress = async (address: string) => {
    if (!address || address.length < 3) return null

    setGeocoding(true)
    try {
      const response = await fetch('/api/geocode', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ address }),
      })

      if (!response.ok) {
        console.error('Geocoding failed:', await response.text())
        return null
      }

      const result = await response.json()
      return result
    } catch (error) {
      console.error('Geocoding error:', error)
      return null
    } finally {
      setGeocoding(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      // MISSION-CRITICAL: Geocode BOTH pickup AND destination - NO TRIP WITHOUT COORDINATES
      let pickupLat: number | null = null
      let pickupLng: number | null = null
      let destinationLat: number | null = null
      let destinationLng: number | null = null
      let zoneId: string | null = null

      // Geocode pickup address (REQUIRED)
      if (!pickupAddress) {
        alert('כתובת איסוף היא חובה')
        setSaving(false)
        return
      }

      const pickupGeocodeResult = await geocodePickupAddress(pickupAddress)
      if (!pickupGeocodeResult || 'error' in pickupGeocodeResult) {
        alert(`שגיאה במיקום כתובת האיסוף: ${pickupGeocodeResult?.error || 'לא ניתן למצוא את המיקום'}`)
        setSaving(false)
        return
      }
      pickupLat = pickupGeocodeResult.lat
      pickupLng = pickupGeocodeResult.lng

      // Detect zone for pickup
      if (pickupLat && pickupLng) {
        zoneId = await detectZone(pickupLat, pickupLng)
      }

      // Geocode destination address (REQUIRED)
      if (!destinationAddress) {
        alert('כתובת יעד היא חובה')
        setSaving(false)
        return
      }

      const destinationGeocodeResult = await geocodeDestinationAddress(destinationAddress)
      if (!destinationGeocodeResult || 'error' in destinationGeocodeResult) {
        alert(`שגיאה במיקום כתובת היעד: ${destinationGeocodeResult?.error || 'לא ניתן למצוא את המיקום'}`)
        setSaving(false)
        return
      }
      destinationLat = destinationGeocodeResult.lat
      destinationLng = destinationGeocodeResult.lng

      // VALIDATE: Both coordinates must be present
      if (!pickupLat || !pickupLng || !destinationLat || !destinationLng) {
        alert('שגיאה: לא ניתן ליצור נסיעה ללא קואורדינטות מלאות')
        setSaving(false)
        return
      }

      // VALIDATE: Station ID must be present
      if (!stationId) {
        alert('שגיאה: לא ניתן ליצור נסיעה ללא תחנה. אנא פנה למנהל המערכת.')
        setSaving(false)
        return
      }

      const { data, error } = await supabase
        .from('trips')
        .insert({
          customer_phone: customerPhone,
          pickup_address: pickupAddress,
          destination_address: destinationAddress,
          status: 'pending',
          pickup_lat: pickupLat,
          pickup_lng: pickupLng,
          destination_lat: destinationLat,
          destination_lng: destinationLng,
          zone_id: zoneId,
          station_id: stationId, // AUTO-ASSIGN STATION
        })
        .select()
        .single()

      if (error) {
        console.error('Error creating trip:', error)
        alert(`שגיאה ביצירת נסיעה: ${error.message}`)
        return
      }

      // Reset form
      setCustomerName('')
      setCustomerPhone('')
      setPickupAddress('')
      setDestinationAddress('')
      setPrice('')
      onOpenChange(false)
      
      router.refresh()
    } catch (err: any) {
      console.error('Unexpected error:', err)
      alert(`שגיאה בלתי צפויה: ${err.message}`)
    } finally {
      setSaving(false)
      setGeocoding(false)
    }
  }

  const formContent = (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="customer_name">שם לקוח</Label>
        <Input
          id="customer_name"
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
          placeholder="שם הלקוח"
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="customer_phone">טלפון לקוח *</Label>
        <Input
          id="customer_phone"
          value={customerPhone}
          onChange={(e) => setCustomerPhone(e.target.value)}
          placeholder="+972501234567"
          required
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="pickup_address">כתובת איסוף *</Label>
        <Input
          id="pickup_address"
          value={pickupAddress}
          onChange={(e) => setPickupAddress(e.target.value)}
          placeholder="כתובת איסוף"
          required
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="destination_address">כתובת יעד *</Label>
        <Input
          id="destination_address"
          value={destinationAddress}
          onChange={(e) => setDestinationAddress(e.target.value)}
          placeholder="כתובת יעד"
          required
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="price">מחיר (אופציונלי)</Label>
        <Input
          id="price"
          type="number"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          placeholder="0"
          min="0"
          step="0.01"
        />
      </div>
      
      <div className="flex gap-2 justify-end pt-4">
        <Button
          type="button"
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={saving}
          className="flex-1 sm:flex-initial"
        >
          ביטול
        </Button>
        <Button
          type="submit"
          disabled={saving || geocoding || !customerPhone || !pickupAddress || !destinationAddress}
          className="flex-1 sm:flex-initial"
        >
          {saving || geocoding ? (geocoding ? 'מאתר מיקום...' : 'יוצר...') : 'צור נסיעה'}
        </Button>
      </div>
    </form>
  )

  if (isMobile) {
    return (
      <BottomSheet
        open={open}
        onOpenChange={onOpenChange}
        title="נסיעה חדשה"
        description="הזן פרטי נסיעה חדשה"
      >
        {formContent}
      </BottomSheet>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>נסיעה חדשה</DialogTitle>
          <DialogDescription>
            הזן פרטי נסיעה חדשה
          </DialogDescription>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  )
}
