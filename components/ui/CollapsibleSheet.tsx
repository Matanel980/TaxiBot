'use client'

/**
 * Enterprise-Grade Reusable Collapsible Bottom Sheet Component
 * 
 * Consolidates CollapsibleDashboardSheet and CollapsibleTripSheet into a single,
 * configurable component following DRY principles.
 * 
 * Features:
 * - Smooth 60fps animations with Framer Motion
 * - GPU-accelerated transforms
 * - Mobile-responsive (desktop renders normally)
 * - Configurable styling via className prop
 * - Large touch targets for accessibility
 */

import { useState, useEffect, useRef } from 'react'
import { motion, useMotionValue, useSpring, PanInfo, useDragControls } from 'framer-motion'
import { useMediaQuery } from '@/lib/hooks/useMediaQuery'
import { ChevronUp } from 'lucide-react'
import { cn } from '@/lib/utils'

interface CollapsibleSheetProps {
  children: React.ReactNode
  summaryContent?: React.ReactNode
  defaultExpanded?: boolean
  /** Background color class (default: bg-gray-900/95) */
  bgClassName?: string
  /** Z-index (default: z-10) */
  zIndex?: string
  /** Custom className for the sheet container */
  className?: string
}

// Snap points: [collapsed, expanded]
// Collapsed: 80px (handle + summary)
// Expanded: 70% of viewport height
const COLLAPSED_HEIGHT = 80
const EXPANDED_PERCENTAGE = 0.7

export function CollapsibleSheet({
  children,
  summaryContent,
  defaultExpanded = true,
  bgClassName = 'bg-gray-900/95',
  zIndex = 'z-10',
  className,
}: CollapsibleSheetProps) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  const [isExpanded, setIsExpanded] = useState(defaultExpanded)
  const [viewportHeight, setViewportHeight] = useState(0)
  const sheetRef = useRef<HTMLDivElement>(null)
  const dragControls = useDragControls()

  // Calculate snap points based on viewport height
  useEffect(() => {
    if (typeof window === 'undefined') return
    
    const updateViewport = () => {
      setViewportHeight(window.innerHeight)
    }
    
    updateViewport()
    window.addEventListener('resize', updateViewport)
    return () => window.removeEventListener('resize', updateViewport)
  }, [])

  const expandedHeight = viewportHeight > 0 ? viewportHeight * EXPANDED_PERCENTAGE : 600 // Fallback
  const maxDrag = Math.max(0, expandedHeight - COLLAPSED_HEIGHT) // Ensure non-negative

  // Motion values for drag
  // y = 0 means fully expanded (sheet at bottom), y = maxDrag means collapsed (sheet pulled up)
  const y = useMotionValue(isExpanded ? 0 : maxDrag)
  const springConfig = { damping: 30, stiffness: 300 }
  const springY = useSpring(y, springConfig)

  // Update y value when viewport height or expanded state changes
  useEffect(() => {
    if (viewportHeight > 0 && maxDrag > 0) {
      springY.set(isExpanded ? 0 : maxDrag)
    }
  }, [viewportHeight, isExpanded, maxDrag, springY])

  // Constrain drag to valid range
  useEffect(() => {
    if (viewportHeight === 0) return
    
    const unsubscribe = springY.on('change', (latest) => {
      // Clamp to valid range: [0, maxDrag]
      // 0 = fully expanded, maxDrag = collapsed
      if (latest < 0) {
        springY.set(0)
      } else if (latest > maxDrag) {
        springY.set(maxDrag)
      }
    })
    return unsubscribe
  }, [springY, maxDrag, viewportHeight])

  // Handle drag end - snap to nearest point
  const handleDragEnd = (_event: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    if (viewportHeight === 0) return
    
    const currentY = springY.get()
    const velocity = info.velocity.y
    const midPoint = maxDrag / 2

    // Determine target based on velocity and position
    let target: number
    
    if (Math.abs(velocity) > 500) {
      // Fast swipe - snap based on direction
      // Positive velocity = dragging down = expand (y = 0)
      // Negative velocity = dragging up = collapse (y = maxDrag)
      target = velocity > 0 ? 0 : maxDrag
    } else {
      // Slow drag - snap to nearest point
      target = currentY < midPoint ? 0 : maxDrag
    }

    // Animate to target
    springY.set(target)
    setIsExpanded(target === 0) // 0 = expanded
  }

  // Toggle on handle click
  const handleToggle = () => {
    const target = isExpanded ? maxDrag : 0
    springY.set(target)
    setIsExpanded(!isExpanded)
  }

  // Desktop: Render normally (no bottom sheet)
  if (!isMobile) {
    return <>{children}</>
  }

  // Mobile: Render collapsible bottom sheet
  return (
    <motion.div
      ref={sheetRef}
      className={cn(
        'fixed bottom-0 left-0 right-0 backdrop-blur-xl rounded-t-3xl shadow-2xl overflow-hidden',
        bgClassName,
        zIndex,
        className
      )}
      style={{
        y: springY,
        height: expandedHeight,
        willChange: 'transform', // GPU acceleration
      }}
      drag="y"
      dragControls={dragControls}
      dragConstraints={{
        top: -maxDrag, // Negative because dragging up (y decreases)
        bottom: 0, // Fully expanded position
      }}
      dragElastic={0.1} // Slight resistance at boundaries
      onDragEnd={handleDragEnd}
      initial={false}
      animate={{
        y: isExpanded ? 0 : maxDrag,
      }}
      transition={{
        type: 'spring',
        damping: 30,
        stiffness: 300,
      }}
    >
      {/* Drag Handle - Large enough for thumb interaction (60px touch target) */}
      <div
        className="relative w-full cursor-grab active:cursor-grabbing touch-none"
        style={{
          height: '60px',
          paddingTop: '12px',
          paddingBottom: '8px',
          pointerEvents: 'auto', // Always allow handle interaction
        }}
        onPointerDown={(e) => {
          e.stopPropagation() // Prevent map interaction when dragging handle
          dragControls.start(e)
        }}
        onClick={(e) => {
          e.stopPropagation() // Prevent map click when toggling
          handleToggle()
        }}
      >
        {/* Visual drag handle */}
        <div className="w-12 h-1.5 bg-gray-500/60 dark:bg-slate-500/60 rounded-full mx-auto mb-2" />
        
        {/* Summary content when collapsed */}
        {!isExpanded && summaryContent && (
          <div className="px-4">
            {summaryContent}
          </div>
        )}

        {/* Expand/Collapse indicator */}
        <motion.div
          className="absolute left-4 top-1/2 -translate-y-1/2"
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronUp className="text-gray-400 dark:text-slate-400" size={20} />
        </motion.div>
      </div>

      {/* Content - Scrollable when expanded */}
      <motion.div
        className="overflow-y-auto h-full pb-safe"
        style={{
          height: `calc(100% - 60px)`, // Subtract handle height
          pointerEvents: isExpanded ? 'auto' : 'none',
        }}
        layout // Smooth layout animations
        onClick={(e) => {
          // Prevent map clicks when interacting with sheet content
          if (isExpanded) {
            e.stopPropagation()
          }
        }}
      >
        <div className="p-3 sm:p-4 space-y-3 sm:space-y-4">
          {children}
        </div>
      </motion.div>
    </motion.div>
  )
}
