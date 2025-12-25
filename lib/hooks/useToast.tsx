'use client'

import { toast } from 'sonner'
import { mapErrorToHebrew } from '@/lib/toast-utils'
import { CheckCircle2, XCircle, Info, AlertCircle } from 'lucide-react'

/**
 * Custom toast hook with Hebrew error mapping and Apple-style design
 */
export function useToast() {
  const showSuccess = (message: string, description?: string) => {
    toast.success(message, {
      description,
      icon: <CheckCircle2 className="w-5 h-5 text-green-600" />,
      duration: 3000,
    })
  }

  const showError = (error: string | Error | unknown, description?: string) => {
    const hebrewMessage = mapErrorToHebrew(error)
    toast.error(hebrewMessage, {
      description,
      icon: <XCircle className="w-5 h-5 text-red-600" />,
      duration: 5000,
    })
  }

  const showInfo = (message: string, description?: string) => {
    toast.info(message, {
      description,
      icon: <Info className="w-5 h-5 text-blue-600" />,
      duration: 3000,
    })
  }

  const showWarning = (message: string, description?: string) => {
    toast.warning(message, {
      description,
      icon: <AlertCircle className="w-5 h-5 text-yellow-600" />,
      duration: 4000,
    })
  }

  return {
    success: showSuccess,
    error: showError,
    info: showInfo,
    warning: showWarning,
  }
}

