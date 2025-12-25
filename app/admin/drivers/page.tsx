'use client'

import { DriverList } from '@/components/admin/DriverList'
import { DriverSearch } from '@/components/admin/DriverSearch'
import { DriverEditModal } from '@/components/admin/DriverEditModal'
import { DriverLiveTrack } from '@/components/admin/DriverLiveTrack'
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Profile } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Plus } from 'lucide-react'

export default function AdminDriversPage() {
  const [drivers, setDrivers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [editingDriver, setEditingDriver] = useState<Profile | null>(null)
  const [trackingDriver, setTrackingDriver] = useState<Profile | null>(null)
  const supabase = createClient()

  // Check if user is admin
  useEffect(() => {
    const checkAdmin = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setIsAdmin(false)
          window.location.href = '/login'
          return
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (profile?.role !== 'admin') {
          setIsAdmin(false)
          window.location.href = '/login'
          return
        }

        setIsAdmin(true)
      } catch (error) {
        console.error('Error checking admin status:', error)
        setIsAdmin(false)
        window.location.href = '/login'
      }
    }

    checkAdmin()
  }, [supabase])

  useEffect(() => {
    // Don't fetch drivers if not admin
    if (isAdmin === false) return
    
    let isMounted = true

    const fetchDrivers = async () => {
      try {
        const { data, error } = await supabase
          .from('profiles')
          .select('*')
          .eq('role', 'driver')
          .order('full_name')

        if (error) {
          console.error('Error fetching drivers:', error)
          if (error.message?.includes('relation') && error.message?.includes('does not exist')) {
            console.error('CRITICAL: profiles table does not exist. Please run the database migrations from README.md')
          }
        } else if (data && isMounted) {
          setDrivers(data as Profile[])
        }
      } catch (err) {
        console.error('Unexpected error fetching drivers:', err)
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    fetchDrivers()

    const channel = supabase
      .channel('admin-drivers-list')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: 'role=eq.driver'
        },
        (payload) => {
          if (isMounted) {
            // Optimistically update for better UX
            if (payload.eventType === 'UPDATE' && payload.new) {
              setDrivers(prev => prev.map(d =>
                d.id === payload.new.id ? { ...d, ...payload.new } as Profile : d
              ))
            } else {
              fetchDrivers()
            }
          }
        }
      )
      .subscribe()

    return () => {
      isMounted = false
      supabase.removeChannel(channel)
    }
  }, [supabase, isAdmin])

  // Show loading while checking admin status
  if (isAdmin === null || loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="relative w-16 h-16 mx-auto mb-4">
            <div className="absolute inset-0 animate-spin">
              <svg className="w-full h-full text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <circle cx="12" cy="12" r="10" strokeWidth="2" strokeDasharray="3 3" opacity="0.3" />
              </svg>
            </div>
          </div>
          <p className="text-lg text-gray-700 font-medium">טוען...</p>
        </div>
      </div>
    )
  }

  // If not admin, don't render (redirect will happen)
  if (!isAdmin) {
    return null
  }

  const handleApproveToggle = async (driverId: string, isApproved: boolean) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_approved: isApproved })
        .eq('id', driverId)

      if (error) {
        console.error('Error updating driver approval:', error)
        return
      }

      // Optimistically update UI
      setDrivers(prev => prev.map(d => 
        d.id === driverId ? { ...d, is_approved: isApproved } as Profile : d
      ))
    } catch (err) {
      console.error('Unexpected error:', err)
    }
  }

  const handleEditDriver = async (driverId: string, data: { full_name: string; phone: string; vehicle_number?: string; is_approved: boolean }) => {
    try {
      const response = await fetch(`/api/drivers/${driverId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      })

      const result = await response.json()

      if (!result.success) {
        throw new Error(result.error || 'שגיאה בעדכון נהג')
      }

      // Update local state
      setDrivers(prev => prev.map(d =>
        d.id === driverId ? { ...d, ...data } as Profile : d
      ))
    } catch (error: any) {
      console.error('Error updating driver:', error)
      throw error
    }
  }

  const handleAddDriver = () => {
    // Create a new empty driver object for creation
    const newDriver = {
      id: 'new',
      phone: '',
      role: 'driver',
      full_name: '',
      current_zone: null,
      is_online: false,
      latitude: null,
      longitude: null,
      updated_at: new Date().toISOString(),
      temp_user_id: '', // Temporary field for user ID input
    } as any
    setEditingDriver(newDriver as Profile)
  }

  const handleSaveDriver = async (driverId: string, data: { full_name: string; phone: string; email?: string; password?: string; vehicle_number?: string; is_approved: boolean }) => {
    if (driverId === 'new') {
      // Create new driver via API (with email/password)
      try {
        const response = await fetch('/api/drivers/create', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        })

        const result = await response.json()

        if (!result.success) {
          throw new Error(result.error || 'שגיאה ביצירת נהג')
        }

        setDrivers(prev => [...prev, result.data as Profile])
        setEditingDriver(null)
      } catch (error: any) {
        console.error('Error creating driver:', error)
        throw error
      }
    } else {
      // Update existing driver
      await handleEditDriver(driverId, {
        full_name: data.full_name,
        phone: data.phone,
        vehicle_number: data.vehicle_number,
        is_approved: data.is_approved,
      })
    }
  }

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">נהגים</h1>
        <Button onClick={handleAddDriver}>
          <Plus className="ml-2" size={20} />
          הוסף נהג
        </Button>
      </div>
      <div className="glass-card rounded-2xl p-4 sm:p-6">
        <DriverSearch value={searchQuery} onChange={setSearchQuery} />
        <DriverList 
          drivers={drivers} 
          searchQuery={searchQuery}
          onApproveToggle={handleApproveToggle}
          onEdit={setEditingDriver}
          onTrack={setTrackingDriver}
        />
      </div>

      <DriverEditModal
        driver={editingDriver}
        open={!!editingDriver}
        onOpenChange={(open) => !open && setEditingDriver(null)}
        onSave={handleSaveDriver}
      />

      <DriverLiveTrack
        driver={trackingDriver}
        open={!!trackingDriver}
        onOpenChange={(open) => !open && setTrackingDriver(null)}
        allDrivers={drivers}
      />
    </div>
  )
}


