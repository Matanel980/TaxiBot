'use client'

import { useState } from 'react'
import { Menu, User, Settings, LogOut } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export function MobileDrawer() {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    try {
      // CRITICAL: Set is_online to false before signing out (for admin, though less critical)
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        try {
          await supabase
            .from('profiles')
            .update({ 
              is_online: false,
              updated_at: new Date().toISOString()
            })
            .eq('id', user.id)
        } catch (updateError) {
          // Continue with logout even if update fails
          console.error('[Logout] Failed to update is_online:', updateError)
        }
      }
      
      // PRODUCTION FIX: Clear Supabase session and cookies
      await supabase.auth.signOut()
      
      // PRODUCTION FIX: Explicitly clear all Supabase cookies
      if (typeof document !== 'undefined') {
        // Clear all cookies that start with 'sb-'
        document.cookie.split(';').forEach((cookie) => {
          const eqPos = cookie.indexOf('=')
          const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim()
          if (name.startsWith('sb-')) {
            // Clear cookie with all possible paths and domains
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=${window.location.hostname}`
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/;domain=.${window.location.hostname}`
          }
        })
      }
      
      // Clear all localStorage
      if (typeof window !== 'undefined') {
        localStorage.clear()
        sessionStorage.clear()
      }
      
      // PRODUCTION FIX: Hard redirect to login (prevents back-button navigation)
      // Use replace to ensure no history entry
      window.location.href = '/login'
    } catch (error) {
      console.error('[Logout] Error during logout:', error)
      // PRODUCTION FIX: Force redirect even if signOut fails
      // Clear cookies manually and redirect
      if (typeof document !== 'undefined') {
        document.cookie.split(';').forEach((cookie) => {
          const eqPos = cookie.indexOf('=')
          const name = eqPos > -1 ? cookie.substr(0, eqPos).trim() : cookie.trim()
          if (name.startsWith('sb-')) {
            document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/`
          }
        })
      }
      window.location.href = '/login'
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="lg:hidden fixed top-4 left-4 z-50 bg-white/90 backdrop-blur-sm"
        onClick={() => setOpen(true)}
      >
        <Menu size={24} />
      </Button>

      <Sheet open={open} onOpenChange={setOpen} side="right">
        <SheetContent onClose={() => setOpen(false)} className="bg-deep-blue text-white">
          <SheetHeader>
            <SheetTitle className="text-white text-right">TaxiFlow</SheetTitle>
          </SheetHeader>
          
          <nav className="flex flex-col gap-2 mt-8 px-4">
            <Button
              variant="ghost"
              className="justify-start text-white hover:bg-white/10"
              onClick={() => {
                router.push('/admin/profile')
                setOpen(false)
              }}
            >
              <User className="ml-2" size={20} />
              פרופיל
            </Button>
            
            <Button
              variant="ghost"
              className="justify-start text-white hover:bg-white/10"
              onClick={() => {
                router.push('/admin/settings')
                setOpen(false)
              }}
            >
              <Settings className="ml-2" size={20} />
              הגדרות
            </Button>
            
            <div className="border-t border-white/20 my-4" />
            
            <Button
              variant="ghost"
              className="justify-start text-white hover:bg-red-500/20"
              onClick={handleLogout}
            >
              <LogOut className="ml-2" size={20} />
              התנתק
            </Button>
          </nav>
        </SheetContent>
      </Sheet>
    </>
  )
}

