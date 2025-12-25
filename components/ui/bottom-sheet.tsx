'use client'

import * as React from 'react'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'
import { useMediaQuery } from '@/lib/hooks/useMediaQuery'

interface BottomSheetProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  children: React.ReactNode
  title?: string
  description?: string
  className?: string
}

export function BottomSheet({ open, onOpenChange, children, title, description, className }: BottomSheetProps) {
  const isMobile = useMediaQuery('(max-width: 768px)')
  
  if (!open) return null

  if (isMobile) {
    // Mobile: Bottom sheet sliding up from bottom
    return (
      <div className="fixed inset-0 z-50">
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
          onClick={() => onOpenChange?.(false)}
        />
        <div className={cn(
          "fixed bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-2xl z-50 max-h-[90vh] overflow-y-auto animate-slide-up",
          className
        )}>
          {/* Drag handle */}
          <div className="sticky top-0 bg-white border-b border-gray-200 p-4 rounded-t-3xl">
            <div className="w-12 h-1.5 bg-gray-300 rounded-full mx-auto mb-2" />
            {title && (
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
                  {description && (
                    <div className="text-sm text-gray-500 mt-1">{description}</div>
                  )}
                </div>
                <button
                  onClick={() => onOpenChange?.(false)}
                  className="rounded-full p-2 hover:bg-gray-100 transition-colors"
                >
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>
            )}
          </div>
          <div className="p-4 pb-safe">{children}</div>
        </div>
      </div>
    )
  }

  // Desktop: Center modal
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-sm animate-fade-in"
        onClick={() => onOpenChange?.(false)}
      />
      <div className={cn(
        "relative z-50 bg-white rounded-2xl shadow-2xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto",
        className
      )}>
        {title && (
          <div className="sticky top-0 bg-white border-b border-gray-200 p-6 flex items-center justify-between rounded-t-2xl">
            <div>
              <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
              {description && (
                <div className="text-sm text-gray-500 mt-1">{description}</div>
              )}
            </div>
            <button
              onClick={() => onOpenChange?.(false)}
              className="rounded-full p-2 hover:bg-gray-100 transition-colors"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  )
}

