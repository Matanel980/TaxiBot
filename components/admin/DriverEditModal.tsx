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
import { validatePhoneNumber, validateEmail, formatPhoneNumber } from '@/lib/toast-utils'
import type { Profile } from '@/lib/supabase'
import { AlertCircle } from 'lucide-react'

interface DriverEditModalProps {
  driver: Profile | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSave: (driverId: string, data: { full_name: string; phone: string; email?: string; password?: string; vehicle_number?: string; is_approved: boolean }) => Promise<void>
}

export function DriverEditModal({ driver, open, onOpenChange, onSave }: DriverEditModalProps) {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [vehicleNumber, setVehicleNumber] = useState('')
  const [isApproved, setIsApproved] = useState(true)
  const [saving, setSaving] = useState(false)
  const [phoneError, setPhoneError] = useState<string | null>(null)
  const [emailError, setEmailError] = useState<string | null>(null)
  const isMobile = useMediaQuery('(max-width: 768px)')
  const toast = useToast()

  useEffect(() => {
    if (driver) {
      setFullName(driver.full_name)
      setPhone(driver.phone)
      setIsApproved((driver as any).is_approved !== false)
      setVehicleNumber(driver.vehicle_number || '')
      setEmail('')
      setPassword('')
      setPhoneError(null)
      setEmailError(null)
    }
  }, [driver])

  // Validate phone number on change - don't show error while typing, only on blur
  const handlePhoneChange = (value: string) => {
    setPhone(value)
    // Clear error while typing - validation will happen on blur or submit
    setPhoneError(null)
  }

  // Validate phone on blur (when user leaves the field)
  const handlePhoneBlur = () => {
    if (phone.trim()) {
      const validation = validatePhoneNumber(phone)
      setPhoneError(validation.valid ? null : validation.error || null)
    }
  }

  // Validate email on change
  const handleEmailChange = (value: string) => {
    setEmail(value)
    if (value) {
      const validation = validateEmail(value)
      setEmailError(validation.valid ? null : validation.error || null)
    } else {
      setEmailError(null)
    }
  }

  // Helper function to check if form is valid (for button disabled state)
  const isFormValid = () => {
    if (!fullName.trim()) return false
    if (!phone.trim()) return false
    
    // For new drivers, check email and password
    if (isNew) {
      if (!email.trim()) return false
      if (!password || password.length < 6) return false
    }
    
    // Don't block on validation errors - let handleSave show specific errors
    return true
  }

  const handleSave = async () => {
    if (!driver) return
    
    const isNew = driver.id === 'new'
    
    // Debug: Log form data before validation
    const formData = {
      fullName: fullName.trim(),
      phone: phone.trim(),
      email: email.trim(),
      password: password ? '***' : '',
      passwordLength: password?.length || 0,
      vehicleNumber: vehicleNumber.trim(),
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
    
    // Validate email and password for new drivers
    if (isNew) {
      const emailTrimmed = email.trim()
      if (!emailTrimmed) {
        toast.error('שדה אימייל נדרש')
        return
      }
      const emailValidation = validateEmail(emailTrimmed)
      if (!emailValidation.valid) {
        setEmailError(emailValidation.error || null)
        toast.error(emailValidation.error || 'שדה אימייל אינו תקין')
        return
      }
      if (!password || password.length < 6) {
        toast.error('שדה סיסמה חייב להכיל לפחות 6 תווים')
        return
      }
    }
    
    setSaving(true)
    try {
      // Format phone number to E.164 format (always +972...)
      const formattedPhone = formatPhoneNumber(phoneTrimmed)
      console.log('Formatted phone:', formattedPhone, 'from:', phoneTrimmed)
      
      // Final check: ensure E.164 format before sending
      if (!formattedPhone || !formattedPhone.startsWith('+972')) {
        const errorMsg = 'מספר טלפון לא תקין. אנא הזן מספר טלפון ישראלי (05X-XXXXXXX)'
        toast.error(errorMsg)
        setPhoneError(errorMsg)
        setSaving(false)
        return
      }
      
      await onSave(isNew ? 'new' : driver.id, {
        full_name: fullName.trim(),
        phone: formattedPhone,
        email: isNew ? email.trim() : undefined,
        password: isNew ? password : undefined,
        vehicle_number: vehicleNumber.trim() || undefined,
        is_approved: isApproved,
      })
      toast.success(isNew ? 'הנהג נוצר בהצלחה! 🎉' : 'פרטי הנהג עודכנו בהצלחה!')
      onOpenChange(false)
    } catch (error: any) {
      console.error('Error saving driver:', error)
      toast.error(error)
    } finally {
      setSaving(false)
    }
  }

  if (!driver) return null

  const isNew = driver.id === 'new'

  const formContent = (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="full_name">שם מלא *</Label>
        <Input
          id="full_name"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="שם מלא"
          required
        />
      </div>
      
      <div className="space-y-2">
        <Label htmlFor="phone">טלפון *</Label>
        <div className="relative">
          <Input
            id="phone"
            value={phone}
            onChange={(e) => handlePhoneChange(e.target.value)}
            onBlur={handlePhoneBlur}
            placeholder="050-1234567"
            required
            className={phoneError ? 'border-red-500 focus:border-red-500' : ''}
          />
          {phoneError && (
            <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-red-500 text-xs">
              <AlertCircle size={14} />
            </div>
          )}
        </div>
        {phoneError && (
          <div className="text-xs text-red-500 flex items-center gap-1">
            <AlertCircle size={12} />
            {phoneError}
          </div>
        )}
      </div>
      
      {isNew && (
        <>
          <div className="space-y-2">
            <Label htmlFor="email">אימייל *</Label>
            <div className="relative">
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => handleEmailChange(e.target.value)}
                placeholder="driver@example.com"
                required
                className={emailError ? 'border-red-500 focus:border-red-500' : ''}
              />
              {emailError && (
                <div className="absolute left-2 top-1/2 -translate-y-1/2 flex items-center gap-1 text-red-500 text-xs">
                  <AlertCircle size={14} />
                </div>
              )}
            </div>
            {emailError && (
              <div className="text-xs text-red-500 flex items-center gap-1">
                <AlertCircle size={12} />
                {emailError}
              </div>
            )}
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="password">סיסמה *</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="מינימום 6 תווים"
              required
              minLength={6}
            />
            <div className="text-xs text-gray-500">
              הסיסמה תשמש להתחברות של הנהג
            </div>
          </div>
        </>
      )}
      
      <div className="space-y-2">
        <Label htmlFor="vehicle_number">מספר רכב</Label>
        <Input
          id="vehicle_number"
          value={vehicleNumber}
          onChange={(e) => setVehicleNumber(e.target.value)}
          placeholder="123-45-678"
        />
      </div>
      
      <div className="flex items-center justify-between pt-2">
        <Label htmlFor="is_approved">נהג מאושר</Label>
        <Switch
          id="is_approved"
          checked={isApproved}
          onCheckedChange={setIsApproved}
        />
      </div>
      
      <div className="flex gap-2 justify-end pt-4">
        <Button
          variant="outline"
          onClick={() => onOpenChange(false)}
          disabled={saving}
          className="flex-1 sm:flex-initial"
        >
          ביטול
        </Button>
        <Button
          onClick={handleSave}
          disabled={saving || !isFormValid()}
          className="flex-1 sm:flex-initial"
        >
          {saving ? 'שומר...' : 'שמור'}
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
        description={isNew ? 'הזן פרטי נהג חדש' : 'עדכן את פרטי הנהג'}
      >
        {formContent}
      </BottomSheet>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isNew ? 'הוסף נהג חדש' : 'ערוך נהג'}</DialogTitle>
          <DialogDescription>
            {isNew ? 'הזן פרטי נהג חדש' : 'עדכן את פרטי הנהג'}
          </DialogDescription>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  )
}
