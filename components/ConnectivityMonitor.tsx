'use client'

import { useState, useEffect } from 'react'
import { WifiOff, MapPinOff } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

export function ConnectivityMonitor() {
  const [status, setStatus] = useState({ online: true, gps: true })

  useEffect(() => {
    const handleOnline = () => setStatus(prev => ({ ...prev, online: true }))
    const handleOffline = () => setStatus(prev => ({ ...prev, online: false }))

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    // Check GPS permissions if possible (basic check)
    if ('permissions' in navigator) {
      navigator.permissions.query({ name: 'geolocation' as PermissionName }).then(result => {
        setStatus(prev => ({ ...prev, gps: result.state !== 'denied' }))
        result.onchange = () => {
          setStatus(prev => ({ ...prev, gps: result.state !== 'denied' }))
        }
      })
    }

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  if (status.online && status.gps) return null

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: -100, x: '-50%' }}
        animate={{ y: 20, x: '-50%' }}
        exit={{ y: -100, x: '-50%' }}
        className="fixed top-0 left-1/2 z-[9999] bg-red-600 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-white/20 backdrop-blur-md"
      >
        {!status.online ? (
          <>
            <WifiOff size={20} className="animate-pulse" />
            <span className="font-bold whitespace-nowrap">אין חיבור לאינטרנט</span>
          </>
        ) : (
          <>
            <MapPinOff size={20} className="animate-pulse" />
            <span className="font-bold whitespace-nowrap">בעיית GPS - וודא שהמיקום פעיל</span>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  )
}








