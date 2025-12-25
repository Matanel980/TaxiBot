'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Phone, Lock } from 'lucide-react'
import { formatPhoneNumber } from '@/lib/toast-utils'

export default function LoginPage() {
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Force strictly E.164 format: +972 followed by digits, no double plus
      let sanitizedPhone = phone.trim().replace(/\D/g, '')
      if (sanitizedPhone.startsWith('0')) {
        sanitizedPhone = sanitizedPhone.substring(1)
      }
      if (sanitizedPhone.startsWith('972')) {
        sanitizedPhone = sanitizedPhone.substring(3)
      }
      const formattedPhone = `+972${sanitizedPhone}`
      
      if (!sanitizedPhone || sanitizedPhone.length < 8) {
        setError('מספר טלפון לא תקין. אנא הזן מספר טלפון ישראלי (05X-XXXXXXX)')
        setLoading(false)
        return
      }

      console.log('[DEBUG] Login - Strictly formatted:', formattedPhone)

      const { error } = await supabase.auth.signInWithOtp({
        phone: formattedPhone, // Use strictly formatted phone
        options: {
          channel: 'sms'
        }
      })

      // Handle Twilio errors gracefully for test numbers
      if (error) {
        // Check for Twilio error code 20003 (Invalid phone number) or other Twilio errors
        const isTwilioError = error.message?.includes('Twilio') || 
                              error.message?.includes('invalid username') ||
                              error.message?.includes('Authentication Error') ||
                              error.message?.includes('20003') ||
                              error.code === '20003'
        
        if (isTwilioError) {
          // In development/test mode, allow proceeding if phone matches test numbers
          const testPhones = ['+972509800301', '+972526099607'] // Add your test numbers
          
          if (testPhones.includes(formattedPhone)) {
            console.warn('[DEV] Twilio error but test phone detected, allowing OTP entry')
            console.log('[DEV] Test phones list:', testPhones)
            console.log('[DEV] Formatted phone:', formattedPhone)
            console.log('[DEV] Error details:', error.message, 'Code:', error.code)
            // Allow user to proceed to OTP screen
            setPhone(formattedPhone)
            setStep('otp')
            setLoading(false)
            return
          } else {
            // Real phone number but Twilio misconfigured or invalid
            if (error.code === '20003' || error.message?.includes('20003')) {
              throw new Error('מספר הטלפון לא תקין. אנא בדוק את המספר והזן אותו מחדש.')
            }
            throw new Error('שירות SMS לא זמין כרגע. אנא פנה למנהל המערכת.')
          }
        }
        
        // For other errors, throw normally
        throw error
      }

      // Store formatted phone for OTP verification
      setPhone(formattedPhone)
      setStep('otp')
    } catch (err: any) {
      console.error('Login error:', err)
      // Map common errors to Hebrew
      let errorMessage = err.message || 'שגיאה בשליחת קוד אימות'
      if (err.message?.includes('E.164') || err.message?.includes('invalid phone number format')) {
        errorMessage = 'מספר טלפון לא תקין. אנא הזן מספר טלפון ישראלי (05X-XXXXXXX)'
      } else if (err.message?.includes('rate limit')) {
        errorMessage = 'יותר מדי בקשות. אנא נסה שוב בעוד כמה דקות'
      } else if (err.message?.includes('Twilio') || err.message?.includes('SMS')) {
        errorMessage = 'שירות SMS לא זמין כרגע. אנא פנה למנהל המערכת.'
      }
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }

  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Phone is already formatted from previous step
      const { error } = await supabase.auth.verifyOtp({
        phone: phone, // Already formatted
        token: otp,
        type: 'sms'
      })

      if (error) throw error

      // Get user profile to determine role
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (profile?.role === 'driver') {
          router.push('/driver/dashboard')
        } else if (profile?.role === 'admin') {
          router.push('/admin/dashboard')
        } else {
          setError('לא נמצא תפקיד למשתמש זה')
        }
      }
    } catch (err: any) {
      console.error('OTP verification error:', err)
      setError(err.message || 'קוד אימות שגוי')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-deep-blue to-slate-800 p-4 sm:p-6">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl sm:text-3xl font-bold">TaxiFlow</CardTitle>
          <CardDescription className="text-sm sm:text-base">התחברות למערכת ניהול מוניות</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 'phone' ? (
            <form onSubmit={handlePhoneSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="phone" className="text-sm font-medium">
                  מספר טלפון
                </label>
                <div className="relative">
                  <Phone className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="050-1234567"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="pr-10 text-base sm:text-sm"
                    required
                  />
                </div>
              </div>
              {error && (
                <p className="text-sm text-red-500">{error}</p>
              )}
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'שולח...' : 'שלח קוד אימות'}
              </Button>
            </form>
          ) : (
            <form onSubmit={handleOtpSubmit} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="otp" className="text-sm font-medium">
                  קוד אימות
                </label>
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                  <Input
                    id="otp"
                    type="text"
                    placeholder="הזן קוד אימות"
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    className="pr-10 text-base sm:text-sm"
                    required
                    maxLength={6}
                  />
                </div>
              </div>
              {error && (
                <p className="text-sm text-red-500">{error}</p>
              )}
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setStep('phone')
                    setOtp('')
                    setError(null)
                  }}
                >
                  חזור
                </Button>
                <Button type="submit" className="flex-1" disabled={loading}>
                  {loading ? 'מאמת...' : 'אימות'}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

