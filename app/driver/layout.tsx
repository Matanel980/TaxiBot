import { DriverNav } from '@/components/driver/DriverNav'
import { DriverMobileDrawer } from '@/components/driver/MobileDrawer'
import { ServiceWorkerRegistration } from '@/components/ServiceWorkerRegistration'

export default function DriverLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-slate-900 text-white" data-theme="driver">
      {/* Service Worker Registration */}
      <ServiceWorkerRegistration />
      
      {/* Mobile Hamburger Menu */}
      <DriverMobileDrawer />
      
      <div className="pb-16 pt-safe pb-safe">
        {children}
      </div>
      <DriverNav />
    </div>
  )
}


