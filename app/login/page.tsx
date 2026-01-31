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
    setErrorType(null)

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

      if (verifyError) {
        const { mapAuthError } = await import('@/lib/auth-utils')
        const authError = mapAuthError(verifyError, 'verifyOtp')
        console.error('[ERROR] OTP verification failed:', authError)
        setError(authError.hebrewMessage)
        setErrorType('auth')
        setLoading(false)
        return
      }

      // CRITICAL ARCHITECTURAL SHIFT: Token-First Verification
      // Bypass middleware and use server action for explicit session creation
      const user = verifyData.user
      const session = verifyData.session
      
      if (!user || !session) {
        console.error('[ERROR] Missing user or session after OTP verification')
        setError('שגיאה באימות - אנא נסה שוב')
        setErrorType('auth')
        setLoading(false)
        return
      }
      
      console.log('[DEBUG] User authenticated:', user.id, 'Auth phone:', user.phone, 'Formatted phone:', phone)
      console.log('[DEBUG] Session tokens available, calling createSession server action...')
      
      // CRITICAL: Use the phone from user object (matches auth.users format)
      // The server action will do format-agnostic comparison anyway
      // But using user.phone ensures consistency with what's stored in auth.users
      const phoneForSession = user.phone || phone
      
      // CRITICAL: Call server action to create session and verify/create profile
      // This happens in a single atomic transaction on the server
      const { createSession } = await import('@/app/actions/auth')
      
      const result = await createSession(
        session.access_token,
        session.refresh_token,
        user.id,
        phoneForSession // Use phone from user object if available
      )
      
      if (!result.success) {
        console.error('[ERROR] createSession failed:', result.error)
        setError(result.error?.hebrewMessage || 'שגיאה בשמירת ההתחברות - אנא נסה שוב')
        setErrorType(result.error?.code === 'STATION_ID_MISSING' ? 'station' : 'auth')
        setLoading(false)
        return
      }
      
      console.log('[DEBUG] Session created successfully, redirecting to:', result.redirectPath)
      
      // CRITICAL: Use hard navigation (window.location.href) instead of router.push()
      // This forces a full page reload and ensures new cookies are sent to middleware
      // window.location.replace() doesn't add to history, but window.location.href does
      // For login, we want href to allow back button to work if needed
      if (result.redirectPath) {
        // Show success message briefly, then hard navigate
        if (result.profile?.role === 'admin') {
          console.log('[DEBUG] ✅ Admin login successful, hard navigating to:', result.redirectPath)
        } else {
          console.log('[DEBUG] ✅ Driver login successful, hard navigating to:', result.redirectPath)
        }
        
        // CRITICAL: Hard navigation forces full page reload with new cookies
        // This breaks the login loop by ensuring middleware sees the new session
        window.location.href = result.redirectPath
      } else {
        setError('שגיאה בהפניה - אנא נסה שוב')
        setErrorType('auth')
      }
    } catch (err: any) {
      console.error('[ERROR] OTP verification failed:', err)
      const { mapAuthError } = await import('@/lib/auth-utils')
      const authError = mapAuthError(err, 'handleOtpSubmit')
      setError(authError.hebrewMessage)
      setErrorType('auth')
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

