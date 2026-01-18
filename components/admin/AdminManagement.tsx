'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { Shield, UserPlus, Search, CheckCircle2, XCircle, Loader2 } from 'lucide-react'
import { normalizeIsraeliPhone } from '@/lib/phone-utils'
import type { Profile } from '@/lib/supabase'

/**
 * Admin Management Component
 * Allows admins to assign 'admin' role to other users via the dashboard
 * STATION-AWARE: Only shows users from the same station
 */
interface AdminManagementProps {
  stationId: string
}

export function AdminManagement({ stationId }: AdminManagementProps) {
  const [users, setUsers] = useState<Profile[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [updatingUserId, setUpdatingUserId] = useState<string | null>(null)
  const [newDriverPhone, setNewDriverPhone] = useState('')
  const [newDriverName, setNewDriverName] = useState('')
  const [addingDriver, setAddingDriver] = useState(false)
  const supabase = createClient()

  // Fetch all users (profiles) - STATION-AWARE
  const fetchUsers = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('profiles')
        .select('id, phone, full_name, role, is_online, created_at, station_id')
        .eq('station_id', stationId) // STATION FILTER
        .order('created_at', { ascending: false })
        .limit(100)

      if (error) {
        console.error('[AdminManagement] Error fetching users:', error)
        toast.error('שגיאה', {
          description: `לא ניתן לטעון משתמשים: ${error.message}`,
        })
        return
      }

      // Cast to Profile[] - the query returns a subset but we'll handle missing fields gracefully
      // Map to ensure all Profile fields are present with defaults
      setUsers((data || []).map(user => ({
        ...user,
        current_zone: null,
        latitude: null,
        longitude: null,
        current_address: null,
        heading: null,
        vehicle_number: null,
        car_type: null,
        is_approved: true,
        updated_at: user.created_at || new Date().toISOString()
      })) as Profile[])
    } catch (error: any) {
      console.error('[AdminManagement] Unexpected error:', error)
      toast.error('שגיאה', {
        description: `שגיאה בלתי צפויה: ${error.message}`,
      })
    } finally {
      setLoading(false)
    }
  }

  // Add new driver to station
  const addDriver = async () => {
    if (!newDriverPhone || !newDriverName) {
      toast.error('שגיאה', {
        description: 'אנא הזן שם ומספר טלפון',
      })
      return
    }

    try {
      setAddingDriver(true)
      
      // CRITICAL: Normalize phone number using SINGLE SOURCE OF TRUTH
      // This ensures E.164 format (+972XXXXXXXXX) is ALWAYS used
      let normalizedPhone: string
      try {
        normalizedPhone = normalizeIsraeliPhone(newDriverPhone)
        console.log('[AdminManagement] Normalized phone:', normalizedPhone, 'from input:', newDriverPhone)
      } catch (normalizeError: any) {
        toast.error('שגיאה', {
          description: normalizeError.message || 'מספר טלפון לא תקין',
        })
        setAddingDriver(false)
        return
      }

      // Check if user already exists
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', normalizedPhone)
        .single()

      if (existing) {
        // Update existing user to assign to station
        const { error } = await supabase
          .from('profiles')
          .update({ 
            station_id: stationId,
            full_name: newDriverName,
            role: 'driver'
          })
          .eq('id', existing.id)

        if (error) throw error
        toast.success('נהג עודכן', {
          description: `${newDriverName} שויך לתחנה`,
        })
      } else {
        // Create new profile (will be linked to auth user on first login)
        const { error } = await supabase
          .from('profiles')
          .insert({
            phone: normalizedPhone,
            full_name: newDriverName,
            role: 'driver',
            station_id: stationId,
            is_online: false,
            is_approved: true,
          })

        if (error) throw error
        toast.success('נהג נוסף', {
          description: `${newDriverName} נוסף לתחנה`,
        })
      }

      setNewDriverPhone('')
      setNewDriverName('')
      await fetchUsers()
    } catch (error: any) {
      console.error('[AdminManagement] Error adding driver:', error)
      toast.error('שגיאה', {
        description: `לא ניתן להוסיף נהג: ${error.message}`,
      })
    } finally {
      setAddingDriver(false)
    }
  }

  // Update user role
  const updateUserRole = async (userId: string, newRole: 'admin' | 'driver') => {
    try {
      setUpdatingUserId(userId)
      
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole })
        .eq('id', userId)
        .eq('station_id', stationId) // Ensure user belongs to this station

      if (error) {
        console.error('[AdminManagement] Error updating role:', error)
        toast.error('שגיאה', {
          description: `לא ניתן לעדכן תפקיד: ${error.message}`,
        })
        return
      }

      toast.success('תפקיד עודכן', {
        description: `התפקיד שונה ל-${newRole === 'admin' ? 'מנהל' : 'נהג'}`,
      })

      // Refresh users list
      await fetchUsers()
    } catch (error: any) {
      console.error('[AdminManagement] Unexpected error:', error)
      toast.error('שגיאה', {
        description: `שגיאה בלתי צפויה: ${error.message}`,
      })
    } finally {
      setUpdatingUserId(null)
    }
  }

  // Fetch users on mount
  useEffect(() => {
    fetchUsers()

    // Set up real-time subscription for profile changes
    const channel = supabase
      .channel('admin-management-profiles')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
        },
        () => {
          // Refresh users when profiles change
          fetchUsers()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [supabase])

  // Filter users by search query
  const filteredUsers = users.filter(user => {
    const query = searchQuery.toLowerCase()
    return (
      user.full_name?.toLowerCase().includes(query) ||
      user.phone?.toLowerCase().includes(query) ||
      user.id.toLowerCase().includes(query)
    )
  })

  const adminCount = users.filter(u => u.role === 'admin').length
  const driverCount = users.filter(u => u.role === 'driver').length

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              ניהול מנהלים
            </CardTitle>
            <CardDescription>
              הקצאת תפקיד 'מנהל' למשתמשים אחרים
            </CardDescription>
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>מנהלים: <strong>{adminCount}</strong></span>
            <span>נהגים: <strong>{driverCount}</strong></span>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Add New Driver */}
        <div className="bg-slate-50 dark:bg-slate-800 p-4 rounded-lg space-y-3">
          <h3 className="font-semibold text-sm">הוסף נהג חדש</h3>
          <div className="flex gap-2">
            <Input
              placeholder="שם הנהג"
              value={newDriverName}
              onChange={(e) => setNewDriverName(e.target.value)}
              className="flex-1"
            />
            <Input
              placeholder="מספר טלפון (0526099607)"
              value={newDriverPhone}
              onChange={(e) => setNewDriverPhone(e.target.value)}
              className="flex-1"
            />
            <Button
              onClick={addDriver}
              disabled={addingDriver || !newDriverPhone || !newDriverName}
              size="sm"
            >
              {addingDriver ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin ml-2" />
                  מוסיף...
                </>
              ) : (
                <>
                  <UserPlus className="w-4 h-4 ml-2" />
                  הוסף
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="חפש לפי שם, טלפון או ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pr-10"
          />
        </div>

        {/* Users List */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <span className="mr-2 text-muted-foreground">טוען משתמשים...</span>
          </div>
        ) : filteredUsers.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {searchQuery ? 'לא נמצאו משתמשים התואמים לחיפוש' : 'אין משתמשים במערכת'}
          </div>
        ) : (
          <div className="space-y-2 max-h-[600px] overflow-y-auto">
            {filteredUsers.map((user) => (
              <div
                key={user.id}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <div className="flex flex-col">
                      <span className="font-medium">{user.full_name || 'ללא שם'}</span>
                      <span className="text-sm text-muted-foreground">{user.phone || 'ללא טלפון'}</span>
                    </div>
                    <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                      {user.role === 'admin' ? 'מנהל' : 'נהג'}
                    </Badge>
                    {user.is_online && (
                      <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500">
                        פעיל
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground font-mono">
                    ID: {user.id.substring(0, 8)}...
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {user.role === 'admin' ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => updateUserRole(user.id, 'driver')}
                      disabled={updatingUserId === user.id}
                      className="gap-2"
                    >
                      {updatingUserId === user.id ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          מעדכן...
                        </>
                      ) : (
                        <>
                          <XCircle className="w-4 h-4" />
                          הסר מנהל
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={() => updateUserRole(user.id, 'admin')}
                      disabled={updatingUserId === user.id}
                      className="gap-2"
                    >
                      {updatingUserId === user.id ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          מעדכן...
                        </>
                      ) : (
                        <>
                          <UserPlus className="w-4 h-4" />
                          הקצה מנהל
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

