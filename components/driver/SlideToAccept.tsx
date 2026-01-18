'use client'

import { useState, useEffect, useRef, useCallback, memo } from 'react'
import { motion, useMotionValue, useTransform, animate, PanInfo, useMotionValueEvent } from 'framer-motion'
import { Check, ArrowLeft } from 'lucide-react'
import { haptic } from '@/lib/haptic-feedback'
import { playNewTripSound } from '@/lib/audio-manager'
import { playSlideSound, stopSlideSound } from '@/lib/slide-sound'

interface SlideToAcceptProps {
  onAccept: () => void
  disabled?: boolean
  tripUnavailable?: boolean
}

// Premium Slide Component - Zero Latency, 1:1 Tracking
function SlideToAcceptComponent({ onAccept, disabled, tripUnavailable = false }: SlideToAcceptProps) {
  const [isAccepted, setIsAccepted] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const x = useMotionValue(0)
  const thresholdReached = useRef(false)
  const magneticActive = useRef(false)
  const soundHapticFired = useRef(false)
  const dragStartTime = useRef(0)
  
  const width = 300
  const magneticThreshold = width * 0.8 // 80% - magnetic pull
  const finalThreshold = width * 0.85 // 85% - completion
  const handleWidth = 60
  const maxDrag = width - handleWidth

  // GPU-accelerated motion values (no re-renders)
  // RTL: x goes from 0 to -maxDrag (negative), so we use absolute value for calculations
  const progress = useTransform(x, (latest) => {
    const absX = Math.abs(latest)
    return Math.min((absX / finalThreshold) * 100, 100)
  })
  const gradientOpacity = useTransform(x, (latest) => {
    const absX = Math.abs(latest)
    if (absX < finalThreshold * 0.5) return (absX / (finalThreshold * 0.5)) * 0.5
    return 0.5 + ((absX - finalThreshold * 0.5) / (finalThreshold * 0.5)) * 0.5
  })
  const textOpacity = useTransform(x, (latest) => {
    const absX = Math.abs(latest)
    if (absX < handleWidth * 0.7) return 1 - (absX / (handleWidth * 0.7)) * 0.7
    return 0
  })
  const textTranslateX = useTransform(x, (latest) => {
    const absX = Math.abs(latest)
    if (absX < handleWidth * 0.8) return -(absX / (handleWidth * 0.8)) * 30
    return -30
  })
  
  // Handle scale - increases subtly while dragging
  const handleScale = useMotionValue(1)
  
  // Arrow rotation - always points left (RTL)
  const arrowRotation = useMotionValue(180)
  
  // Arrow pulse scale (subtle vibration)
  // RTL: x is negative, so we use absolute value
  const arrowPulse = useTransform(x, (latest) => {
    if (isDragging && latest < 0) {
      const absX = Math.abs(latest)
      const progressRatio = Math.min(absX / finalThreshold, 1)
      return 1 + Math.sin(Date.now() / 80) * 0.03 * progressRatio
    }
    return 1
  })

  // Monitor x position changes for threshold detection (GPU-accelerated)
  // RTL: x is negative (0 to -maxDrag), so we use absolute value
  useMotionValueEvent(x, 'change', (latest) => {
    const absX = Math.abs(latest)
    const currentX = Math.max(0, Math.min(absX, maxDrag))
    
    // Threshold crossing detection (80% - magnetic pull)
    if (currentX >= magneticThreshold && !magneticActive.current && !thresholdReached.current) {
      thresholdReached.current = true
      magneticActive.current = true
      
      // Zero-latency haptic feedback - fires immediately at threshold crossing
      haptic.medium()
      
      // Vacuum effect: Animate motion value directly to -maxDrag (RTL: negative value)
      animate(x, -maxDrag, {
        type: "spring",
        stiffness: 500,
        damping: 35,
        mass: 0.2,
      }).then(() => {
        handleAccept()
      })
    }
    
    // Final threshold crossing (85% - completion)
    if (currentX >= finalThreshold && !soundHapticFired.current) {
      soundHapticFired.current = true
      // Zero-latency haptic and sound - fires exactly at threshold
      haptic.success()
      playNewTripSound().catch(() => {
        // Silently fail - sound is optional
      })
      stopSlideSound()
    } else if (currentX < finalThreshold && soundHapticFired.current) {
      soundHapticFired.current = false
    }
    
    // Update handle scale based on drag progress
    const scaleProgress = Math.min(currentX / maxDrag, 1)
    handleScale.set(1 + scaleProgress * 0.05) // Scale from 1.0 to 1.05
  })

  const handleAccept = useCallback(async () => {
    if (isAccepted || disabled || tripUnavailable) return
    
    setIsAccepted(true)
    stopSlideSound()
    
    // Brief completion animation
    await new Promise(resolve => setTimeout(resolve, 150))
    
    onAccept()
  }, [isAccepted, disabled, tripUnavailable, onAccept])

  // Handle drag start - zero latency setup
  const handleDragStart = useCallback(() => {
    console.log('[SlideToAccept] 🎯 Drag STARTED')
    if (disabled || tripUnavailable) {
      console.log('[SlideToAccept] ⛔ Drag blocked - disabled:', disabled, 'unavailable:', tripUnavailable)
      return
    }
    
    dragStartTime.current = Date.now()
    setIsDragging(true)
    haptic.light()
    playSlideSound()
    soundHapticFired.current = false
    thresholdReached.current = false
    magneticActive.current = false
  }, [disabled, tripUnavailable])

  // Add onDrag handler for debugging and to ensure drag works
  const handleDrag = useCallback((event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (disabled || tripUnavailable || magneticActive.current) return
    const absX = Math.abs(info.offset.x)
    console.log('[SlideToAccept] 🖱️ Drag MOVING - x:', info.offset.x, 'absX:', absX, 'delta:', info.delta.x)
  }, [disabled, tripUnavailable])

  // Handle drag end - ultra-fast snap back if not completed
  const handleDragEnd = useCallback(async (event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setIsDragging(false)
    stopSlideSound()
    
    const currentX = Math.abs(x.get()) // RTL: use absolute value
    
    if (currentX >= finalThreshold && !isAccepted && !disabled && !tripUnavailable) {
      // Already crossed threshold - accept
      if (!soundHapticFired.current) {
        haptic.success()
        playNewTripSound().catch(() => {
          // Silently fail - sound is optional
        })
      }
      await handleAccept()
    } else {
      // Instant reset: Lightning-fast snap back (released before threshold)
      thresholdReached.current = false
      magneticActive.current = false
      soundHapticFired.current = false
      handleScale.set(1) // Reset scale
      
      // Animate motion value directly for instant snap-back (RTL: back to 0)
      animate(x, 0, {
        type: "spring",
        stiffness: 1000, // Ultra-high stiffness - no floaty feeling
        damping: 60,
        mass: 0.15,
      })
    }
  }, [x, finalThreshold, isAccepted, disabled, tripUnavailable, handleAccept])

  // Handle trip unavailable state
  useEffect(() => {
    if (tripUnavailable && isDragging) {
      stopSlideSound()
      setIsDragging(false)
      handleScale.set(1)
      thresholdReached.current = false
      magneticActive.current = false
      soundHapticFired.current = false
      
      // Reset position smoothly
      animate(x, 0, {
        duration: 0.25,
        ease: "easeOut"
      })
    }
  }, [tripUnavailable, isDragging, x, handleScale])

  // Arrow icon component (memoized for performance)
  const ArrowIcon = useCallback(() => (
    <ArrowLeft 
      size={20} 
      className="text-black font-bold"
      style={{ transform: 'rotate(180deg)' }}
    />
  ), [])

  // Debug: Log initialization (only once)
  useEffect(() => {
    console.log('[SlideToAccept] Initialized - width:', width, 'maxDrag:', maxDrag, 'handleWidth:', handleWidth)
  }, [])

  if (isAccepted) {
    return (
      <motion.div
        className="flex items-center justify-center h-16 bg-gradient-to-r from-green-500 to-green-600 rounded-full text-white font-semibold shadow-lg shadow-green-500/50"
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{
          type: "spring",
          stiffness: 600,
          damping: 35,
        }}
      >
        <motion.div
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.08, type: "spring", stiffness: 500 }}
        >
          <Check size={24} className="ml-2" />
        </motion.div>
        <span className="mr-2">נסיעה אושרה!</span>
      </motion.div>
    )
  }

  if (tripUnavailable) {
    return (
      <motion.div
        className="flex items-center justify-center h-16 bg-gradient-to-r from-red-500/90 to-red-600/90 rounded-full text-white font-semibold border border-red-400/50"
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.25 }}
      >
        <span className="text-sm">נסיעה זו נלקחה</span>
      </motion.div>
    )
  }

  return (
    <div 
      className="relative h-16 bg-slate-800/95 backdrop-blur-sm rounded-full overflow-hidden border border-slate-700/50 shadow-xl"
      style={{ 
        touchAction: 'pan-x', // Only allow horizontal panning
        pointerEvents: 'auto', // Ensure pointer events work
      }}
    >
      {/* Dynamic gradient background - GPU-accelerated */}
      <motion.div
        className="absolute inset-0 bg-gradient-to-r from-slate-700/50 via-emerald-500/30 to-emerald-500/60 rounded-full"
        style={{ 
          opacity: gradientOpacity,
        }}
      />
      
      {/* Instruction text - GPU-accelerated transforms */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center text-white font-semibold z-10 pointer-events-none select-none"
        style={{ 
          opacity: textOpacity,
          x: textTranslateX,
        }}
      >
        <span className="text-sm sm:text-base whitespace-nowrap">גרור לאישור נסיעה</span>
      </motion.div>
      
      {/* Progress fill indicator - GPU-accelerated */}
      {/* RTL: Fill from right, so we use right positioning */}
      <motion.div
        className="absolute right-0 top-0 bottom-0 bg-gradient-to-l from-emerald-400/40 to-emerald-500/60 rounded-full pointer-events-none"
        style={{
          width: useTransform(progress, (v) => `${Math.min(v, 100)}%`),
        }}
      />
      
      {/* Draggable handle - Zero latency, 1:1 tracking */}
      {/* RTL: Handle at right: 0, dragging left means x goes from 0 to -maxDrag */}
      <motion.div
        drag="x"
        dragDirectionLock={true} // Lock to horizontal only (helps with RTL)
        dragConstraints={{ left: -maxDrag, right: 0 }} // RTL: allow negative values (left drag)
        dragElastic={0} // No elastic - handle stays glued to finger
        dragMomentum={false} // No momentum - instant stop
        onDragStart={handleDragStart}
        onDrag={handleDrag} // Add handler for debugging and to ensure drag works
        onDragEnd={handleDragEnd}
        className={`absolute right-0 top-0 bottom-0 w-[60px] bg-gradient-to-br from-taxi-yellow via-yellow-400 to-yellow-500 rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing z-20 shadow-lg ${
          thresholdReached.current ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-800' : ''
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        style={{ 
          x, // Direct motion value - GPU-accelerated, zero latency (0 to -maxDrag in RTL)
          scale: handleScale, // Dynamic scale based on drag progress
          pointerEvents: 'auto', // Force pointer events
          touchAction: 'pan-x', // Ensure touch works
        }}
        whileHover={disabled ? {} : { scale: 1.02 }}
        whileTap={disabled ? {} : { scale: 0.98 }}
      >
        {/* Arrow with pulse animation - GPU-accelerated */}
        <motion.div
          style={{
            scale: arrowPulse,
            rotate: arrowRotation,
          }}
          animate={isDragging ? {
            scale: [1, 1.04, 1],
          } : {}}
          transition={{
            duration: 0.4,
            repeat: isDragging ? Infinity : 0,
            ease: "easeInOut",
          }}
        >
          <ArrowIcon />
        </motion.div>
      </motion.div>
      
      {/* Threshold indicator lines */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-emerald-400/30 z-5"
        style={{ right: `${100 - (magneticThreshold / width) * 100}%` }}
      />
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-emerald-400/60 z-5"
        style={{ right: `${100 - (finalThreshold / width) * 100}%` }}
      />
    </div>
  )
}

// Memoize component to prevent unnecessary re-renders from parent
// Only re-render if disabled or tripUnavailable changes (onAccept callback changes are fine)
export const SlideToAccept = memo(SlideToAcceptComponent, (prevProps, nextProps) => {
  return (
    prevProps.disabled === nextProps.disabled &&
    prevProps.tripUnavailable === nextProps.tripUnavailable
  )
})

SlideToAccept.displayName = 'SlideToAccept'
