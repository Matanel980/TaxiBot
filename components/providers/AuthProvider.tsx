'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import type { User, Session } from '@supabase/supabase-js'
import type { Profile } from '@/lib/supabase'

interface AuthContextType {
  user: User | null
  session: Session | null
  profile: Profile | null
  loading: boolean
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const initialize = async () => {
      try {
        // CRITICAL FIX: Use getUser() instead of getSession() for consistency with middleware
        // getUser() is more secure and forces refresh if session is stale
        const { data: { user: initialUser }, error: userError } = await supabase.auth.getUser()
        
        if (userError) {
          console.error('[Auth] Error getting user:', userError)
          setUser(null)
          setSession(null)
          setProfile(null)
          setLoading(false)
          return
        }
        
        if (initialUser) {
          // Get session for compatibility
          const { data: { session: initialSession } } = await supabase.auth.getSession()
          setSession(initialSession)
          setUser(initialUser)
          
          // Fetch profile with error handling
          const { data: prof, error: profileError } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', initialUser.id)
            .single()
          
          if (profileError) {
            console.error('[Auth] Profile fetch error:', profileError)
            // CRITICAL FIX: Don't redirect on profile error - let client handle it
            // Profile might not exist yet (onboarding scenario)
            setProfile(null)
          } else {
            setProfile(prof)
          }
        } else {
          setUser(null)
          setSession(null)
          setProfile(null)
        }
      } catch (error) {
        console.error('[Auth] Initialization error:', error)
        setUser(null)
        setSession(null)
        setProfile(null)
      } finally {
        setLoading(false)
      }
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession)
      setUser(newSession?.user ?? null)
      if (newSession?.user) {
        // CRITICAL FIX: Handle profile fetch errors gracefully
        const { data: prof, error: profileError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', newSession.user.id)
          .single()
        
        if (profileError) {
          console.error('[Auth] Profile fetch error on auth change:', profileError)
          // Don't redirect - let client handle missing profile
          setProfile(null)
        } else {
          setProfile(prof)
        }
      } else {
        setProfile(null)
      }
      setLoading(false)
    })

    initialize()
    return () => subscription.unsubscribe()
  }, [supabase])

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setSession(null)
    setProfile(null)
    router.push('/login')
  }

  return (
    <AuthContext.Provider value={{ user, session, profile, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}








