'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Bell, X } from 'lucide-react'
import { usePushNotifications } from '@/lib/hooks/usePushNotifications'
import { motion, AnimatePresence } from 'framer-motion'

interface PushNotificationPromptProps {
  driverId: string | null
  onDismiss?: () => void
}

/**
 * Push Notification Permission Prompt
 * Shows when notification permission is not granted
 */
export function PushNotificationPrompt({ driverId, onDismiss }: PushNotificationPromptProps) {
  const [dismissed, setDismissed] = useState(false)
  const {
    isSupported,
    isConfigured,
    permission,
    isSubscribed,
    subscribe,
    requestPermission,
    error,
  } = usePushNotifications({
    driverId,
    autoRegister: false,
  })

  // Check if user has already dismissed or granted permission
  useEffect(() => {
    if (permission === 'granted' || permission === 'denied') {
      setDismissed(true)
    }
  }, [permission])

  const handleEnable = async () => {
    console.log('[PushNotificationPrompt] 🔵 Enable button clicked')
    console.log('[PushNotificationPrompt] 🔵 Current state:', { permission, isSupported, isConfigured, driverId })
    
    try {
      // Step 1: Request permission if needed
      let currentPermission = Notification.permission // Use actual browser permission for real-time check
      console.log('[PushNotificationPrompt] 🔵 Current browser permission:', currentPermission)
      
      if (currentPermission === 'default') {
        console.log('[PushNotificationPrompt] 🔵 Requesting notification permission...')
        currentPermission = await requestPermission()
        console.log('[PushNotificationPrompt] 🔵 Permission result:', currentPermission)
      }
      
      // Step 2: Subscribe if permission granted
      if (currentPermission === 'granted') {
        console.log('[PushNotificationPrompt] 🔵 Permission granted, calling subscribe()...')
        await subscribe()
        console.log('[PushNotificationPrompt] ✅ Successfully subscribed to push notifications')
      } else {
        console.warn('[PushNotificationPrompt] ⚠️ Permission not granted:', currentPermission)
        alert('הרשאות התראות נדחו. אנא הפעל אותן בהגדרות הדפדפן.')
      }
      setDismissed(true)
    } catch (err: any) {
      console.error('[PushNotificationPrompt] ❌ Error enabling notifications:', err)
      console.error('[PushNotificationPrompt] ❌ Error details:', {
        message: err.message,
        stack: err.stack,
        name: err.name
      })
      alert('שגיאה בהפעלת התראות: ' + err.message)
      // Error state is managed by the hook, no need to setError here
    }
  }

  const handleDismiss = () => {
    setDismissed(true)
    onDismiss?.()
  }

  // Don't show if not supported, not configured, already dismissed, or permission granted/denied
  if (
    !isSupported ||
    !isConfigured ||
    dismissed ||
    permission === 'granted' ||
    permission === 'denied'
  ) {
    return null
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        className="mb-4"
      >
        <Card className="bg-gradient-to-r from-taxi-yellow/10 to-taxi-yellow/5 border-taxi-yellow/30">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-taxi-yellow/20 rounded-lg">
                  <Bell className="text-taxi-yellow" size={24} />
                </div>
                <div>
                  <CardTitle className="text-lg">הפעל התראות</CardTitle>
                  <CardDescription className="text-sm mt-1">
                    קבל התראות על נסיעות חדשות גם כשהאפליקציה ברקע
                  </CardDescription>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={handleDismiss}
                className="h-8 w-8 text-gray-400 hover:text-white"
              >
                <X size={16} />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="space-y-3">
              <div className="text-sm text-gray-300 space-y-1">
                <p>✓ קבל התראות על נסיעות חדשות</p>
                <p>✓ אישור/דחייה ישירות מההתראה</p>
                <p>✓ עובד גם כשהאפליקציה סגורה</p>
              </div>
              {error && (
                <p className="text-sm text-red-400">{error}</p>
              )}
              <div className="flex gap-2">
                <Button
                  onClick={handleEnable}
                  className="flex-1 bg-taxi-yellow text-slate-900 hover:bg-taxi-yellow/90"
                >
                  הפעל התראות
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDismiss}
                  className="flex-1 border-gray-600"
                >
                  לא עכשיו
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  )
}

