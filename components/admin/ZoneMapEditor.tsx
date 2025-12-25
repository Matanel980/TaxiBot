'use client'

import { useEffect, useRef, useState, useCallback } from 'react'
import { GoogleMap, useJsApiLoader } from '@react-google-maps/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { silverMapStyle, ACRE_CENTER, GOOGLE_MAPS_LOADER_OPTIONS } from '@/lib/google-maps-loader'
import { Save, X } from 'lucide-react'

type GeoJSONPolygon = {
  type: 'Polygon'
  coordinates: number[][][]
}

interface ZoneMapEditorProps {
  onSave: (name: string, coordinates: GeoJSON.Polygon) => void
  onCancel: () => void
  initialName?: string
  initialCoordinates?: GeoJSON.Polygon
}

const containerStyle = {
  width: '100%',
  height: '400px',
}

export function ZoneMapEditor({ onSave, onCancel, initialName, initialCoordinates }: ZoneMapEditorProps) {
  const { isLoaded, loadError } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS)

  const [zoneName, setZoneName] = useState(initialName || '')
  const [polygon, setPolygon] = useState<google.maps.Polygon | null>(null)
  const mapRef = useRef<google.maps.Map | null>(null)
  const drawingManagerRef = useRef<google.maps.drawing.DrawingManager | null>(null)

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map

    if (typeof window === 'undefined' || !window.google) {
      console.error('Google Maps not loaded')
      return
    }

    // Check if drawing library is available
    if (!window.google.maps.drawing) {
      console.error('Drawing library not loaded. Please ensure "drawing" is in the libraries array.')
      alert('שגיאה בטעינת ספריית הציור. אנא רענן את הדף.')
      return
    }

    // Create drawing manager
    const drawingMgr = new window.google.maps.drawing.DrawingManager({
      drawingMode: window.google.maps.drawing.OverlayType.POLYGON,
      drawingControl: true,
      drawingControlOptions: {
        position: window.google.maps.ControlPosition.TOP_CENTER,
        drawingModes: [window.google.maps.drawing.OverlayType.POLYGON],
      },
      polygonOptions: {
        fillColor: '#F7C948',
        fillOpacity: 0.3,
        strokeWeight: 2,
        strokeColor: '#F7C948',
        clickable: false,
        editable: true,
        zIndex: 1,
      },
    })

    drawingMgr.setMap(map)
    drawingManagerRef.current = drawingMgr

    // Listen for polygon completion
    window.google.maps.event.addListener(drawingMgr, 'overlaycomplete', (event: any) => {
      if (event.type === window.google.maps.drawing.OverlayType.POLYGON) {
        // Remove previous polygon if exists
        if (polygon) {
          polygon.setMap(null)
        }
        
        const newPolygon = event.overlay as google.maps.Polygon
        setPolygon(newPolygon)
        drawingMgr.setDrawingMode(null)
      }
    })

    // Load initial polygon if provided
    if (initialCoordinates && initialCoordinates.coordinates && initialCoordinates.coordinates[0]) {
      const path = initialCoordinates.coordinates[0].map((coord) => {
        // Handle both [lng, lat] and [lat, lng] formats
        const [first, second] = coord
        // If first is > 90, it's likely longitude (lng, lat format)
        const lat = Math.abs(first) > 90 ? second : first
        const lng = Math.abs(first) > 90 ? first : second
        return { lat, lng }
      })

      const existingPolygon = new window.google.maps.Polygon({
        paths: path,
        fillColor: '#F7C948',
        fillOpacity: 0.3,
        strokeWeight: 2,
        strokeColor: '#F7C948',
        editable: true,
        map: map,
      })

      setPolygon(existingPolygon)
      
      // Fit bounds to polygon
      const bounds = new window.google.maps.LatLngBounds()
      path.forEach(p => bounds.extend(new window.google.maps.LatLng(p.lat, p.lng)))
      map.fitBounds(bounds)
    }
  }, [initialCoordinates])

  const handleSave = () => {
    if (!polygon || !zoneName.trim()) {
      alert('אנא הזן שם אזור וצייר פוליגון על המפה')
      return
    }

    const paths = polygon.getPath()
    const coordinates: number[][] = []
    
    paths.forEach((latLng) => {
      coordinates.push([latLng.lng(), latLng.lat()])
    })

    // Close the polygon
    if (coordinates.length > 0 && coordinates[0][0] !== coordinates[coordinates.length - 1][0]) {
      coordinates.push([coordinates[0][0], coordinates[0][1]])
    }

    const geoJsonPolygon: GeoJSONPolygon = {
      type: 'Polygon',
      coordinates: [coordinates],
    }

    onSave(zoneName, geoJsonPolygon)
  }

  useEffect(() => {
    return () => {
      // Cleanup
      if (drawingManagerRef.current) {
        drawingManagerRef.current.setMap(null)
      }
      if (polygon) {
        polygon.setMap(null)
      }
    }
  }, [])

  if (loadError) {
    return (
      <div className="h-96 flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-slate-800 dark:to-slate-900 rounded-lg border border-blue-100 dark:border-slate-700">
        <div className="text-center p-8 max-w-md">
          <div className="w-16 h-16 bg-blue-100 dark:bg-slate-700 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg className="w-8 h-8 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
          </div>
          <p className="text-lg font-semibold text-gray-800 dark:text-gray-200 mb-2">לא ניתן לטעון את המפה</p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            ייתכן ש-Google Maps API לא הופעל או שמפתח ה-API אינו תקין
          </p>
          <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-slate-600 rounded-lg p-3 text-xs text-right text-gray-700 dark:text-gray-300">
            <p className="font-medium mb-1">כדי לפתור:</p>
            <ol className="list-decimal list-inside space-y-1">
              <li>בדוק שהגדרת NEXT_PUBLIC_GOOGLE_MAPS_API_KEY</li>
              <li>הפעל את Google Maps JavaScript API ב-Google Cloud Console</li>
              <li>רענן את הדף</li>
            </ol>
          </div>
        </div>
      </div>
    )
  }

  if (!isLoaded) {
    return (
      <div className="h-96 flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-800 dark:to-slate-900 rounded-lg border border-gray-200 dark:border-slate-700">
        <div className="text-center">
          <div className="relative w-20 h-20 mx-auto mb-4">
            {/* Animated globe icon */}
            <div className="absolute inset-0 animate-spin">
              <svg className="w-full h-full text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" strokeWidth="2" strokeDasharray="3 3" opacity="0.3" />
              </svg>
            </div>
            <div className="absolute inset-0 flex items-center justify-center">
              <svg className="w-12 h-12 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
          </div>
          <p className="text-gray-700 dark:text-gray-300 font-medium mb-1">טוען מפה...</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">מכין את כלי הציור</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="zone_name">שם האזור *</Label>
        <Input
          id="zone_name"
          value={zoneName}
          onChange={(e) => setZoneName(e.target.value)}
          placeholder="שם האזור"
        />
      </div>

      <div className="rounded-lg overflow-hidden border border-gray-200">
        <GoogleMap
          mapContainerStyle={containerStyle}
          options={{
            center: ACRE_CENTER,
            zoom: 13,
            styles: silverMapStyle,
            disableDefaultUI: false,
            zoomControl: true,
            mapTypeControl: true,
          }}
          onLoad={onLoad}
        />
      </div>

      <div className="flex gap-2 justify-end">
        <Button variant="outline" onClick={onCancel}>
          <X className="ml-2" size={16} />
          ביטול
        </Button>
        <Button onClick={handleSave} disabled={!polygon || !zoneName.trim()}>
          <Save className="ml-2" size={16} />
          שמור אזור
        </Button>
      </div>

      <p className="text-xs text-gray-500 text-center">
        השתמש בכלי הציור למעלה כדי לצייר פוליגון על המפה
      </p>
    </div>
  )
}
