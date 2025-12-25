import { AdminSidebar } from '@/components/admin/AdminSidebar'
import { MobileBottomNav } from '@/components/admin/MobileBottomNav'
import { MobileDrawer } from '@/components/admin/MobileDrawer'
import { GlobalSearch } from '@/components/admin/GlobalSearch'

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50" data-theme="admin">
      {/* Mobile Hamburger Menu */}
      <MobileDrawer />
      
      <div className="flex flex-col lg:flex-row">
        {/* Desktop Sidebar - Hidden on mobile */}
        <AdminSidebar />
        
        {/* Main Content */}
        <main className="flex-1 min-h-screen pb-20 lg:pb-0 pt-safe">
          <div className="p-4 sm:p-6 pt-safe pb-safe">
            <div className="mb-4 sm:mb-6">
              <GlobalSearch />
            </div>
            {children}
          </div>
        </main>
      </div>
      
      {/* Mobile Bottom Navigation - Only visible on mobile */}
      <MobileBottomNav />
    </div>
  )
}

