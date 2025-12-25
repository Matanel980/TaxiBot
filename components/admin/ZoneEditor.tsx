'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { ZoneFocusMode } from '@/components/admin/ZoneFocusMode'
import { Plus, Trash2, Edit2 } from 'lucide-react'
import type { ZonePostGIS } from '@/lib/supabase'

interface ZoneEditorProps {
  zones: ZonePostGIS[]
  onZoneCreate: (name: string, wkt: string, color: string, centerLat: number, centerLng: number, areaSqm: number) => Promise<void>
  onZoneUpdate: (id: string, name: string, wkt: string, color: string, centerLat: number, centerLng: number, areaSqm: number) => Promise<void>
  onZoneDelete: (id: string) => Promise<void>
}

export function ZoneEditor({ zones, onZoneCreate, onZoneUpdate, onZoneDelete }: ZoneEditorProps) {
  const [focusModeOpen, setFocusModeOpen] = useState(false)
  const [editingZone, setEditingZone] = useState<ZonePostGIS | null>(null)

  const handleCreateClick = () => {
    setEditingZone(null)
    setFocusModeOpen(true)
  }

  const handleEditClick = (zone: ZonePostGIS) => {
    setEditingZone(zone)
    setFocusModeOpen(true)
  }

  const handleSave = async (
    name: string, 
    wkt: string, 
    color: string, 
    centerLat: number, 
    centerLng: number, 
    areaSqm: number
  ) => {
    if (editingZone) {
      await onZoneUpdate(editingZone.id, name, wkt, color, centerLat, centerLng, areaSqm)
    } else {
      await onZoneCreate(name, wkt, color, centerLat, centerLng, areaSqm)
    }
    setFocusModeOpen(false)
    setEditingZone(null)
  }

  const handleClose = () => {
    setFocusModeOpen(false)
    setEditingZone(null)
  }

  return (
    <>
      <div className="space-y-4">
        {/* Create New Zone - Original Button Style Restored */}
        <Card className="glass-card rounded-2xl border-2 border-dashed border-gray-300 hover:border-blue-400 transition-colors">
          <CardContent className="p-8">
            <Button 
              onClick={handleCreateClick} 
              className="w-full h-16 text-lg"
            >
              <Plus className="ml-2" size={24} />
              צור אזור חדש
            </Button>
          </CardContent>
        </Card>

        {/* Zones List */}
        <div className="space-y-3">
          {zones.length === 0 ? (
            <Card className="glass-card rounded-2xl">
              <CardContent className="p-8 text-center text-gray-500">
                <div className="text-4xl mb-2">🗺️</div>
                <div>אין אזורים עדיין. צור את האזור הראשון!</div>
              </CardContent>
            </Card>
          ) : (
            zones.map((zone) => (
              <Card key={zone.id} className="glass-card rounded-2xl hover:shadow-lg transition-shadow">
                <CardContent className="p-5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div
                        className="w-12 h-12 rounded-xl shadow-sm ring-2 ring-offset-2 ring-white"
                        style={{ 
                          backgroundColor: zone.color || '#F7C948',
                        }}
                      />
                      <div>
                        <h3 className="font-bold text-gray-900 text-lg">{zone.name}</h3>
                        <div className="flex items-center gap-3 text-sm text-gray-500">
                          {zone.area_sqm && (
                            <span>📏 {(zone.area_sqm / 1000).toFixed(2)} דונם</span>
                          )}
                          {zone.geometry && <span className="text-green-600">✓ PostGIS</span>}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEditClick(zone)}
                        className="hover:bg-blue-50"
                      >
                        <Edit2 size={16} className="ml-1" />
                        ערוך
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => onZoneDelete(zone.id)}
                        className="hover:bg-red-50 hover:text-red-600 hover:border-red-300"
                      >
                        <Trash2 size={16} className="ml-1" />
                        מחק
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Zone Focus Mode */}
      <ZoneFocusMode
        open={focusModeOpen}
        onClose={handleClose}
        onSave={handleSave}
        initialName={editingZone?.name}
        initialGeometry={editingZone?.geometry}
        initialColor={editingZone?.color}
      />
    </>
  )
}
