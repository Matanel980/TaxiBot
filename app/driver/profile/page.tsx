'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { User, Phone, LogOut } from 'lucide-react'
import type { Profile } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function DriverProfilePage() {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()
  const router = useRouter()

  useEffect(() => {
    const fetchProfile = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', user.id)
          .single()

        if (data) {
          setProfile(data as Profile)
        }
      }
      
      setLoading(false)
    }

    fetchProfile()
  }, [supabase])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
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
              onClick={handleLogout}
            >
              <LogOut size={16} className="ml-2" />
              התנתק
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}


