'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, useMotionValue, useTransform, PanInfo, useSpring } from 'framer-motion'
import { Loader2, Navigation, Power } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SwipeToGoOnlineProps {
  isOnline: boolean
  onToggle: (checked: boolean) => void
  loading?: boolean
  driverName?: string
}

export function SwipeToGoOnline({ isOnline, onToggle, loading, driverName }: SwipeToGoOnlineProps) {
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const x = useMotionValue(0)
  
  // Use direct motion value for 1:1 finger/mouse tracking during drag
  // Apply spring only on snap-back, not during active drag
  const springX = useSpring(x, { 
    stiffness: 800, // Higher stiffness for snappier response
    damping: 40, 
    mass: 0.3 
  })
  
  // Calculate swipe distance - direct 1:1 tracking during drag
  const swipeDistance = useTransform(x, (latest) => {
    if (!containerRef.current) return 0
    const containerWidth = containerRef.current.offsetWidth
    const thumbWidth = 96 // Account for wider thumb
    return Math.max(0, Math.min(latest, containerWidth - thumbWidth - 16))
  })
  
  // Spring-based distance for snap-back animation
  const springDistance = useTransform(springX, (latest) => {
    if (!containerRef.current) return 0
    const containerWidth = containerRef.current.offsetWidth
    const thumbWidth = 96
    return Math.max(0, Math.min(latest, containerWidth - thumbWidth - 16))
  })

  // Reset position when status changes externally
  useEffect(() => {
    if (!isDragging) {
      const containerWidth = containerRef.current?.offsetWidth || 0
      const targetX = isOnline ? containerWidth - 96 - 16 : 0
      x.set(targetX)
    }
  }, [isOnline, isDragging, x])

  const handleDragEnd = (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setIsDragging(false)
    const containerWidth = containerRef.current?.offsetWidth || 0
    const maxDistance = containerWidth - 96 - 16
    const threshold = maxDistance * 0.4 // 40% threshold for toggle
    
    const velocity = info.velocity.x
    const offset = info.offset.x

    if (!isOnline) {
      // Trying to go online (drag right)
      if (offset > threshold || velocity > 500) {
        onToggle(true)
        x.set(maxDistance)
      } else {
        x.set(0)
      }
    } else {
      // Trying to go offline (drag left)
      if (offset < -threshold || velocity < -500) {
        onToggle(false)
        x.set(0)
      } else {
        x.set(maxDistance)
      }
    }
  }

  const handleDragStart = () => {
    setIsDragging(true)
  }

  // Calculate progress percentage for visual feedback (0-100%)
  const progressPercentage = useTransform(swipeDistance, (latest) => {
    if (!containerRef.current) return 0
    const containerWidth = containerRef.current.offsetWidth
    const maxDistance = containerWidth - 96
    return maxDistance > 0 ? (latest / maxDistance) * 100 : 0
  })

  // Enhanced visual feedback - background color intensity based on progress
  const backgroundIntensity = useTransform(progressPercentage, (p) => {
    // More intense color change as user swipes
    return Math.min(p / 100, 1) * 0.4 // 0 to 40% opacity
  })

  // Transform for progress width - must be at top level
  const progressWidth = useTransform(progressPercentage, (p) => `${p}%`)

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4 sm:p-8">
        <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 text-taxi-yellow animate-spin" />
      </div>
    )
  }

  return (
    <motion.div
      className="flex flex-col items-center gap-4 sm:gap-6 p-4 sm:p-6 w-full"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="text-center w-full">
        <h3 className="text-xl sm:text-2xl font-bold mb-1 sm:mb-2 text-white">
          {isOnline ? 'אתה מחובר' : 'אתה מנותק'}
        </h3>
        <p className="text-xs sm:text-sm text-gray-400 px-2">
          {isOnline 
            ? 'אתה מקבל נסיעות כעת' 
            : 'גרור כדי להתחבר ולהתחיל לקבל נסיעות'
          }
        </p>
      </div>

      {/* Swipe Container - Full Width on Mobile */}
      <div
        ref={containerRef}
        className={cn(
          "relative w-full h-16 sm:h-20 rounded-full overflow-hidden",
          "bg-gray-800 border-2 transition-colors duration-200",
          "touch-none select-none", // Prevent scroll and selection during swipe
          "cursor-default",
          isOnline ? "border-green-500" : "border-gray-600"
        )}
      >
        {/* Background Text */}
        <div className="absolute inset-0 flex items-center justify-center z-0 pointer-events-none">
          <span className={cn(
            "text-sm font-semibold transition-opacity duration-200",
            isOnline ? "text-green-400 opacity-100" : "text-gray-500 opacity-50"
          )}>
            {isOnline ? 'מחובר' : 'גרור להתחבר'}
          </span>
        </div>

        {/* Enhanced Progress Indicator with Dynamic Intensity */}
        <motion.div
          className="absolute inset-0 bg-green-500 pointer-events-none"
          style={{
            width: progressWidth,
            opacity: backgroundIntensity
          }}
        />

        {/* Swipeable Thumb - 1:1 Responsive */}
        <motion.div
          drag="x"
          dragConstraints={containerRef}
          dragElastic={0.05}
          dragMomentum={false}
          onDragStart={handleDragStart}
          onDragEnd={handleDragEnd}
          style={{ 
            x: isDragging ? swipeDistance : springDistance
          }}
          className={cn(
            "absolute left-2 top-2 bottom-2 w-24 sm:w-20 h-[calc(100%-1rem)] rounded-full",
            "flex items-center justify-center cursor-grab active:cursor-grabbing",
            "shadow-xl transition-colors duration-200 z-10",
            "touch-none", // Prevent default touch behaviors
            isOnline 
              ? "bg-gradient-to-r from-green-500 to-emerald-500" 
              : "bg-gradient-to-r from-gray-600 to-gray-700"
          )}
          whileTap={{ scale: 0.95 }}
          whileHover={{ scale: 1.02 }}
        >
          {isOnline ? (
            <Power className="w-6 h-6 text-white" />
          ) : (
            <Navigation className="w-6 h-6 text-white rotate-90" />
          )}
        </motion.div>
      </div>

      {/* Status Indicator - Responsive */}
      <div className="flex items-center gap-2 text-xs sm:text-sm">
        <div className={cn(
          "w-2.5 h-2.5 sm:w-3 sm:h-3 rounded-full transition-colors duration-300",
          isOnline ? "bg-green-500 animate-pulse" : "bg-gray-500"
        )} />
        <span className={cn(
          "font-medium transition-colors duration-300",
          isOnline ? "text-green-400" : "text-gray-400"
        )}>
          {isOnline ? 'מזמין נסיעות' : 'לא פעיל'}
        </span>
      </div>
    </motion.div>
  )
}

