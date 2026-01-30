'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, useMotionValue, useSpring, PanInfo, useDragControls } from 'framer-motion'
import { useMediaQuery } from '@/lib/hooks/useMediaQuery'
import { ChevronUp } from 'lucide-react'

interface CollapsibleTripSheetProps {
  children: React.ReactNode
  summaryContent?: React.ReactNode
  defaultExpanded?: boolean
}

// Snap points: [collapsed, expanded]
// Collapsed: 80px (handle + summary)
// Expanded: 70% of viewport height
const COLLAPSED_HEIGHT = 80
const EXPANDED_PERCENTAGE = 0.7

export function CollapsibleTripSheet({
  children,
  summaryContent,
  defaultExpanded = true,
}: CollapsibleTripSheetProps) {
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
  // maxDrag is already calculated above
  // Calculate drag constraints: sheet can move from 0 (fully expanded) to maxDrag (collapsed)

  return (
    <motion.div
      ref={sheetRef}
      className="fixed bottom-0 left-0 right-0 z-40 bg-slate-900/95 backdrop-blur-xl rounded-t-3xl shadow-2xl overflow-hidden"
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
      {/* CRITICAL: Handle always receives touch events, even when collapsed */}
      <div
        className="relative w-full cursor-grab active:cursor-grabbing"
        style={{
          height: '60px',
          paddingTop: '12px',
          paddingBottom: '8px',
          touchAction: 'none', // Prevent default touch behaviors for smooth dragging
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
        <div className="w-12 h-1.5 bg-slate-500/60 rounded-full mx-auto mb-2" />
        
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
          <ChevronUp className="text-slate-400" size={20} />
        </motion.div>
      </div>

      {/* Content - Scrollable when expanded */}
      {/* CRITICAL: Content area blocks map interaction when expanded, allows pass-through when collapsed */}
      <motion.div
        className="overflow-y-auto h-full pb-safe"
        style={{
          height: `calc(100% - 60px)`, // Subtract handle height
          // When collapsed, content area is hidden so pointer events don't matter
          // When expanded, content area receives all events
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
        <div className="h-full">
          {children}
        </div>
      </motion.div>
    </motion.div>
  )
}
