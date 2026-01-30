'use client'

// Force dynamic rendering - prevent static generation and caching
export const dynamic = 'force-dynamic'

import { useEffect, useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { useGeolocation } from '@/lib/hooks/useGeolocation'
import { useRealtimeQueue } from '@/lib/hooks/useRealtimeQueue'
import { useRealtimeTrips } from '@/lib/hooks/useRealtimeTrips'
import { usePushNotifications } from '@/lib/hooks/usePushNotifications'
import { useNetworkStatus } from '@/lib/hooks/useNetworkStatus'
import { useProgressiveData } from '@/lib/hooks/useProgressiveData'
import { SwipeToGoOnline } from '@/components/driver/SwipeToGoOnline'
import { QueueCard } from '@/components/driver/QueueCard'
import { TripOverlay } from '@/components/driver/TripOverlay'
import { ActiveTripView } from '@/components/driver/ActiveTripView'
import { DriverMap } from '@/components/driver/DriverMap'
import { OnboardingFlow } from '@/components/driver/OnboardingFlow'
import { PushNotificationPrompt } from '@/components/driver/PushNotificationPrompt'
import { CollapsibleDashboardSheet } from '@/components/driver/CollapsibleDashboardSheet'
import { DashboardSummary } from '@/components/driver/DashboardSummary'
import { Card, CardContent } from '@/components/ui/card'
import { MapPin, Navigation, ChevronDown } from 'lucide-react'
import type { Profile, Trip } from '@/lib/supabase'
import { motion } from 'framer-motion'
import { toast } from 'sonner'

export default function DriverDashboard() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isOnline, setIsOnline] = useState<boolean>(false)
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null)
  const [toggling, setToggling] = useState(false)
  const isTogglingRef = useRef(false) // Use ref instead of state to avoid re-renders and subscription re-runs
  const toggleTimeoutRef = useRef<NodeJS.Timeout | null>(null) // Track timeout to prevent stuck states
  const toggleAbortControllerRef = useRef<AbortController | null>(null) // Abort in-flight requests on rapid toggles
  const [profileCardOpen, setProfileCardOpen] = useState(false)
  const [userPosition, setUserPosition] = useState<{ lat: number; lng: number } | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  
  const supabase = createClient()
  const router = useRouter()

  // PROGRESSIVE DATA LOADING: Critical data loads first (~100ms), secondary data loads in background
  const {
    criticalData,
    fullProfile,
    activeTrip: progressiveActiveTrip,
    criticalLoading,
    secondaryLoading,
    error: progressiveError,
  } = useProgressiveData({
    onCriticalDataLoaded: (critical) => {
      // Map critical data to profile state for immediate UI render
      if (critical.id) {
        setProfile({
          id: critical.id,
          full_name: critical.full_name || '',
          is_online: critical.is_online,
          role: critical.role || 'driver',
          latitude: critical.latitude,
          longitude: critical.longitude,
        } as Profile)
        setIsOnline(!!critical.is_online)
      }
    },
    onSecondaryDataLoaded: (fullProfile) => {
      // Update with full profile data
      setProfile(fullProfile)
      setIsOnline(!!fullProfile.is_online)
      
      // Check if onboarding is needed (incomplete profile)
      if (!fullProfile.full_name || !fullProfile.vehicle_number || !fullProfile.car_type) {
        setShowOnboarding(true)
      }
    },
    onActiveTripLoaded: (trip) => {
      setActiveTrip(trip)
    },
    onError: (error) => {
      console.error('[Driver Dashboard] Progressive data error:', error)
    },
  })

  // Sync active trip from progressive data
  useEffect(() => {
    if (progressiveActiveTrip !== undefined) {
      setActiveTrip(progressiveActiveTrip)
    }
  }, [progressiveActiveTrip])

  // Determine loading state: show loading only if critical data hasn't loaded yet
  const loading = criticalLoading

  // CRITICAL FIX: Handle errors gracefully - show error state instead of blank screen
  useEffect(() => {
    if (progressiveError) {
      console.error('[Driver Dashboard] Progressive data error:', progressiveError)
      
      // If error is "Profile not found", redirect to onboarding
      if (progressiveError.message?.includes('Profile not found') || progressiveError.message?.includes('RLS policy issue')) {
        console.warn('[Driver Dashboard] Profile not found - redirecting to onboarding')
        router.push('/onboarding')
        return
      }
      
      // If error is authentication-related, redirect to login
      if (progressiveError.message?.includes('Authentication error') || progressiveError.message?.includes('No authenticated user')) {
        console.warn('[Driver Dashboard] Authentication error - redirecting to login')
        router.push('/login')
        return
      }
      
      // For other errors, show error toast but don't redirect
      toast.error('שגיאה בטעינת הנתונים. אנא רענן את הדף.')
    }
  }, [progressiveError, router])

  const { queuePosition, totalInQueue } = useRealtimeQueue({
    zoneId: profile?.current_zone || null,
    driverId: profile?.id || ''
  })

  const { pendingTrip, clearPendingTrip } = useRealtimeTrips({
    driverId: profile?.id || ''
  })

  // Push notifications hook - subscribe when driver goes online
  const pushNotifications = usePushNotifications({
    driverId: profile?.id || null,
    autoRegister: false, // Manual registration when going online
  })

  // Network status monitoring
  const { isOnline: networkOnline, wasOffline } = useNetworkStatus()

  // Location broadcasting - automatically starts/stops based on isOnline
  // Returns throttled position/heading for smooth UI updates (500ms-1s rate)
  const { position: geolocationPosition, heading: geolocationHeading } = useGeolocation({
    enabled: isOnline, // Stable boolean dependency
    driverId: profile?.id || '',
    updateInterval: 4000,
    uiUpdateInterval: 500 // 500ms = 2 updates/second for smooth rendering
  })

  // Use throttled position from useGeolocation hook (removes duplicate watcher)
  // This position updates at 500ms-1s rate for smooth UI, while DB writes happen at 5s rate
  useEffect(() => {
    if (geolocationPosition) {
      setUserPosition(geolocationPosition)
    }
  }, [geolocationPosition])

  // Presence heartbeat - track when driver is actually active in the app
  useEffect(() => {
    if (!profile?.id || !isOnline) return

    const channel = supabase.channel(`presence-driver-${profile.id}`, {
      config: {
        presence: {
          key: profile.id,
        },
      },
    })

    channel
      .on('presence', { event: 'sync' }, () => {
        console.log('[Presence] Synced with other drivers')
      })
      .on('presence', { event: 'join' }, ({ key, newPresences }) => {
        console.log('[Presence] Joined:', key, newPresences)
      })
      .on('presence', { event: 'leave' }, ({ key, leftPresences }) => {
        console.log('[Presence] Left:', key, leftPresences)
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Presence] Tracking active status for:', profile.id)
          await channel.track({
            status: 'online',
            driverId: profile.id,
            lastSeen: new Date().toISOString()
          })
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [profile?.id, isOnline, supabase])

  // Separate effect for real-time subscription - only runs after critical data is loaded
  useEffect(() => {
    if (!criticalData?.id) return // Don't subscribe if critical data not loaded yet
    
    const isMountedRef = { current: true }
    
    const channel = supabase
      .channel(`profile-updates-${criticalData.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${criticalData.id}`
        },
        (payload) => {
          if (!isMountedRef.current) return // Guard check
          
          // CRITICAL: Ignore real-time updates during toggle to prevent race condition
          if (isTogglingRef.current) {
            console.log('[Real-time] Ignoring update during toggle operation')
            return
          }
          
          console.log('[Real-time] Profile updated:', payload.new)
          const updated = payload.new as Profile
          if (isMountedRef.current) {
            setProfile(updated)
            setIsOnline(!!updated.is_online)
          }
        }
      )
      .subscribe((status, err) => {
        console.log('[Driver Dashboard] Profile subscription status:', status)
        if (status === 'SUBSCRIBED') {
          console.log('✅ Successfully subscribed to profile updates')
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Error subscribing to profile updates')
          if (err) {
            console.error('   Error details:', err)
          }
          console.error('   Troubleshooting:')
          console.error('   1. Check if profiles table is in Realtime publication')
          console.error('   2. Verify REPLICA IDENTITY is FULL: ALTER TABLE profiles REPLICA IDENTITY FULL;')
          console.error('   3. Ensure RLS policy allows SELECT: USING (auth.uid() = id)')
          console.error('   4. Run fix script: scripts/fix-driver-profile-realtime.sql')
        } else if (status === 'TIMED_OUT') {
          console.warn('⚠️ Profile subscription timed out')
          console.warn('   This may indicate network issues or Realtime service unavailable')
        }
      })

    // CRITICAL: Handle background tab recovery - resubscribe when tab regains focus
    const handleVisibilityChange = () => {
      if (!document.hidden && isMountedRef.current && criticalData?.id) {
        console.log('[Driver Dashboard] Tab regained focus - refreshing subscription')
        // Refetch profile to ensure freshness
        supabase
          .from('profiles')
          .select('*')
          .eq('id', criticalData.id)
          .single()
          .then(({ data }) => {
            if (data && isMountedRef.current) {
              setProfile(data as Profile)
              setIsOnline(!!data.is_online)
            }
          })
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      isMountedRef.current = false
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      supabase.removeChannel(channel)
    }
  }, [supabase, criticalData?.id]) // Use criticalData.id instead of profile?.id for earlier subscription

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Cleanup: Clear any pending toggle timeouts on unmount
      if (toggleTimeoutRef.current) {
        clearTimeout(toggleTimeoutRef.current)
        toggleTimeoutRef.current = null
      }
      // Abort any in-flight toggle requests on unmount
      if (toggleAbortControllerRef.current) {
        toggleAbortControllerRef.current.abort()
        toggleAbortControllerRef.current = null
      }
    }
  }, [])

  const handleToggleOnline = async (checked: boolean) => {
    if (!profile) return
    
    // CRITICAL: Prevent going offline if driver has an active trip
    if (!checked && activeTrip && activeTrip.status === 'active') {
      console.warn('[Driver Toggle] Cannot go offline while active trip is in progress')
      // Show user-friendly message
      alert('לא ניתן להתנתק בעת נסיעה פעילה. אנא השלם את הנסיעה תחילה.')
      return
    }
    
    // PREVENT RAPID TOGGLES: If already toggling, ignore new toggle attempts
    if (isTogglingRef.current || toggling) {
      console.log('[Driver Toggle] Toggle already in progress, ignoring duplicate request')
      return
    }
    
    // ABORT PREVIOUS REQUEST: Cancel any in-flight toggle request (defensive)
    if (toggleAbortControllerRef.current) {
      toggleAbortControllerRef.current.abort()
    }
    
    // Clear any existing timeout to prevent stuck state
    if (toggleTimeoutRef.current) {
      clearTimeout(toggleTimeoutRef.current)
      toggleTimeoutRef.current = null
    }
    
    // Create new abort controller for this toggle
    const abortController = new AbortController()
    toggleAbortControllerRef.current = abortController
    
    // OPTIMISTIC UI: Update local state IMMEDIATELY for instant UI response
    // No page reload, no redirect - just state update
    const previousState = isOnline
    setIsOnline(checked)
    setProfile(prev => prev ? { ...prev, is_online: checked } : null)
    isTogglingRef.current = true // CRITICAL: Set ref flag to ignore real-time updates during toggle (no re-render)
    console.log('[Connection] Toggle changed to:', checked, '(optimistic update)')
    
    // Show loading state on toggle switch (optional - already handled by SwipeToGoOnline)
    setToggling(true)
    
    // SAFETY TIMEOUT: Ensure toggling state is cleared even if database call hangs
    const safetyTimeout = setTimeout(() => {
      if (!abortController.signal.aborted) {
        console.warn('[Driver Toggle] Safety timeout reached - clearing toggle state')
        setToggling(false)
        isTogglingRef.current = false
      }
    }, 10000) // 10 second max - if DB update takes longer, clear loading state anyway
    
    try {
      // Update database with timeout protection (5 seconds max)
      const updatePromise = supabase
        .from('profiles')
        .update({ 
          is_online: checked,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id)
        .select('id, is_online, updated_at')
        .single()
      
      // Race with timeout to prevent hanging
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Database update timeout after 5 seconds')), 5000)
      })
      
      const { error, data: updateData } = await Promise.race([updatePromise, timeoutPromise])

      // Check if aborted (rapid toggle)
      if (abortController.signal.aborted) {
        console.log('[Driver Toggle] Request aborted due to rapid toggle')
        // Rollback optimistic update
        setIsOnline(previousState)
        setProfile(prev => prev ? { ...prev, is_online: previousState } : null)
        clearTimeout(safetyTimeout)
        return
      }

      if (error) {
        console.error('[Driver Dashboard] Update error:', error)
        if (error.code === 'PGRST116' || error.message?.includes('406') || error.message?.includes('Not Acceptable')) {
          console.error('[Driver Dashboard] 406 Error on update - Possible RLS policy blocking. Attempting fallback...')
          // Try without .select() as fallback with timeout protection
          const fallbackPromise = supabase
            .from('profiles')
            .update({ 
              is_online: checked,
              updated_at: new Date().toISOString()
            })
            .eq('id', profile.id)
          
          const fallbackTimeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Fallback update timeout after 5 seconds')), 5000)
          })
          
          const { error: fallbackError } = await Promise.race([fallbackPromise, fallbackTimeoutPromise])
          
          // Check if aborted
          if (abortController.signal.aborted) {
            console.log('[Driver Toggle] Fallback request aborted')
            setIsOnline(previousState)
            setProfile(prev => prev ? { ...prev, is_online: previousState } : null)
            clearTimeout(safetyTimeout)
            return
          }
          
          if (fallbackError) {
            console.error('[Driver Toggle] Fallback also failed:', fallbackError)
            // Rollback optimistic update on error
            setIsOnline(previousState)
            setProfile(prev => prev ? { ...prev, is_online: previousState } : null)
            console.error('שגיאה בעדכון הסטטוס. נסה שוב.', fallbackError.message)
            throw fallbackError
          } else {
            // Fallback succeeded - state already updated optimistically
            console.log(checked ? 'Driver went online (fallback) - location updates started' : 'Driver went offline (fallback) - location updates stopped')
            // NO router.refresh() - state already updated, UI already reflects change
          }
        } else {
          // Rollback optimistic update on error
          setIsOnline(previousState)
          setProfile(prev => prev ? { ...prev, is_online: previousState } : null)
          console.error('שגיאה בעדכון הסטטוס. נסה שוב.', error.message)
          throw error
        }
      } else {
        // Success - state already updated optimistically, just sync with DB response
        if (updateData) {
          setProfile(prev => prev ? { ...prev, is_online: updateData.is_online } : null)
        }
        
        // Subscribe to push notifications when going online (non-blocking)
        if (checked && pushNotifications.isSupported) {
          // Run in background - don't block UI
          setTimeout(async () => {
            try {
              // Request permission if not already granted
              if (pushNotifications.permission === 'default') {
                console.log('[Push] Requesting notification permission...')
                await pushNotifications.requestPermission()
              }
              
              // Subscribe if permission is granted
              if (pushNotifications.permission === 'granted' || Notification.permission === 'granted') {
                await pushNotifications.subscribe()
                console.log('[Push] Subscribed to push notifications')
              } else {
                console.log('[Push] Notification permission not granted, skipping subscription')
              }
            } catch (pushError) {
              console.error('[Push] Failed to subscribe:', pushError)
              // Don't block going online if push subscription fails
            }
          }, 100) // Small delay to not block toggle animation
        }
        
        // Log status change for debugging
        console.log(checked ? '✅ Driver went online - location updates started' : '⏸️ Driver went offline - location updates stopped')
        
        // Premium toast confirmation for status change
        toast.success(checked ? 'מחובר' : 'מנותק', {
          description: checked 
            ? 'אתה עכשיו פעיל ומקבל נסיעות' 
            : 'אתה עכשיו לא פעיל'
        })
        
        // NO router.refresh() - optimistic UI already updated, no page reload needed
      }
    } catch (err: any) {
      // Check if aborted (don't log or rollback if aborted)
      if (abortController.signal.aborted) {
        console.log('[Driver Toggle] Request aborted, skipping error handling')
        clearTimeout(safetyTimeout)
        return
      }
      
      // Only handle non-abort errors
      if (err?.name !== 'AbortError') {
        console.error('[Driver Toggle] Unexpected error updating status:', err)
        // Rollback optimistic update
        setIsOnline(previousState)
        setProfile(prev => prev ? { ...prev, is_online: previousState } : null)
      }
    } finally {
      // ALWAYS clear loading state - even on error or timeout
      clearTimeout(safetyTimeout)
      setToggling(false)
      
      // CRITICAL: Clear toggle flag after a delay to allow DB update to propagate
      // This prevents realtime subscription from overwriting our optimistic update
      toggleTimeoutRef.current = setTimeout(() => {
        isTogglingRef.current = false // Use ref instead of state setter (no re-render)
        toggleTimeoutRef.current = null
      }, 1500) // 1.5 second grace period for DB propagation
      
      // Clear abort controller reference
      if (toggleAbortControllerRef.current === abortController) {
        toggleAbortControllerRef.current = null
      }
    }
  }

  const handleAcceptTrip = async () => {
    if (!pendingTrip || !profile) return

    try {
      // Use API endpoint for secure, race-condition-safe acceptance
      const response = await fetch('/api/trips/accept', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ tripId: pendingTrip.id }),
      })

      const result = await response.json()

      if (!response.ok) {
        console.error('[Driver Dashboard] Failed to accept trip:', result.error)
        toast.error('שגיאה', {
          description: result.error || 'שגיאה באישור הנסיעה. נסה שוב.'
        })
        return
      }

      // Success - update local state
      if (result.trip) {
        setActiveTrip(result.trip)
        clearPendingTrip()
        toast.success('נסיעה אושרה', {
          description: 'הנסיעה הוקצתה אליך בהצלחה'
        })
      }
    } catch (error: any) {
      console.error('[Driver Dashboard] Error accepting trip:', error)
      alert('שגיאה באישור הנסיעה. נסה שוב.')
    }
  }

  // Handle trip acceptance from URL parameter (notification click)
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const params = new URLSearchParams(window.location.search)
    const tripId = params.get('trip')
    if (tripId && profile?.id) {
      // Fetch and set active trip
      const fetchTripFromNotification = async () => {
        const { data, error } = await supabase
          .from('trips')
          .select('*')
          .eq('id', tripId)
          .eq('driver_id', profile.id)
          .eq('status', 'active')
          .single()

        if (!error && data) {
          setActiveTrip(data as Trip)
          // Clear URL parameter
          router.replace('/driver/dashboard', { scroll: false })
        }
      }
      fetchTripFromNotification()
    }
  }, [profile?.id, supabase, router])

  const handleTripStatusUpdate = async (status: 'active' | 'completed') => {
    if (!activeTrip) return

    const { error } = await supabase
      .from('trips')
      .update({ status })
      .eq('id', activeTrip.id)

    if (!error) {
      if (status === 'completed') {
        setActiveTrip(null)
        toast.success('נסיעה הושלמה', {
          description: 'הנסיעה הושלמה בהצלחה'
        })
      } else {
        setActiveTrip({ ...activeTrip, status })
        toast.success('סטטוס עודכן', {
          description: 'סטטוס הנסיעה עודכן'
        })
      }
    } else {
      toast.error('שגיאה', {
        description: 'לא ניתן לעדכן את סטטוס הנסיעה'
      })
    }
  }

  // Show loading only if critical data hasn't loaded yet
  // Once critical data is available, show map immediately (even if secondary data is still loading)
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 p-4">
        <div className="w-full max-w-md space-y-4">
          {/* Skeleton Loader - Premium feel */}
          <div className="space-y-3">
            <div className="h-8 bg-gray-800 rounded-lg animate-pulse" />
            <div className="h-24 bg-gray-800 rounded-xl animate-pulse" />
            <div className="h-16 bg-gray-800 rounded-xl animate-pulse" />
            <div className="h-16 bg-gray-800 rounded-xl animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

  // CRITICAL FIX: Show error state if critical data failed to load
  // Handle different error types appropriately
  if (progressiveError && !criticalData) {
    // If profile not found, redirect to onboarding
    if (progressiveError.message?.includes('Profile not found') || progressiveError.message?.includes('RLS policy issue')) {
      // Use useEffect for redirect (can't use hooks in render)
      const RedirectToOnboarding = () => {
        useEffect(() => {
          router.push('/onboarding')
        }, [router])
        return (
          <div className="flex items-center justify-center min-h-screen bg-gray-900 p-4">
            <div className="text-center">
              <div className="text-5xl mb-4">📝</div>
              <p className="text-gray-300">מעבר לטופס הרשמה...</p>
            </div>
          </div>
        )
      }
      return <RedirectToOnboarding />
    }
    
    // If authentication error, redirect to login
    if (progressiveError.message?.includes('Authentication error') || progressiveError.message?.includes('No authenticated user')) {
      const RedirectToLogin = () => {
        useEffect(() => {
          router.push('/login')
        }, [router])
        return (
          <div className="flex items-center justify-center min-h-screen bg-gray-900 p-4">
            <div className="text-center">
              <div className="text-5xl mb-4">🔒</div>
              <p className="text-gray-300">מעבר לעמוד התחברות...</p>
            </div>
          </div>
        )
      }
      return <RedirectToLogin />
    }
    
    // For other errors, show error state with reload option
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900 p-4">
        <div className="text-center max-w-md">
          <div className="text-5xl mb-4">⚠️</div>
          <h2 className="text-xl font-bold text-white mb-2">שגיאה בטעינת הנתונים</h2>
          <p className="text-gray-300 mb-4 text-sm">{progressiveError.message || 'אירעה שגיאה לא צפויה'}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-taxi-yellow text-gray-900 rounded-lg font-semibold hover:bg-yellow-400 transition-colors"
          >
            רענן דף
          </button>
        </div>
      </div>
    )
  }

  if (activeTrip) {
    return (
      <div className="relative min-h-screen w-full overflow-hidden">
        {showOnboarding && profile && (
          <OnboardingFlow
            userId={profile.id}
            initialPhone={profile.phone}
            onComplete={(updatedData) => {
              setProfile(prev => prev ? { ...prev, ...updatedData } : null)
              setShowOnboarding(false)
            }}
          />
        )}
        <div className="fixed inset-0 z-0">
          <DriverMap 
            userPosition={userPosition} 
            heading={geolocationHeading ?? profile?.heading ?? null} 
          />
        </div>
        <div className="relative z-10 p-3 sm:p-4 space-y-3 sm:space-y-4 overflow-y-auto min-h-screen pb-20 safe-bottom">
          <div className="bg-white/90 dark:bg-slate-800/90 backdrop-blur-lg rounded-xl sm:rounded-lg border border-white/20 shadow-lg">
            <ActiveTripView trip={activeTrip} onStatusUpdate={handleTripStatusUpdate} />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden bg-gray-900">
      {showOnboarding && profile && (
        <OnboardingFlow
          userId={profile.id}
          initialPhone={profile.phone}
          onComplete={(updatedData) => {
            setProfile(prev => prev ? { ...prev, ...updatedData } : null)
            setShowOnboarding(false)
          }}
        />
      )}
      {/* Map Background - Fixed on mobile */}
      {/* PROGRESSIVE RENDERING: Map shows immediately with critical data (latitude/longitude) */}
      {/* LAYOUT ANIMATION: Map smoothly resizes when sheet expands/collapses */}
      <motion.div 
        className="fixed inset-0 z-0"
        layout
        transition={{ type: 'spring', damping: 30, stiffness: 300 }}
      >
        <DriverMap 
          userPosition={userPosition} 
          heading={geolocationHeading ?? profile?.heading ?? null} 
        />
      </motion.div>
      
      {/* Collapsible Dashboard Sheet - Mobile Only */}
      {/* On desktop, renders normally without bottom sheet */}
      <CollapsibleDashboardSheet
        defaultExpanded={true}
        summaryContent={
          <DashboardSummary
            profile={profile}
            isOnline={isOnline}
            activeTrip={activeTrip}
            queuePosition={queuePosition}
            totalInQueue={totalInQueue}
          />
        }
      >
        {/* Push Notification Prompt - Show when online and permission not granted */}
        {profile && isOnline && pushNotifications.permission !== 'granted' && (
          <PushNotificationPrompt driverId={profile.id} />
        )}

        {/* Top Bar - Clickable Profile Card Header */}
        {/* PROGRESSIVE RENDERING: Shows with critical data (full_name), enhanced when secondary data loads */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card-dark rounded-xl sm:rounded-2xl overflow-hidden"
          layout
        >
          <button
            onClick={() => setProfileCardOpen(!profileCardOpen)}
            className="w-full flex items-center justify-between p-3 sm:p-4 hover:bg-white/5 transition-colors active:bg-white/10"
          >
            <div className="flex-1 min-w-0 text-right">
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-white truncate">
                שלום, {profile?.full_name || criticalData?.full_name || 'נהג'}
              </h1>
              <p className="text-xs sm:text-sm text-gray-400 flex items-center gap-1 mt-1 justify-end">
                <Navigation size={12} className="sm:w-3.5 sm:h-3.5" />
                GPS פעיל
              </p>
            </div>
            <motion.div
              animate={{ rotate: profileCardOpen ? 180 : 0 }}
              transition={{ duration: 0.2 }}
              className="flex-shrink-0 ml-3"
            >
              <ChevronDown className="text-gray-400" size={20} />
            </motion.div>
          </button>

          {/* Expandable Profile Card Content */}
          <motion.div
            initial={false}
            animate={{
              height: profileCardOpen ? 'auto' : 0,
              opacity: profileCardOpen ? 1 : 0
            }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            <div className="px-3 sm:px-4 pb-4 sm:pb-6 pt-2">
              {/* Swipe to Go Online - Centered and Mobile-Friendly */}
              {/* PROGRESSIVE RENDERING: Works with critical data (is_online), full profile loads in background */}
              <SwipeToGoOnline
                isOnline={isOnline}
                onToggle={handleToggleOnline}
                loading={toggling}
                driverName={profile?.full_name || criticalData?.full_name || ''}
              />
            </div>
          </motion.div>
        </motion.div>

        {/* Queue Card - Responsive */}
        {/* PROGRESSIVE RENDERING: Only shows when secondary data (current_zone) is loaded */}
        {profile?.is_online && profile?.current_zone && (
          <motion.div 
            className="glass-card-dark rounded-xl sm:rounded-2xl"
            layout
          >
            <QueueCard position={queuePosition} totalInQueue={totalInQueue} />
          </motion.div>
        )}

        {/* Zone Info - Compact on Mobile */}
        {/* PROGRESSIVE RENDERING: Only shows when secondary data (current_zone) is loaded */}
        {profile?.current_zone && (
          <motion.div layout>
          <Card className="glass-card-dark rounded-xl sm:rounded-2xl">
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-2">
                <MapPin className="text-taxi-yellow flex-shrink-0" size={18} />
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm text-gray-400">אזור נוכחי</p>
                  <p className="font-semibold text-white text-sm sm:text-base truncate">מרכז העיר</p>
                </div>
              </div>
            </CardContent>
          </Card>
          </motion.div>
        )}

        {/* Trip Overlay - Always on top */}
        <TripOverlay
          trip={pendingTrip}
          onAccept={handleAcceptTrip}
          onDismiss={clearPendingTrip}
          currentDriverId={profile?.id || criticalData?.id || null}
        />
      </CollapsibleDashboardSheet>
    </div>
  )
}
