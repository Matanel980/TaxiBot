'use client'

import dynamic from 'next/dynamic'
import type { Profile, ZonePostGIS } from '@/lib/supabase'

// Dynamic import to prevent SSR issues with Google Maps
// Using Promise.resolve to ensure client-side only rendering
const MapComponent = dynamic(
  () => Promise.resolve(
    import('./AdminLiveMapClient').then(mod => ({ default: mod.AdminLiveMapClient }))
  ),
  { 
    ssr: false,
    loading: () => (
      <div className="h-full w-full bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white">טוען מפה...</p>
        </div>
      </div>
    )
  }
)

interface AdminLiveMapProps {
  drivers: Profile[]
  zones?: ZonePostGIS[]
  presenceMap?: Record<string, boolean>
  className?: string
}

export function AdminLiveMap({ drivers, zones, presenceMap = {}, className = '' }: AdminLiveMapProps) {
  return (
    <div className={`relative w-full h-full ${className}`}>
      <MapComponent drivers={drivers} zones={zones} presenceMap={presenceMap} />
    </div>
  )
}
