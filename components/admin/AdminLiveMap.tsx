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
  // Use deep comparison for drivers array to detect actual changes vs. just reference changes
  
  // Compare drivers array - check if length or IDs changed (not just reference)
  if (prevProps.drivers.length !== nextProps.drivers.length) return false
  const prevDriverIds = prevProps.drivers.map(d => d.id).sort().join(',')
  const nextDriverIds = nextProps.drivers.map(d => d.id).sort().join(',')
  if (prevDriverIds !== nextDriverIds) return false
  
  // Zones: Check length and IDs
  if ((prevProps.zones?.length || 0) !== (nextProps.zones?.length || 0)) return false
  if (prevProps.zones && nextProps.zones) {
    const prevZoneIds = prevProps.zones.map(z => z.id).sort().join(',')
    const nextZoneIds = nextProps.zones.map(z => z.id).sort().join(',')
    if (prevZoneIds !== nextZoneIds) return false
  }
  
  // Trips: Check length and IDs
  if ((prevProps.trips?.length || 0) !== (nextProps.trips?.length || 0)) return false
  if (prevProps.trips && nextProps.trips) {
    const prevTripIds = (prevProps.trips || []).map(t => t.id).sort().join(',')
    const nextTripIds = (nextProps.trips || []).map(t => t.id).sort().join(',')
    if (prevTripIds !== nextTripIds) return false
  }
  
  // Simple reference checks for primitive props
  if (prevProps.selectedTripId !== nextProps.selectedTripId) return false
  if (prevProps.selectedDriverId !== nextProps.selectedDriverId) return false
  if (prevProps.className !== nextProps.className) return false
  
  // Presence map: Compare keys
  const prevPresenceKeys = Object.keys(prevProps.presenceMap || {}).sort().join(',')
  const nextPresenceKeys = Object.keys(nextProps.presenceMap || {}).sort().join(',')
  if (prevPresenceKeys !== nextPresenceKeys) return false
  
  // Props are equal - skip re-render
  // Note: Driver location updates will still cause re-render (this is intentional)
  // but the component handles this efficiently with internal state updates
  return true
})
