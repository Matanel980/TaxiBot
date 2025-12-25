'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useGeolocation } from '@/lib/hooks/useGeolocation'
import { useRealtimeQueue } from '@/lib/hooks/useRealtimeQueue'
import { useRealtimeTrips } from '@/lib/hooks/useRealtimeTrips'
import { SwipeToGoOnline } from '@/components/driver/SwipeToGoOnline'
import { QueueCard } from '@/components/driver/QueueCard'
import { TripOverlay } from '@/components/driver/TripOverlay'
import { ActiveTripView } from '@/components/driver/ActiveTripView'
import { DriverMap } from '@/components/driver/DriverMap'
import { OnboardingFlow } from '@/components/driver/OnboardingFlow'
import { Card, CardContent } from '@/components/ui/card'
import { MapPin, Navigation, ChevronDown } from 'lucide-react'
import type { Profile, Trip } from '@/lib/supabase'
import { motion } from 'framer-motion'

export default function DriverDashboard() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [isOnline, setIsOnline] = useState<boolean>(false)
  const [activeTrip, setActiveTrip] = useState<Trip | null>(null)
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState(false)
  const [profileCardOpen, setProfileCardOpen] = useState(false)
  const [userPosition, setUserPosition] = useState<{ lat: number; lng: number } | null>(null)
  const [showOnboarding, setShowOnboarding] = useState(false)
  
  const supabase = createClient()

  const { queuePosition, totalInQueue } = useRealtimeQueue({
    zoneId: profile?.current_zone || null,
    driverId: profile?.id || ''
  })

  const { pendingTrip, clearPendingTrip } = useRealtimeTrips({
    driverId: profile?.id || ''
  })

  // Track user position for map
  useEffect(() => {
    if (!navigator.geolocation) return

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setUserPosition({
          lat: position.coords.latitude,
          lng: position.coords.longitude
        })
      },
      (error) => {
        console.error('Geolocation error:', error)
      },
      {
        enableHighAccuracy: true,
        maximumAge: 0
      }
    )

    return () => navigator.geolocation.clearWatch(watchId)
  }, [])

  // Location broadcasting - automatically starts/stops based on isOnline
  useGeolocation({
    enabled: isOnline, // Stable boolean dependency
    driverId: profile?.id || '',
    updateInterval: 4000
  })

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

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()

        if (data) {
          const prof = data as Profile
          setProfile(prof)
          setIsOnline(!!prof.is_online)
          
          // Check if onboarding is needed (incomplete profile)
          if (!prof.full_name || !prof.vehicle_number || !prof.car_type) {
            setShowOnboarding(true)
          }
        }

        // Check for active trip
        const { data: trip } = await supabase
          .from('trips')
          .select('*')
          .eq('driver_id', user.id)
          .eq('status', 'active')
          .single()

        if (trip) {
          setActiveTrip(trip as Trip)
        }
      }
      
      setLoading(false)
    }

    fetchProfile()
  }, [supabase])

  const handleToggleOnline = async (checked: boolean) => {
    if (!profile) return
    
    // Update local state IMMEDIATELY for snappy UI response
    setIsOnline(checked)
    console.log('[Connection] Toggle changed to:', checked)
    
    setToggling(true)
    try {
      // Update is_online status
      const { error } = await supabase
        .from('profiles')
        .update({ 
          is_online: checked,
          updated_at: new Date().toISOString()
        })
        .eq('id', profile.id)

      if (!error) {
        // Only update profile if needed, avoiding a full re-render loop
        setProfile(prev => prev ? { ...prev, is_online: checked } : null)
        
        // Log status change for debugging
        if (checked) {
          console.log('Driver went online - location updates started')
        } else {
          console.log('Driver went offline - location updates stopped')
        }
      } else {
        console.error('Error updating online status:', error)
        // Rollback on error
        setIsOnline(!checked)
      }
    } catch (err) {
      console.error('Unexpected error updating status:', err)
      setIsOnline(!checked)
    } finally {
      setToggling(false)
    }
  }

  const handleAcceptTrip = async () => {
    if (!pendingTrip || !profile) return

    const { error } = await supabase
      .from('trips')
      .update({
        driver_id: profile.id,
        status: 'active'
      })
      .eq('id', pendingTrip.id)

    if (!error) {
      setActiveTrip({ ...pendingTrip, status: 'active', driver_id: profile.id })
      clearPendingTrip()
    }
  }

  const handleTripStatusUpdate = async (status: 'active' | 'completed') => {
    if (!activeTrip) return

    const { error } = await supabase
      .from('trips')
      .update({ status })
      .eq('id', activeTrip.id)

    if (!error) {
      if (status === 'completed') {
        setActiveTrip(null)
      } else {
        setActiveTrip({ ...activeTrip, status })
      }
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-taxi-yellow mx-auto mb-4"></div>
          <p className="text-white">טוען...</p>
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
          <DriverMap userPosition={userPosition} />
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
      <div className="fixed inset-0 z-0">
        <DriverMap userPosition={userPosition} />
      </div>
      
      {/* Content Overlay - Mobile First */}
      <div className="relative z-10 p-3 sm:p-4 space-y-3 sm:space-y-4 overflow-y-auto min-h-screen pb-20 safe-bottom">
        {/* Top Bar - Clickable Profile Card Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-card-dark rounded-xl sm:rounded-2xl overflow-hidden"
        >
          <button
            onClick={() => setProfileCardOpen(!profileCardOpen)}
            className="w-full flex items-center justify-between p-3 sm:p-4 hover:bg-white/5 transition-colors active:bg-white/10"
          >
            <div className="flex-1 min-w-0 text-right">
              <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-white truncate">
                שלום, {profile?.full_name}
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
              <SwipeToGoOnline
                isOnline={isOnline}
                onToggle={handleToggleOnline}
                loading={toggling}
                driverName={profile?.full_name}
              />
            </div>
          </motion.div>
        </motion.div>

        {/* Queue Card - Responsive */}
        {profile?.is_online && profile?.current_zone && (
          <div className="glass-card-dark rounded-xl sm:rounded-2xl">
            <QueueCard position={queuePosition} totalInQueue={totalInQueue} />
          </div>
        )}

        {/* Zone Info - Compact on Mobile */}
        {profile?.current_zone && (
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
        )}

        {/* Trip Overlay */}
        <TripOverlay
          trip={pendingTrip}
          onAccept={handleAcceptTrip}
          onDismiss={clearPendingTrip}
        />
      </div>
    </div>
  )
}

