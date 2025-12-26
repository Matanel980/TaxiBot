'use client'

import { useState } from 'react'
import { Menu, User, Settings, LogOut } from 'lucide-react'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { createClient } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export function DriverMobileDrawer() {
  const [open, setOpen] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const router = useRouter()
  const supabase = createClient()

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
              onClick={() => {
                setOpen(false)
                setShowConfirmDialog(true)
              }}
            >
              <LogOut className="ml-2" size={20} />
              ירידה ממשמרת
            </Button>
          </nav>
        </SheetContent>
      </Sheet>

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
    </>
  )
}

