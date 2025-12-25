'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase'
import { OnboardingFlow } from '@/components/driver/OnboardingFlow'
import { Loader2 } from 'lucide-react'

export default function OnboardingPage() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      
      // Check if onboarding is actually needed
      const { data: profile } = await supabase
        .from('profiles')
        .select('full_name, role')
        .eq('id', user.id)
        .single()

      if (profile?.full_name) {
        // Already onboarded, redirect based on role
        if (profile.role === 'admin') {
          router.push('/admin/dashboard')
        } else {
          router.push('/driver/dashboard')
        }
        return
      }

      setUser(user)
      setLoading(false)
    }

    checkUser()
  }, [router, supabase])

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-900">
        <Loader2 className="w-12 h-12 text-taxi-yellow animate-spin" />
      </div>
    )
  }

  return (
    <OnboardingFlow
      userId={user.id}
      initialPhone={user.phone || ''}
      onComplete={() => {
        // Forced hard refresh to ensure middleware picks up the new status
        window.location.href = '/driver/dashboard'
      }}
    />
  )
}

