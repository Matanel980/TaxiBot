'use client'

import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useMediaQuery } from '@/lib/hooks/useMediaQuery'
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
  const isMobile = useMediaQuery('(max-width: 768px)')
  const supabase = createClient()
  const router = useRouter()

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)

    try {
      const { data, error } = await supabase
        .from('trips')
        .insert({
          customer_phone: customerPhone,
          pickup_address: pickupAddress,
          destination_address: destinationAddress,
          status: 'pending',
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
          disabled={saving || !customerPhone || !pickupAddress || !destinationAddress}
          className="flex-1 sm:flex-initial"
        >
          {saving ? 'יוצר...' : 'צור נסיעה'}
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
