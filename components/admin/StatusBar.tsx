'use client'

import { Users, AlertCircle, CheckCircle } from 'lucide-react'
import React from 'react'

interface StatusBarProps {
  activeDrivers: number
  pendingTrips: number
  completedToday: number
  children?: React.ReactNode
}

export function StatusBar({ activeDrivers, pendingTrips, completedToday, children }: StatusBarProps) {
  return (
    <div className="h-14 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800 flex items-center justify-between px-6 z-10">
      <div className="flex items-center gap-8">
        {/* Active Drivers */}
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-sm text-slate-300 font-medium">נהגים פעילים</span>
          <span className="text-sm font-bold text-white">{activeDrivers}</span>
        </div>

        {/* Pending Trips */}
        <div className="flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-orange-400" />
          <span className="text-sm text-slate-300 font-medium">ממתינות</span>
          <span className="text-sm font-bold text-orange-400">{pendingTrips}</span>
        </div>

        {/* Completed Today */}
        <div className="flex items-center gap-2">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span className="text-sm text-slate-300 font-medium">הושלמו היום</span>
          <span className="text-sm font-bold text-emerald-400">{completedToday}</span>
        </div>
      </div>

      {/* Right side - Children (tabs/buttons) & Time */}
      <div className="flex items-center gap-4">
        {children}
        <div className="text-xs text-slate-400 font-mono">
          {new Date().toLocaleTimeString('he-IL', { hour: '2-digit', minute: '2-digit' })}
        </div>
      </div>
    </div>
  )
}

