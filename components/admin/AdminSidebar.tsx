'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Users, MapPin, History, Map } from 'lucide-react'
import { cn } from '@/lib/utils'

const navItems = [
  { href: '/admin/dashboard', icon: LayoutDashboard, label: 'דאשבורד' },
  { href: '/admin/map', icon: Map, label: 'מפה מלאה' },
  { href: '/admin/drivers', icon: Users, label: 'נהגים' },
  { href: '/admin/zones', icon: MapPin, label: 'אזורים' },
  { href: '/admin/history', icon: History, label: 'היסטוריה' },
]

export function AdminSidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden lg:block w-64 bg-deep-blue/95 backdrop-blur-xl text-white min-h-screen p-6 border-r border-white/10">
      <div className="mb-8">
        <h1 className="text-2xl font-bold">TaxiFlow</h1>
        <p className="text-sm text-gray-300 mt-1">מנהל תחנה</p>
      </div>

      <nav className="space-y-2">
        {navItems.map((item) => {
          const Icon = item.icon
          const isActive = pathname === item.href
          
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-4 py-3 rounded-lg transition-colors",
                isActive
                  ? "bg-white/10 text-white"
                  : "text-gray-300 hover:bg-white/5 hover:text-white"
              )}
            >
              <Icon size={20} />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}

