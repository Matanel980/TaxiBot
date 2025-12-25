'use client'

import { Switch } from '@/components/ui/switch'
import { motion } from 'framer-motion'
import { Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatusToggleProps {
  isOnline: boolean
  onToggle: (checked: boolean) => void
  loading?: boolean
}

export function StatusToggle({ isOnline, onToggle, loading }: StatusToggleProps) {
  return (
    <motion.div
      className="flex flex-col items-center gap-4 p-6"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="text-center">
        <h3 className="text-xl font-semibold mb-2">סטטוס נהג</h3>
        <p className="text-sm text-gray-400">
          {isOnline ? 'אתה מחובר ומזמין נסיעות' : 'אתה מנותק'}
        </p>
      </div>
      
      <motion.div
        className="relative"
        whileTap={{ scale: 0.95 }}
      >
        {loading ? (
          <Loader2 className="w-16 h-16 text-taxi-yellow animate-spin" />
        ) : (
          <div className="flex items-center gap-4">
            <span className={cn("text-sm font-medium", !isOnline && "text-gray-400")}>
              מנותק
            </span>
            <Switch
              checked={isOnline}
              onCheckedChange={onToggle}
              className="w-20 h-10"
            />
            <span className={cn("text-sm font-medium", isOnline && "text-taxi-yellow")}>
              מחובר
            </span>
          </div>
        )}
      </motion.div>
    </motion.div>
  )
}

