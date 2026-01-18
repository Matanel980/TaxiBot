'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, MapPin, User } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/driver/dashboard', icon: Home, label: 'בית' },
  { href: '/driver/trips', icon: MapPin, label: 'נסיעות' },
  { href: '/driver/profile', icon: User, label: 'פרופיל' },
]

export function DriverNav() {
  const pathname = usePathname()

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t border-slate-800 z-50">
      <div className="flex justify-around items-center h-16">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center flex-1 h-full transition-colors",
                isActive
                  ? "text-taxi-yellow"
                  : "text-gray-400 hover:text-gray-300"
              )}
            >
              <Icon size={24} />
              <span className="text-xs mt-1">{item.label}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}









