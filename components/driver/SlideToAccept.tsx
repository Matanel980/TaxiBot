'use client'

import { useState } from 'react'
import { motion, useMotionValue, useTransform } from 'framer-motion'
import { Check } from 'lucide-react'

interface SlideToAcceptProps {
  onAccept: () => void
  disabled?: boolean
}

export function SlideToAccept({ onAccept, disabled }: SlideToAcceptProps) {
  const [isAccepted, setIsAccepted] = useState(false)
  const x = useMotionValue(0)
  const width = 300
  const threshold = width * 0.8

  const opacity = useTransform(x, [0, threshold], [1, 0])
  const scale = useTransform(x, [0, threshold], [1, 0.8])

  const handleDragEnd = () => {
    if (x.get() >= threshold && !isAccepted) {
      setIsAccepted(true)
      onAccept()
    } else {
      x.set(0)
    }
  }

  if (isAccepted) {
    return (
      <motion.div
        className="flex items-center justify-center h-16 bg-green-500 rounded-full text-white font-semibold"
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
      >
        <Check size={24} className="ml-2" />
        <span>נסיעה אושרה!</span>
      </motion.div>
    )
  }

  return (
    <div className="relative h-16 bg-slate-700 rounded-full overflow-hidden">
      <motion.div
        className="absolute inset-0 flex items-center justify-center text-white font-semibold z-10"
        style={{ opacity }}
      >
        <span>גרור לאישור נסיעה</span>
      </motion.div>
      
      <motion.div
        drag="x"
        dragConstraints={{ left: 0, right: width - 60 }}
        dragElastic={0.2}
        onDragEnd={handleDragEnd}
        className="absolute right-0 top-0 bottom-0 w-16 bg-taxi-yellow rounded-full flex items-center justify-center cursor-grab active:cursor-grabbing z-20"
        style={{ x, scale }}
      >
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
        >
          →
        </motion.div>
      </motion.div>
    </div>
  )
}


