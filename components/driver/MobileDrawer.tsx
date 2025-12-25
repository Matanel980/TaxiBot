'use client'

import { useState } from 'react'
import { Menu, User, Settings, LogOut } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export function DriverMobileDrawer() {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="fixed top-4 left-4 z-50 bg-slate-900/90 backdrop-blur-sm text-white"
        onClick={() => setOpen(true)}
      >
        <Menu size={24} />
      </Button>

      <Sheet open={open} onOpenChange={setOpen} side="right">
        <SheetContent onClose={() => setOpen(false)} className="bg-slate-900 text-white">
          <SheetHeader>
            <SheetTitle className="text-white text-right">TaxiFlow</SheetTitle>
          </SheetHeader>
          
          <nav className="flex flex-col gap-2 mt-8 px-4">
            <Button
              variant="ghost"
              className="justify-start text-white hover:bg-white/10"
              onClick={() => {
                router.push('/driver/profile')
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
                router.push('/driver/settings')
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

