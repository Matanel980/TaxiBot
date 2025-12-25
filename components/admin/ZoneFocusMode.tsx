'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { GoogleMap, Polygon, useJsApiLoader } from '@react-google-maps/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { BottomSheet } from '@/components/ui/bottom-sheet'
import { Switch } from '@/components/ui/switch'
import { silverMapStyle, ACRE_CENTER, GOOGLE_MAPS_LOADER_OPTIONS } from '@/lib/google-maps-loader'
import { useZoneMapEngine } from './ZoneMapEngine'
import { formatArea, geometryToGooglePaths, featureToZone } from '@/lib/spatial-utils'
import type { ZonePostGIS } from '@/lib/supabase'
import { X, Trash2, Check, Pencil, MapPin, Layers, ChevronDown } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import React from 'react'

interface ZoneFocusModeProps {
  open: boolean
  onClose: () => void
  onSave: (name: string, wkt: string, color: string, centerLat: number, centerLng: number, areaSqm: number) => void
  initialName?: string
  initialGeometry?: any // PostGIS geometry (GeoJSON)
  initialColor?: string
}

const ZONE_COLORS = [
  // Original colors (keep for existing zones)
  { name: 'צהוב', value: '#F7C948' },
  { name: 'כחול', value: '#3B82F6' },
  { name: 'ירוק', value: '#10B981' },
  { name: 'סגול', value: '#8B5CF6' },
  { name: 'ורוד', value: '#EC4899' },
  { name: 'כתום', value: '#F97316' },
  // Additional colors
  { name: 'ורוד עמוק', value: '#DC143C' }, // Crimson
  { name: 'טורקיז', value: '#14B8A6' }, // Teal
  { name: 'אינדיגו', value: '#6366F1' }, // Indigo
  { name: 'ליים', value: '#84CC16' }, // Lime
  { name: 'ענבר', value: '#F59E0B' }, // Amber
  { name: 'אדום', value: '#EF4444' }, // Red
  { name: 'כחול שמיים', value: '#0EA5E9' }, // Sky Blue
  { name: 'ירוק כהה', value: '#059669' }, // Dark Green
  { name: 'ורוד בהיר', value: '#F472B6' }, // Pink
  { name: 'סגול כהה', value: '#7C3AED' }, // Dark Purple
  { name: 'ציאן', value: '#06B6D4' }, // Cyan
  { name: 'אדום כהה', value: '#DC2626' }, // Dark Red
  { name: 'ירוק ליים', value: '#65A30D' }, // Lime Green
  { name: 'כחול כהה', value: '#1E40AF' }, // Dark Blue
  { name: 'ורוד בהיר', value: '#F43F5E' }, // Rose
  { name: 'צהוב לימון', value: '#EAB308' }, // Lemon Yellow
]

export function ZoneFocusMode({ 
  open, 
  onClose, 
  onSave, 
  initialName, 
  initialGeometry,
  initialColor 
}: ZoneFocusModeProps) {
  const { isLoaded, loadError } = useJsApiLoader(GOOGLE_MAPS_LOADER_OPTIONS)

  // Initialize all state variables first
  const [showDataEntry, setShowDataEntry] = useState(false)
  const [zoneName, setZoneName] = useState(initialName || '')
  const [existingZones, setExistingZones] = useState<ZonePostGIS[]>([])
  const [zoneVisibility, setZoneVisibility] = useState<Record<string, boolean>>({})
  const [showLayerControl, setShowLayerControl] = useState(true)
  const [isMobile, setIsMobile] = useState(false) // Safe default for SSR

  // Smart default color selection: pick least-used color
  const getDefaultColor = useCallback((zones: ZonePostGIS[], isEditing: boolean): string => {
    // If editing, use the initial color
    if (isEditing && initialColor) {
      return initialColor
    }

    // Count color usage
    const colorUsage = new Map<string, number>()
    ZONE_COLORS.forEach(color => colorUsage.set(color.value, 0))
    
    zones.forEach(zone => {
      const currentCount = colorUsage.get(zone.color || '#F7C948') || 0
      colorUsage.set(zone.color || '#F7C948', currentCount + 1)
    })

    // Find the least-used color
    let leastUsedColor = ZONE_COLORS[0].value
    let minUsage = Infinity

    ZONE_COLORS.forEach(color => {
      const usage = colorUsage.get(color.value) || 0
      if (usage < minUsage) {
        minUsage = usage
        leastUsedColor = color.value
      }
    })

    return leastUsedColor
  }, [initialColor])

  const [zoneColor, setZoneColor] = useState(() => {
    // Initialize with smart default, will be updated when zones are fetched
    return initialColor || '#F7C948'
  })

  // Use the MapEngine hook for all map logic - MUST be called before any useEffect that uses its values
  const {
    polygon,
    metadata,
    isDrawing,
    validationError,
    initializeMap,
    startDrawing,
    clearDrawing,
    cancelDrawing,
    resetDrawingState,
    defaultCenter,
    defaultZoom,
    mapRef
  } = useZoneMapEngine({
    initialGeometry,
    onPolygonComplete: (poly, meta) => {
      // Polygon completed, ready for data entry
    }
  })

  // Detect mobile device (client-side only to avoid hydration mismatch)
  useEffect(() => {
    // Only run on client
    if (typeof window === 'undefined') return

    const checkMobile = () => {
      setIsMobile(window.innerWidth < 640) // sm breakpoint
    }
    
    // Set initial value
    checkMobile()
    
    // Listen for resize events
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  // Auto-collapse layer control when drawing starts (now safe - isDrawing is defined)
  useEffect(() => {
    if (isDrawing && showLayerControl && isMobile) {
      setShowLayerControl(false)
    }
  }, [isDrawing, isMobile, showLayerControl])

  // Fetch existing zones for reference (exclude current zone if editing)
  useEffect(() => {
    if (!open) return

    const fetchZones = async () => {
      try {
        const response = await fetch('/api/zones')
        if (response.ok) {
          const featureCollection = await response.json()
          
          if (featureCollection.type === 'FeatureCollection' && featureCollection.features) {
            let zonesData = featureCollection.features.map((feature: any) => featureToZone(feature))
            
            // If editing (has initialGeometry), we need to find and exclude the current zone
            // For now, we'll show all zones - the user can toggle them off if needed
            setExistingZones(zonesData)
            
            // Initialize visibility state - all zones visible by default
            const visibility: Record<string, boolean> = {}
            zonesData.forEach((zone: ZonePostGIS) => {
              visibility[zone.id] = true
            })
            setZoneVisibility(visibility)

            // Set smart default color for new zones (only if not editing)
            const isEditing = !!(initialColor || initialGeometry)
            if (!isEditing) {
              const defaultColor = getDefaultColor(zonesData, false)
              setZoneColor(defaultColor)
            } else if (initialColor) {
              // Ensure editing zones use their existing color
              setZoneColor(initialColor)
            }
          }
        }
      } catch (error) {
        console.error('Error fetching zones:', error)
      }
    }

    fetchZones()
  }, [open, initialGeometry, initialColor, getDefaultColor])

  // Update polygon color when color changes
  useEffect(() => {
    if (polygon) {
      polygon.setOptions({
        fillColor: zoneColor,
        strokeColor: zoneColor,
      })
    }
  }, [zoneColor, polygon])

  // Update map cursor when drawing mode is active
  useEffect(() => {
    if (!isLoaded) return

    const mapElement = document.querySelector('[data-zone-focus-mode] .gm-style')
    if (mapElement && isDrawing && !polygon) {
      // Drawing mode active - show crosshair cursor
      ;(mapElement as HTMLElement).style.cursor = 'crosshair'
    } else if (mapElement) {
      // Normal mode - default cursor
      ;(mapElement as HTMLElement).style.cursor = ''
    }
  }, [isLoaded, isDrawing, polygon])

  const handleNext = () => {
    setShowDataEntry(true)
  }

  const handleClearWrapper = () => {
    clearDrawing()
    setShowDataEntry(false)
    // Re-activate drawing mode after clearing
    setTimeout(() => {
      startDrawing()
    }, 100)
  }

  const handleSaveZone = () => {
    if (!metadata || !zoneName.trim()) {
      alert('אנא הזן שם לאזור')
      return
    }

    // Save with WKT and metadata
    onSave(
      zoneName,
      metadata.wkt,
      zoneColor,
      metadata.center.lat,
      metadata.center.lng,
      metadata.area
    )
    
    // Reset drawing state after save
    resetDrawingState()
    
    // Reset form state for next zone creation
    setZoneName('')
    setShowDataEntry(false)
    
    // Close the modal
    onClose()
  }

  const handleCancel = () => {
    cancelDrawing()
    clearDrawing()
    onClose()
  }

  // Toggle zone visibility
  const toggleZoneVisibility = (zoneId: string) => {
    setZoneVisibility(prev => ({
      ...prev,
      [zoneId]: !prev[zoneId]
    }))
  }

  // Reference zone polygon component (read-only)
  const ReferenceZonePolygon = React.memo(({ zone, visible }: { zone: ZonePostGIS; visible: boolean }) => {
    if (!visible || !zone.geometry) return null

    const paths = useMemo(() => {
      try {
        return geometryToGooglePaths(zone.geometry)
      } catch (error) {
        console.error('Error parsing reference zone geometry:', error)
        return []
      }
    }, [zone.geometry])

    if (paths.length === 0) return null

    return (
      <Polygon
        paths={paths}
        options={{
          fillColor: zone.color || '#F7C948',
          fillOpacity: 0.15, // More transparent than active zone
          strokeColor: zone.color || '#F7C948',
          strokeOpacity: 0.5,
          strokeWeight: 1.5,
          clickable: false, // Non-interactive reference
          zIndex: 0, // Behind drawing polygon
        }}
      />
    )
  })

  ReferenceZonePolygon.displayName = 'ReferenceZonePolygon'

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          layoutId="zone-focus-mode"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.95 }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
          className="fixed inset-0 z-50 bg-white overflow-hidden"
          data-zone-focus-mode="true"
          style={{ pointerEvents: 'auto' }}
        >
          {/* Full-Screen Map */}
          {isLoaded ? (
            <div 
              className="w-full h-full relative" 
              style={{ pointerEvents: 'auto', zIndex: 0 }}
            >
              <GoogleMap
                mapContainerStyle={{ width: '100%', height: '100%', position: 'relative', zIndex: 0 }}
                options={{
                  center: defaultCenter,
                  zoom: defaultZoom,
                  styles: silverMapStyle,
                  disableDefaultUI: false,
                  zoomControl: true,
                  zoomControlOptions: {
                    position: google.maps.ControlPosition.RIGHT_BOTTOM,
                  },
                  streetViewControl: true,
                  streetViewControlOptions: {
                    position: google.maps.ControlPosition.RIGHT_BOTTOM,
                  },
                  mapTypeControl: false,
                  fullscreenControl: true,
                  fullscreenControlOptions: {
                    position: google.maps.ControlPosition.LEFT_TOP,
                  },
                  gestureHandling: 'greedy',
                  clickableIcons: false,
                }}
                onLoad={initializeMap}
              >
                {/* Render reference zones (existing zones) */}
                {existingZones.map((zone) => (
                  <ReferenceZonePolygon
                    key={zone.id}
                    zone={zone}
                    visible={zoneVisibility[zone.id] ?? true}
                  />
                ))}
              </GoogleMap>
            </div>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
              <div className="text-center">
                <div className="relative w-24 h-24 mx-auto mb-6">
                  <div className="absolute inset-0 animate-spin">
                    <svg className="w-full h-full text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <circle cx="12" cy="12" r="10" strokeWidth="2" strokeDasharray="3 3" opacity="0.3" />
                    </svg>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center text-5xl">
                    🗺️
                  </div>
                </div>
                <p className="text-lg text-gray-700 font-medium">טוען מפת עכו...</p>
              </div>
            </div>
          )}

          {/* Zone Layers Control - Responsive: Card on Desktop, Bottom Sheet on Mobile */}
          {isLoaded && existingZones.length > 0 && (
            <>
              {/* Desktop: Floating Card (Top Left) */}
              {showLayerControl && !isMobile && (
                <motion.div
                  initial={{ x: -300, opacity: 0 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={{ x: -300, opacity: 0 }}
                  transition={{ duration: 0.3, ease: 'easeOut', delay: 0.2 }}
                  className="hidden sm:block absolute top-6 left-6 z-[100]"
                  style={{ pointerEvents: 'none' }}
                >
                  <div 
                    className="glass-card-light rounded-2xl p-4 shadow-2xl border-2 border-white/50 backdrop-blur-xl bg-white/90 w-72"
                    style={{ pointerEvents: 'auto' }}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Layers size={18} className="text-gray-700" />
                        <h3 className="font-semibold text-gray-900 text-sm">שכבות אזורים</h3>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowLayerControl(false)}
                        className="h-6 w-6 p-0 hover:bg-white/50"
                      >
                        <X size={14} />
                      </Button>
                    </div>
                    
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                      {existingZones.map((zone, index) => (
                        <motion.div
                          key={zone.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/50 transition-colors"
                        >
                          <div
                            className="w-4 h-4 rounded-full flex-shrink-0 ring-2 ring-offset-1 ring-white shadow-sm"
                            style={{ backgroundColor: zone.color || '#F7C948' }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">
                              {zone.name}
                            </div>
                            {zone.area_sqm && (
                              <div className="text-xs text-gray-500">
                                {formatArea(zone.area_sqm)}
                              </div>
                            )}
                          </div>
                          <Switch
                            checked={zoneVisibility[zone.id] ?? true}
                            onCheckedChange={() => toggleZoneVisibility(zone.id)}
                            className="flex-shrink-0"
                          />
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Mobile: Bottom Sheet */}
              {showLayerControl && isMobile && !isDrawing && (
                <motion.div
                  initial={{ y: '100%', opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: '100%', opacity: 0 }}
                  transition={{ duration: 0.3, ease: 'easeOut' }}
                  className="sm:hidden fixed bottom-0 left-0 right-0 z-[200] pointer-events-auto safe-area-bottom"
                  style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
                >
                  <div className="glass-card-light rounded-t-3xl p-4 shadow-2xl border-t-2 border-x-2 border-white/50 backdrop-blur-2xl bg-white/95 max-h-[50vh] flex flex-col mb-16">
                    {/* Handle Bar */}
                    <div className="flex items-center justify-center mb-3">
                      <div className="w-12 h-1.5 bg-gray-300 rounded-full" />
                    </div>
                    
                    {/* Header */}
                    <div className="flex items-center justify-between mb-3 pb-3 border-b border-gray-200">
                      <div className="flex items-center gap-2">
                        <Layers size={20} className="text-gray-700" />
                        <h3 className="font-semibold text-gray-900 text-base">שכבות אזורים</h3>
                        <span className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full">
                          {existingZones.length}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setShowLayerControl(false)}
                        className="h-8 w-8 p-0 hover:bg-white/50"
                      >
                        <X size={18} />
                      </Button>
                    </div>
                    
                    {/* Zones List - Scrollable */}
                    <div className="space-y-2 overflow-y-auto flex-1 custom-scrollbar pr-1">
                      {existingZones.map((zone, index) => (
                        <motion.div
                          key={zone.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.03 }}
                          className="flex items-center gap-3 p-3 rounded-xl bg-white/50 hover:bg-white/80 transition-colors active:bg-white touch-manipulation"
                        >
                          <div
                            className="w-5 h-5 rounded-full flex-shrink-0 ring-2 ring-offset-2 ring-white shadow-md"
                            style={{ backgroundColor: zone.color || '#F7C948' }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-base font-semibold text-gray-900 truncate">
                              {zone.name}
                            </div>
                            {zone.area_sqm && (
                              <div className="text-sm text-gray-600 mt-0.5">
                                {formatArea(zone.area_sqm)}
                              </div>
                            )}
                          </div>
                          <Switch
                            checked={zoneVisibility[zone.id] ?? true}
                            onCheckedChange={() => toggleZoneVisibility(zone.id)}
                            className="flex-shrink-0 scale-110 touch-manipulation"
                          />
                        </motion.div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* FAB Toggle Button (Mobile - Bottom Right, Desktop - Top Left) */}
              {!showLayerControl && (
                <motion.button
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setShowLayerControl(true)}
                  className={`
                    fixed z-[100] glass-card-light rounded-full shadow-2xl border-2 border-white/50 
                    backdrop-blur-xl bg-white/90 hover:bg-white transition-colors touch-manipulation
                    ${isMobile 
                      ? 'bottom-24 right-4 p-4' // Above bottom nav, safe area
                      : 'sm:top-6 sm:left-6 top-20 left-4 p-3' // Desktop position
                    }
                  `}
                  style={{ 
                    pointerEvents: 'auto',
                    ...(isMobile && { 
                      marginBottom: 'env(safe-area-inset-bottom, 0px)',
                      marginRight: 'env(safe-area-inset-right, 0px)'
                    })
                  }}
                  aria-label="שכבות אזורים"
                >
                  <Layers size={isMobile ? 24 : 20} className="text-gray-700" />
                  {isMobile && existingZones.length > 0 && (
                    <span className="absolute -top-1 -right-1 w-6 h-6 bg-blue-600 text-white text-xs rounded-full flex items-center justify-center font-bold shadow-lg">
                      {existingZones.length}
                    </span>
                  )}
                </motion.button>
              )}
            </>
          )}

          {/* Custom Floating Toolbar with glassmorphism */}
          <AnimatePresence mode="wait">
            {isLoaded && (
              <motion.div
                key={isDrawing ? 'drawing' : 'finished'}
                initial={{ y: -100, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -100, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className="absolute top-6 left-1/2 -translate-x-1/2 z-[100]"
                style={{ pointerEvents: 'none' }}
              >
                <div className="glass-card-light rounded-2xl p-4 shadow-2xl border-2 border-white/50 backdrop-blur-xl bg-white/80" style={{ pointerEvents: 'auto' }}>
                  {isDrawing ? (
                    /* State A: Drawing */
                    <div className="flex items-center gap-3">
                      <Button
                        onClick={startDrawing}
                        className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg"
                      >
                        <Pencil className="ml-2" size={18} />
                        התחל לצייר
                      </Button>
                      <Button
                        onClick={handleClearWrapper}
                        variant="outline"
                        disabled={!polygon}
                        className="bg-white/90 hover:bg-white backdrop-blur-sm"
                      >
                        <Trash2 className="ml-2" size={18} />
                        נקה
                      </Button>
                      <Button
                        onClick={handleCancel}
                        variant="ghost"
                        className="bg-white/90 hover:bg-white backdrop-blur-sm"
                      >
                        <X className="ml-2" size={18} />
                        ביטול
                      </Button>
                    </div>
                  ) : (
                    /* State B: Finished */
                    <motion.div
                      initial={{ scale: 0.9 }}
                      animate={{ scale: 1 }}
                      className="flex items-center gap-3"
                    >
                      <div className="text-green-600 font-medium flex items-center gap-2">
                        <Check size={20} className="animate-pulse" />
                        <span>הפוליגון הושלם</span>
                      </div>
                      <Button
                        onClick={handleNext}
                        className="bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white shadow-lg"
                      >
                        המשך
                        <Check className="mr-2" size={18} />
                      </Button>
                      <Button
                        onClick={handleClearWrapper}
                        variant="outline"
                        className="bg-white/90 hover:bg-white backdrop-blur-sm"
                      >
                        <Trash2 className="ml-2" size={18} />
                        צייר מחדש
                      </Button>
                      <Button
                        onClick={handleCancel}
                        variant="ghost"
                        className="bg-white/90 hover:bg-white backdrop-blur-sm"
                      >
                        <X className="ml-2" size={18} />
                        ביטול
                      </Button>
                    </motion.div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Instructions Badge */}
          {isLoaded && isDrawing && !polygon && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ delay: 0.5 }}
              className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[100]"
              style={{ pointerEvents: 'none' }}
            >
              <div className="glass-card-light rounded-full px-6 py-3 shadow-xl backdrop-blur-xl bg-white/80 border-2 border-white/50" style={{ pointerEvents: 'none' }}>
                <div className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <MapPin size={16} className="text-blue-600" />
                  לחץ על "התחל לצייר" וצייר פוליגון על המפה
                </div>
              </div>
            </motion.div>
          )}

          {/* Validation Error */}
          {validationError && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="absolute top-24 left-1/2 -translate-x-1/2 z-[100]"
              style={{ pointerEvents: 'none' }}
            >
              <div className="bg-red-500 text-white px-6 py-3 rounded-xl shadow-xl" style={{ pointerEvents: 'auto' }}>
                <div className="text-sm font-medium">{validationError}</div>
              </div>
            </motion.div>
          )}

          {/* Data Entry Bottom Sheet */}
          <div className="relative z-[200]">
            <BottomSheet
              open={showDataEntry}
              onOpenChange={setShowDataEntry}
              title="פרטי האזור"
            >
            <div className="space-y-6">
              {/* Zone Name */}
              <div className="space-y-2">
                <Label htmlFor="zone_name" className="text-base font-semibold">
                  שם האזור *
                </Label>
                <Input
                  id="zone_name"
                  value={zoneName}
                  onChange={(e) => setZoneName(e.target.value)}
                  placeholder='למשל: "עכו העתיקה", "מזרח עכו"'
                  className="text-base h-12"
                  autoFocus
                />
              </div>

              {/* Color Picker */}
              <div className="space-y-3">
                <Label className="text-base font-semibold">צבע האזור</Label>
                <div className="max-h-64 overflow-y-auto pr-1 custom-scrollbar">
                  <div className="grid grid-cols-6 gap-3">
                    {ZONE_COLORS.map((color) => (
                      <motion.button
                        key={color.value}
                        whileTap={{ scale: 0.9 }}
                        whileHover={{ scale: 1.05 }}
                        onClick={() => setZoneColor(color.value)}
                        className={`
                          w-full aspect-square rounded-xl transition-all duration-200
                          ${zoneColor === color.value 
                            ? 'ring-4 ring-offset-2 ring-blue-500 scale-110' 
                            : 'hover:scale-105 ring-2 ring-gray-200'
                          }
                        `}
                        style={{ backgroundColor: color.value }}
                        title={color.name}
                      />
                    ))}
                  </div>
                </div>
              </div>

              {/* Metadata Display */}
              {metadata && (
                <div className="p-4 bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl border border-blue-100">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">שטח:</span>
                      <span className="font-semibold text-gray-900">{formatArea(metadata.area)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">מרכז:</span>
                      <span className="font-mono text-xs text-gray-700">
                        {metadata.center.lat.toFixed(4)}, {metadata.center.lng.toFixed(4)}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* Preview */}
              <div className="p-4 bg-gray-50 rounded-xl">
                <div className="flex items-center gap-3">
                  <div
                    className="w-12 h-12 rounded-lg shadow-sm"
                    style={{ backgroundColor: zoneColor }}
                  />
                  <div className="flex-1">
                    <div className="text-sm text-gray-500">תצוגה מקדימה</div>
                    <div className="font-semibold text-gray-900">
                      {zoneName || 'שם האזור'}
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-4">
                <Button
                  onClick={handleSaveZone}
                  disabled={!zoneName.trim() || !metadata}
                  className="flex-1 h-12 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white shadow-lg text-base"
                >
                  שמור אזור
                </Button>
                <Button
                  onClick={() => setShowDataEntry(false)}
                  variant="outline"
                  className="h-12 px-6"
                >
                  חזור
                </Button>
              </div>
            </div>
          </BottomSheet>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

