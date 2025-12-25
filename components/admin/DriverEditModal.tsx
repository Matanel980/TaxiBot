'use client'

import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { useMediaQuery } from '@/lib/hooks/useMediaQuery'
import { useToast } from '@/lib/hooks/useToast'
import { validatePhoneNumber, formatPhoneNumber } from '@/lib/toast-utils'
import type { Profile } from '@/lib/supabase'
import { AlertCircle } from 'lucide-react'

interface DriverEditModalProps {
  driver: Profile | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (driverId: string, data: { full_name: string; phone: string; vehicle_number?: string; car_type?: string; is_approved: boolean }) => Promise<void>
}

export function DriverEditModal({ driver, open, onOpenChange, onSave }: DriverEditModalProps) {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [vehicleNumber, setVehicleNumber] = useState('')
  const [carType, setCarType] = useState('')
  const [isApproved, setIsApproved] = useState(true)
  const [saving, setSaving] = useState(false)
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const isMobile = useMediaQuery('(max-width: 768px)')
  const toast = useToast()

  useEffect(() => {
    if (driver) {
      setFullName(driver.full_name || '')
      setPhone(driver.phone || '')
      setIsApproved((driver as any).is_approved !== false)
      setVehicleNumber(driver.vehicle_number || '')
      setCarType((driver as any).car_type || '')
      setPhoneError(null)
    }
  }, [driver])

  // Validate phone number on change
  const handlePhoneChange = (value: string) => {
    setPhone(value)
    setPhoneError(null)
  }

  // Validate phone on blur
  const handlePhoneBlur = () => {
    if (phone.trim()) {
      const validation = validatePhoneNumber(phone)
      setPhoneError(validation.valid ? null : validation.error || null)
    }
  }

  const isNew = driver?.id === 'new'

  // Helper function to check if form is valid
  const isFormValid = () => {
    if (!fullName.trim()) return false
    if (!phone.trim()) return false
    return true
  }

  const handleSave = async () => {
    if (!driver) return
    
    // Debug: Log form data before validation
    const formData = {
      fullName: fullName.trim(),
      phone: phone.trim(),
      vehicleNumber: vehicleNumber.trim(),
      carType: carType.trim(),
      isNew,
      isApproved
    }
    console.log('Form Data:', formData)
    
    // Validate required fields with field-specific error messages
    if (!fullName.trim()) {
      toast.error('שדה שם מלא נדרש')
      return
    }
    
    // Validate phone - check trimmed value
    const phoneTrimmed = phone.trim()
    if (!phoneTrimmed) {
      toast.error('שדה טלפון נדרש')
      return
    }
    
    // Sanitize and validate phone
    const phoneValidation = validatePhoneNumber(phoneTrimmed)
    if (!phoneValidation.valid) {
      setPhoneError(phoneValidation.error || null)
      toast.error(phoneValidation.error || 'שדה טלפון אינו תקין')
      return
    }
    
    setSaving(true)
    try {
      const formattedPhone = formatPhoneNumber(phoneTrimmed)
      
      await onSave(driver.id, {
        full_name: fullName.trim(),
        phone: formattedPhone,
        vehicle_number: vehicleNumber.trim() || undefined,
        car_type: carType.trim() || undefined,
        is_approved: isApproved,
      })
      
      // Show success toast
      toast.success(isNew ? 'הנהג נוסף בהצלחה! הוא יכול כעת להתחבר למערכת.' : 'הנהג עודכן בהצלחה!')
      
      onOpenChange(false)
    } catch (error: any) {
      console.error('Error saving driver:', error)
      toast.error(error.message || 'שגיאה בשמירת הנהג')
    } finally {
      setSaving(false)
    }
  }

  const content = (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="fullName">שם מלא *</Label>
        <Input
          id="fullName"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="הזן שם מלא"
          className="text-right"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="phone">טלפון *</Label>
        <Input
          id="phone"
          type="tel"
          value={phone}
          onChange={(e) => handlePhoneChange(e.target.value)}
          onBlur={handlePhoneBlur}
          placeholder="05X-XXXXXXX"
          className="text-right"
          disabled={!isNew} // Can't change phone for existing drivers
        />
        {phoneError && (
          <div className="flex items-center gap-2 text-red-500 text-sm">
            <AlertCircle size={16} />
            <span>{phoneError}</span>
          </div>
        )}
        {!isNew && (
          <p className="text-xs text-gray-500">לא ניתן לשנות מספר טלפון לנהג קיים</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="vehicleNumber">מספר רכב</Label>
        <Input
          id="vehicleNumber"
          value={vehicleNumber}
          onChange={(e) => setVehicleNumber(e.target.value)}
          placeholder="12-345-67"
          className="text-right"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="carType">סוג רכב</Label>
        <Input
          id="carType"
          value={carType}
          onChange={(e) => setCarType(e.target.value)}
          placeholder="למשל: טויוטה קורולה"
          className="text-right"
        />
      </div>

      <div className="flex items-center justify-between p-4 border rounded-lg">
        <Label htmlFor="isApproved" className="cursor-pointer">
          מאושר לעבודה
        </Label>
        <Switch
          id="isApproved"
          checked={isApproved}
          onCheckedChange={setIsApproved}
        />
      </div>

      {isNew && (
        <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-sm text-blue-800">
            <strong>שימו לב:</strong> לאחר יצירת הנהג, הוא יוכל להתחבר למערכת באמצעות מספר הטלפון וקוד SMS.
          </p>
        </div>
      )}

      <div className="flex gap-2 pt-4">
        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={saving}
          className="flex-1"
        >
          ביטול
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving || !isFormValid()}
          className="flex-1"
        >
          {saving ? 'שומר...' : isNew ? 'הוסף נהג' : 'שמור שינויים'}
        </Button>
      </div>
    </div>
  )

  if (isMobile) {
    return (
      <BottomSheet
        open={open}
        onOpenChange={onOpenChange}
        title={isNew ? 'הוסף נהג חדש' : 'ערוך נהג'}
      >
        {content}
      </BottomSheet>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{isNew ? 'הוסף נהג חדש' : 'ערוך נהג'}</DialogTitle>
          <DialogDescription>
            {isNew 
              ? 'הזן את פרטי הנהג החדש. לאחר היצירה, הנהג יוכל להתחבר באמצעות מספר הטלפון.'
              : 'ערוך את פרטי הנהג'}
          </DialogDescription>
        </DialogHeader>
        {content}
      </DialogContent>
    </Dialog>
  )
}
