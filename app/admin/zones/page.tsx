'use client'

import { ZoneManagement } from '@/components/admin/ZoneManagement'
import { ZoneEditor } from '@/components/admin/ZoneEditor'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Profile, ZonePostGIS } from '@/lib/supabase'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { featureToZone } from '@/lib/spatial-utils'
import { useToast } from '@/lib/hooks/useToast'

export default function AdminZonesPage() {
  const [zones, setZones] = useState<ZonePostGIS[]>([])
  const [drivers, setDrivers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const toast = useToast()

  const fetchZones = async () => {
    try {
      // First try PostGIS table
      const { data: postgisData, error: postgisError } = await supabase
        .from('zones_postgis')
        .select('*')

      if (postgisData && postgisData.length > 0) {
        setZones(postgisData as ZonePostGIS[])
        return
      }

      // Fallback: fetch via API (which returns GeoJSON)
      const response = await fetch('/api/zones')
      const featureCollection = await response.json()
      
      if (featureCollection.type === 'FeatureCollection') {
        const zonesFromFeatures = featureCollection.features.map((f: any) => featureToZone(f))
        setZones(zonesFromFeatures)
      }
    } catch (err) {
      console.error('Error fetching zones:', err)
    }
  }

  useEffect(() => {
    let isMounted = true

    const fetchData = async () => {
      try {
        const [driversResult] = await Promise.all([
          supabase.from('profiles').select('*').eq('role', 'driver')
        ])

        await fetchZones()

        if (driversResult.error) {
          console.error('Error fetching drivers:', driversResult.error)
        } else if (driversResult.data && isMounted) {
          setDrivers(driversResult.data as Profile[])
        }
      } catch (err) {
        console.error('Unexpected error fetching data:', err)
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    fetchData()

    return () => {
      isMounted = false
    }
  }, [supabase])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="text-5xl mb-4 animate-bounce">🗺️</div>
          <p className="text-lg text-gray-600">טוען אזורים...</p>
        </div>
      </div>
    )
  }

  const handleZoneCreate = async (
    name: string, 
    wkt: string, 
    color: string, 
    centerLat: number, 
    centerLng: number, 
    areaSqm: number
  ) => {
    try {
      const response = await fetch('/api/zones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          name, 
          wkt, 
          color, 
          center_lat: centerLat, 
          center_lng: centerLng, 
          area_sqm: areaSqm 
        })
      })

      const result = await response.json()
      if (result.error) {
        console.error('Error creating zone:', result.error)
        throw new Error(result.error)
      } else {
        // Refresh zones
        await fetchZones()
        // Dispatch event to notify other components
        window.dispatchEvent(new CustomEvent('zones-updated'))
        toast.success('האזור נוצר בהצלחה! 🎉')
      }
    } catch (err: any) {
      console.error('Unexpected error:', err)
      toast.error(err)
      throw err
    }
  }

  const handleZoneUpdate = async (
    id: string, 
    name: string, 
    wkt: string, 
    color: string, 
    centerLat: number, 
    centerLng: number, 
    areaSqm: number
  ) => {
    try {
      const response = await fetch('/api/zones', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id, 
          name, 
          wkt, 
          color, 
          center_lat: centerLat, 
          center_lng: centerLng, 
          area_sqm: areaSqm 
        })
      })

      const result = await response.json()
      if (result.error) {
        console.error('Error updating zone:', result.error)
        throw new Error(result.error)
      } else {
        // Refresh zones
        await fetchZones()
        // Dispatch event to notify other components
        window.dispatchEvent(new CustomEvent('zones-updated'))
        toast.success('האזור עודכן בהצלחה! 🎉')
      }
    } catch (err: any) {
      console.error('Unexpected error:', err)
      toast.error(err)
    }
  }

  const handleZoneDelete = async (id: string) => {
    // Simple confirmation - we'll improve this later with a proper dialog
    if (!window.confirm('האם אתה בטוח שברצונך למחוק את האזור הזה?')) return

    try {
      const response = await fetch(`/api/zones?id=${id}`, {
        method: 'DELETE'
      })

      const result = await response.json()
      if (result.error) {
        console.error('Error deleting zone:', result.error)
        throw new Error(result.error)
      } else {
        // Refresh zones
        await fetchZones()
        // Dispatch event to notify other components
        window.dispatchEvent(new CustomEvent('zones-updated'))
        toast.success('האזור נמחק בהצלחה')
      }
    } catch (err: any) {
      console.error('Unexpected error:', err)
      toast.error(err)
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">אזורים</h1>
      
      <div className="glass-card rounded-2xl p-4 sm:p-6">
        <Tabs defaultValue="view" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="view">תצוגה</TabsTrigger>
            <TabsTrigger value="manage">ניהול</TabsTrigger>
          </TabsList>
          
          <TabsContent value="view">
            <ZoneManagement zones={zones} drivers={drivers} />
          </TabsContent>
          
          <TabsContent value="manage">
            <ZoneEditor
              zones={zones}
              onZoneCreate={handleZoneCreate}
              onZoneUpdate={handleZoneUpdate}
              onZoneDelete={handleZoneDelete}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}


