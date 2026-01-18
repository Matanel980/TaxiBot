'use client'

import { memo } from 'react'
import dynamic from 'next/dynamic'
import type { Profile, ZonePostGIS, Trip } from '@/lib/supabase'
import { MapErrorBoundary } from './MapErrorBoundary'

// Dynamic import to prevent SSR issues with Google Maps
// Using Promise.resolve to ensure client-side only rendering
const MapComponent = dynamic(
  () => Promise.resolve(
    import('./AdminLiveMapClient').then(mod => ({ default: mod.AdminLiveMapClient }))
  ),
  { 
    ssr: false,
    loading: () => (
      <div className="h-full w-full bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-300">טוען מפה...</p>
        </div>
      </div>
    )
  }
)

interface AdminLiveMapProps {
  drivers: Profile[]
  zones?: ZonePostGIS[]
  trips?: Trip[]
  selectedTripId?: string | null
  presenceMap?: Record<string, boolean>
  className?: string
  selectedDriverId?: string // Optional: external driver selection control
  onDriverSelect?: (driver: Profile | null) => void // Optional: callback for driver selection
}

// Memoize to prevent re-renders when parent updates but props haven't changed
// Only re-renders when drivers, zones, trips, or other props actually change
export const AdminLiveMap = memo(function AdminLiveMap({ 
  drivers, 
  zones,
  trips = [],
  selectedTripId = null,
  presenceMap = {}, 
  className = '',
  selectedDriverId,
  onDriverSelect
}: AdminLiveMapProps) {
  return (
    <MapErrorBoundary>
      <div className={`relative w-full h-full ${className}`}>
        <MapComponent 
          drivers={drivers} 
          zones={zones}
          trips={trips}
          selectedTripId={selectedTripId}
          presenceMap={presenceMap}
          selectedDriverId={selectedDriverId}
          onDriverSelect={onDriverSelect}
        />
      </div>
    </MapErrorBoundary>
  )
}, (prevProps, nextProps) => {
  // Custom comparison: Only re-render if drivers, zones, trips, or selectedTripId actually changed
  // Use shallow comparison for arrays/objects - React.memo does reference equality by default
  if (prevProps.drivers !== nextProps.drivers) return false
  if (prevProps.zones !== nextProps.zones) return false
  if (prevProps.trips !== nextProps.trips) return false
  if (prevProps.selectedTripId !== nextProps.selectedTripId) return false
  if (prevProps.selectedDriverId !== nextProps.selectedDriverId) return false
  if (prevProps.presenceMap !== nextProps.presenceMap) return false
  if (prevProps.className !== nextProps.className) return false
  // Props are equal - skip re-render
  return true
})
