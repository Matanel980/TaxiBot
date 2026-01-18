'use client'

import dynamic from 'next/dynamic'

// Dynamic import to prevent SSR issues with Google Maps
// Using Promise.resolve to ensure client-side only rendering
const MapComponent = dynamic(
  () => Promise.resolve(
    import('./DriverMapClient').then(mod => ({ default: mod.DriverMapClient }))
  ),
  { 
    ssr: false,
    loading: () => (
      <div className="h-full w-full bg-gray-900 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-taxi-yellow mx-auto mb-4"></div>
          <p className="text-white">טוען מפה...</p>
        </div>
      </div>
    )
  }
)

interface DriverMapProps {
  userPosition?: { lat: number; lng: number } | null
  heading?: number | null // Driver heading/orientation in degrees (0-360)
  className?: string
  onLocationMarked?: (location: { lat: number; lng: number; address?: string }) => void
  onAddressSearch?: (address: string) => void
}

export function DriverMap({ userPosition, heading, className = '', onLocationMarked, onAddressSearch }: DriverMapProps) {
  return (
    <div className={`absolute inset-0 z-0 ${className}`}>
      <MapComponent 
        userPosition={userPosition}
        heading={heading}
        onLocationMarked={onLocationMarked}
        onAddressSearch={onAddressSearch}
      />
    </div>
  )
}
