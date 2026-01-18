'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Phone, Lock } from 'lucide-react'
import { formatPhoneNumber } from '@/lib/toast-utils'
import { normalizeIsraeliPhone, extractPhoneDigits } from '@/lib/phone-utils'

type LoginErrorType = 'whitelist' | 'station' | 'auth' | 'format' | null

export default function LoginPage() {
  const [phone, setPhone] = useState('')
  const [otp, setOtp] = useState('')
  const [step, setStep] = useState<'phone' | 'otp'>('phone')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [errorType, setErrorType] = useState<LoginErrorType>(null)
  const router = useRouter()
  const supabase = createClient()

  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Use robust phone normalization utility
      let formattedPhone: string
      try {
        formattedPhone = normalizeIsraeliPhone(phone)
        console.log('[DEBUG] Login - Normalized phone:', formattedPhone)
        setErrorType(null)
      } catch (normalizeError: any) {
        setError(normalizeError.message || 'מספר טלפון לא תקין. אנא הזן מספר טלפון ישראלי (05X-XXXXXXX)')
        setErrorType('format')
        setLoading(false)
        return
      }

      // BULLETPROOF WHITELIST CHECK: Format-agnostic comparison
      // Extract digits from normalized phone for comparison
      const phoneDigits = extractPhoneDigits(formattedPhone)
      console.log('[DEBUG] Checking whitelist for digits:', phoneDigits, '(normalized:', formattedPhone, ')')
      
      // Fetch ALL profiles with station_id (RLS will filter by station)
      // Then compare digits client-side for format-agnostic matching
      const { data: profiles, error: profileError } = await supabase
        .from('profiles')
        .select('id, role, full_name, station_id, phone')
        .not('station_id', 'is', null) // Only users with station_id

      if (profileError) {
        console.error('[DEBUG] Whitelist query error:', profileError)
        setError('שגיאה בבדיקת הרשאות. אנא נסה שוב.')
        setErrorType('auth')
        setLoading(false)
        return
      }

      // Format-agnostic comparison: find profile by matching digits
      const profile = profiles?.find(p => {
        const profileDigits = extractPhoneDigits(p.phone || '')
        return profileDigits === phoneDigits
      })

      if (!profile) {
        console.log('[DEBUG] Whitelist check failed: No matching profile found')
        console.log('[DEBUG] Available profiles:', profiles?.map(p => ({ phone: p.phone, digits: extractPhoneDigits(p.phone || '') })))
        setError('המספר לא מורשה להתחברות. אנא פנה למנהל התחנה.')
        setErrorType('whitelist')
        setLoading(false)
        return
      }

      if (!profile.station_id) {
        console.log('[DEBUG] User has no station_id assigned')
        setError('המשתמש לא משויך לתחנה. אנא פנה למנהל התחנה.')
        setErrorType('station')
        setLoading(false)
        return
      }

      console.log('[DEBUG] Whitelist check passed for:', profile.full_name, 'Role:', profile.role, 'Station:', profile.station_id)

      // CRITICAL: Ensure auth.users phone matches profiles phone format
      // Use normalized E.164 format for Supabase Auth
      const { error: authError } = await supabase.auth.signInWithOtp({
        phone: formattedPhone, // E.164 format: +972XXXXXXXXX
        options: {
          channel: 'sms'
        }
      })

      // Handle Twilio errors gracefully for test numbers
      if (authError) {
        console.error('[DEBUG] Supabase Auth error:', authError)
        // Check for Twilio error code 20003 (Invalid phone number) or other Twilio errors
        const isTwilioError = authError.message?.includes('Twilio') || 
                              authError.message?.includes('invalid username') ||
                              authError.message?.includes('Authentication Error') ||
                              authError.message?.includes('20003') ||
                              authError.code === '20003'
        
        if (isTwilioError) {
          // In development/test mode, allow proceeding if phone matches test numbers
          const testPhones = ['+972509800301', '+972526099607'] // Add your test numbers
          
          if (testPhones.includes(formattedPhone)) {
            console.warn('[DEV] Twilio error but test phone detected, allowing OTP entry')
            console.log('[DEV] Test phones list:', testPhones)
            console.log('[DEV] Formatted phone:', formattedPhone)
            console.log('[DEV] Error details:', authError.message, 'Code:', authError.code)
            // Allow user to proceed to OTP screen
            setPhone(formattedPhone)
            setStep('otp')
            setErrorType(null)
            setLoading(false)
            return
          } else {
            // Real phone number but Twilio misconfigured or invalid
            if (authError.code === '20003' || authError.message?.includes('20003')) {
              setError('מספר הטלפון לא תקין. אנא בדוק את המספר והזן אותו מחדש.')
              setErrorType('format')
              setLoading(false)
              return
            }
            setError('שירות SMS לא זמין כרגע. אנא פנה למנהל המערכת.')
            setErrorType('auth')
            setLoading(false)
            return
          }
        }
        
        // For other errors, show auth error
        setError(authError.message || 'שגיאה בשליחת קוד אימות')
        setErrorType('auth')
        setLoading(false)
        return
      }

      // Store formatted phone for OTP verification
      setPhone(formattedPhone)
      setStep('otp')
      setErrorType(null)
    } catch (err: any) {
      console.error('Login error:', err)
      // Map common errors to Hebrew
      let errorMessage = err.message || 'שגיאה בשליחת קוד אימות'
      if (err.message?.includes('E.164') || err.message?.includes('invalid phone number format')) {
        errorMessage = 'מספר טלפון לא תקין. אנא הזן מספר טלפון ישראלי (05X-XXXXXXX)'
        setErrorType('format')
      } else if (err.message?.includes('rate limit')) {
        errorMessage = 'יותר מדי בקשות. אנא נסה שוב בעוד כמה דקות'
        setErrorType('auth')
      } else if (err.message?.includes('Twilio') || err.message?.includes('SMS')) {
        errorMessage = 'שירות SMS לא זמין כרגע. אנא פנה למנהל המערכת.'
        setErrorType('auth')
      } else {
        setErrorType('auth')
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
      console.log('[DEBUG] Verifying OTP for phone:', phone)
      
      // Phone is already formatted from previous step
      const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
        phone: phone, // Already formatted
        token: otp,
        type: 'sms'
      })

      console.log('[DEBUG] Verify OTP response:', { 
        hasSession: !!verifyData?.session, 
        hasUser: !!verifyData?.user,
        userId: verifyData?.user?.id,
        phone: verifyData?.user?.phone,
        error: verifyError 
      })

      if (verifyError) throw verifyError

      // CRITICAL: Wait for session to fully propagate
      await new Promise(resolve => setTimeout(resolve, 500))

      // Get fresh session
      const { data: { session } } = await supabase.auth.getSession()
      console.log('[DEBUG] Session after verification:', { 
        hasSession: !!session, 
        userId: session?.user?.id,
        phone: session?.user?.phone 
      })
      
      // DEBUG: Check browser cookies
      console.log('[DEBUG] Browser cookies:', document.cookie.split(';').map(c => c.trim().split('=')[0]))
      
      if (!session) {
        console.error('[ERROR] Session not persisted after OTP verification!')
        setError('שגיאה בשמירת ההתחברות - אנא נסה שוב')
        setLoading(false)
        return
      }

      const user = verifyData.user || session?.user
      
      if (user) {
        console.log('[DEBUG] User authenticated:', user.id, user.phone)
        
        // Find the pre-created profile by phone
        // CRITICAL: Include station_id for consistency with step 1 validation
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, role, full_name, vehicle_number, car_type, station_id')
          .eq('phone', phone)
          .single()
        
        if (profileError || !profile) {
          console.error('[ERROR] Profile not found for phone:', phone)
          setError('לא נמצא פרופיל למשתמש זה. אנא פנה למנהל התחנה.')
          setLoading(false)
          return
        }

        console.log('[DEBUG] Profile found:', profile)

        // Check if profile needs to be linked to auth user
        if (profile.id !== user.id) {
          console.log('[DEBUG] Profile ID mismatch. Old ID:', profile.id, 'New ID:', user.id)
          console.log('[DEBUG] Attempting to link profile via API route...')
          
          // Use API route with service role to properly migrate profile
          // (can't update primary key directly)
          const linkResponse = await fetch('/api/auth/link-profile', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              oldProfileId: profile.id,
              newUserId: user.id,
              phone: phone
            })
          })

          const linkResult = await linkResponse.json()

          if (!linkResponse.ok || !linkResult.success) {
            console.error('[ERROR] Failed to link profile to auth user:', linkResult.error)
            setError('שגיאה בקישור הפרופיל. אנא פנה למנהל התחנה.')
            setLoading(false)
            return
          }

          console.log('[DEBUG] Successfully linked profile to auth user via API')
          // Profile is now linked - continue with redirect below
        }

        // Get profile with correct ID (either already matched or newly linked)
        // CRITICAL: Include station_id for validation
        const { data: verifiedProfile, error: verifyError } = await supabase
          .from('profiles')
          .select('id, role, full_name, vehicle_number, car_type, station_id')
          .eq('id', user.id)
          .single()

        if (verifyError || !verifiedProfile) {
          console.error('[ERROR] Profile not found for user ID:', user.id)
          setError('שגיאה באימות הפרופיל. אנא פנה למנהל התחנה.')
          setLoading(false)
          return
        }

        // Validate station_id after linking (consistent with step 1 requirement)
        if (!verifiedProfile.station_id) {
          console.error('[ERROR] Profile missing station_id after linking:', verifiedProfile)
          setError('המשתמש לא משויך לתחנה. אנא פנה למנהל התחנה.')
          setErrorType('station')
          setLoading(false)
          return
        }

        // Use verified profile for redirect logic (has correct ID and station_id)
        const finalProfile = verifiedProfile

        // Redirect based on role (use finalProfile which has correct ID)
        if (finalProfile.role === 'admin') {
          console.log('[DEBUG] Admin login, redirecting to admin dashboard')
          alert('✅ התחברת בהצלחה כמנהל!')
          window.location.replace('/admin/dashboard')
        } else if (finalProfile.role === 'driver') {
          // Check if onboarding needed
          const isIncomplete = !finalProfile.vehicle_number || !finalProfile.car_type
          console.log('[DEBUG] Driver login, incomplete profile:', isIncomplete)
          
          alert('✅ התחברת בהצלחה כנהג!')
          if (isIncomplete) {
            window.location.replace('/onboarding')
          } else {
            window.location.replace('/driver/dashboard')
          }
        } else {
          setError('תפקיד לא תקין למשתמש זה')
        }
      } else {
        setError('שגיאה באימות - אנא נסה שוב')
      }
    } catch (err: any) {
      console.error('[ERROR] OTP verification failed:', err)
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
          <CardDescription className="text-sm sm:text-base">התחברות למערכת - נהגים מורשים בלבד</CardDescription>
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
                <div className="space-y-2">
                  <p className="text-sm text-red-500">{error}</p>
                  {/* Debug Status Indicator */}
                  {errorType && (
                    <div className="text-xs text-slate-500 bg-slate-100 dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-700">
                      <div className="font-semibold mb-1">סוג שגיאה:</div>
                      {errorType === 'whitelist' && (
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-red-500"></span>
                          <span>(A) משתמש לא ברשימת המורשים</span>
                        </div>
                      )}
                      {errorType === 'station' && (
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                          <span>(B) משתמש לא משויך לתחנה</span>
                        </div>
                      )}
                      {errorType === 'auth' && (
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                          <span>(C) שגיאת אימות Supabase</span>
                        </div>
                      )}
                      {errorType === 'format' && (
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                          <span>פורמט מספר טלפון לא תקין</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
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
                    setErrorType(null)
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

