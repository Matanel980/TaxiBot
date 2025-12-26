'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { User, Phone, LogOut } from 'lucide-react'
import type { Profile } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function DriverProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user) {
        const { data, error: profileError } = await supabase
          .from('profiles')
          .select('id, phone, role, full_name, vehicle_number, car_type, current_zone, is_online, is_approved, latitude, longitude, current_address, heading, updated_at')
          .eq('id', user.id)
          .single()

        if (profileError) {
          console.error('[Driver Profile] Profile fetch error:', profileError)
        }

        if (data) {
          setProfile(data as Profile)
        }
      }
      
      setLoading(false)
    }

    fetchProfile()
  }, [supabase])

  const handleEndShift = async () => {
    try {
      // CRITICAL: Set is_online to false before signing out
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ 
            is_online: false,
            updated_at: new Date().toISOString()
          })
          .eq('id', user.id)
          .select('id')
          .single()

        if (updateError) {
          console.error('[End Shift] Failed to update is_online:', updateError)
          // Continue with logout even if update fails
        }
      }
      
      // Clear Supabase session
      await supabase.auth.signOut()
      
      // Clear all localStorage
      if (typeof window !== 'undefined') {
        localStorage.clear()
        sessionStorage.clear()
      }
      
      // Hard redirect to login (prevents back-button navigation)
      window.location.replace('/login')
    } catch (error) {
      console.error('End shift error:', error)
      // Force redirect even if signOut fails
      window.location.replace('/login')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p>טוען...</p>
      </div>
    )
  }

  return (
    <div className="p-4 space-y-4">
      <h1 className="text-2xl font-bold mb-4">פרופיל</h1>
      
      <Card className="bg-slate-800 border-slate-700">
        <CardContent className="p-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="w-20 h-20 rounded-full bg-taxi-yellow flex items-center justify-center">
              <User size={40} className="text-black" />
            </div>
            <div>
              <h2 className="text-xl font-bold">{profile?.full_name}</h2>
              <p className="text-sm text-gray-400 flex items-center gap-1 mt-1">
                <Phone size={14} />
                {profile?.phone}
              </p>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t border-slate-700">
            <div>
              <p className="text-sm text-gray-400 mb-1">סטטוס</p>
              <p className="font-semibold">
                {profile?.is_online ? 'מחובר' : 'מנותק'}
              </p>
            </div>
            
            <div>
              <p className="text-sm text-gray-400 mb-1">תפקיד</p>
              <p className="font-semibold">נהג מונית</p>
            </div>
          </div>

          <div className="pt-6 mt-6 border-t border-slate-700">
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => setShowConfirmDialog(true)}
            >
              <LogOut size={16} className="ml-2" />
              ירידה ממשמרת
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* End Shift Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent className="bg-slate-800 border-slate-700 text-white max-w-sm mx-4">
          <DialogHeader>
            <DialogTitle className="text-right text-xl font-bold text-white">
              סיום משמרת
            </DialogTitle>
            <DialogDescription className="text-right text-slate-300 mt-2">
              האם אתה בטוח שברצונך לרדת ממשמרת ולהתנתק מהמערכת?
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3 mt-6">
            <Button
              variant="destructive"
              className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold"
              onClick={handleEndShift}
            >
              כן, סיים משמרת
            </Button>
            <Button
              variant="outline"
              className="w-full border-slate-600 text-white hover:bg-slate-700"
              onClick={() => setShowConfirmDialog(false)}
            >
              ביטול
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}


