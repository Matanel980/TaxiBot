import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => request.cookies.set(name, value))
          response = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Critical for session refreshing in Middleware
  // DEBUG: Log all cookies to verify they're being sent
  const allCookies = request.cookies.getAll()
  console.log(`[Middleware] Cookies received:`, allCookies.map(c => `${c.name}=${c.value.substring(0, 20)}...`).join(', '))
  
  const { data: { session } } = await supabase.auth.getSession()
  const { data: { user } } = await supabase.auth.getUser()
  
  const { pathname } = request.nextUrl

  // LOGGING FOR VERCEL
  console.log(`[Middleware] Path: ${pathname} | Session: ${session ? 'YES' : 'NO'} | User ID: ${user?.id || 'none'} | Phone: ${user?.phone || 'none'}`)

  // Helper for strict redirects with cookie propagation
  const redirect = (path: string, reason: string) => {
    console.log(`[Middleware] Redirecting to ${path} | Reason: ${reason}`)
    const url = new URL(path, request.url)
    const redirectResponse = NextResponse.redirect(url)
    
    // Copy all headers/cookies from the current response to the redirect response
    response.headers.forEach((value, key) => {
      redirectResponse.headers.set(key, value)
    })
    
    return redirectResponse
  }

  // Auth-In-Progress Grace: Allow /auth/* routes
  if (pathname.startsWith('/auth/')) {
    return response
  }

  // Admin whitelist emails (fallback only)
  const isAdminEmail = user?.email === 'mamat.clutchy@gmail.com' || user?.email === 'matanel.clutchy@gmail.com'

  // Define route categories
  const isDriverPath = pathname.startsWith('/driver')
  const isAdminPath = pathname.startsWith('/admin')
  const isOnboardingPath = pathname.startsWith('/onboarding')
  const isLoginPath = pathname === '/login'

  // 1. Authenticated User Protection
  if (isDriverPath || isAdminPath || isOnboardingPath) {
    if (!user) {
      return redirect('/login', 'Unauthenticated access to protected route')
    }

    // All users must have a profile in the database
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role, full_name, vehicle_number, car_type')
      .eq('id', user.id)
      .single()

    if (error || !profile) {
      console.error(`[Middleware] Profile not found for user ${user.id}:`, error)
      // Check if we can fallback to email-based admin
      if (isAdminEmail) {
        console.log('[Middleware] Profile not found but admin email whitelisted')
        // Allow admin email as fallback but log warning
      } else {
        return redirect('/login', 'Profile not found - contact admin')
      }
    }

    const userRole = profile?.role || (isAdminEmail ? 'admin' : '')
    const fullName = profile?.full_name || ''
    const vehicleNumber = profile?.vehicle_number || ''
    const carType = profile?.car_type || ''

    // 2. Strict Role-Based Access Control (RBAC)
    if (isAdminPath && userRole !== 'admin' && !isAdminEmail) {
      return redirect('/login', 'Non-admin attempt to access /admin')
    }

    if (isDriverPath && userRole !== 'driver' && !isAdminEmail) {
      return redirect('/login', 'Unauthorized access to /driver')
    }

    // 3. Driver Onboarding Guard
    if (userRole === 'driver' && !isAdminEmail) {
      const isIncomplete = !fullName || !vehicleNumber || !carType
      
      if (isIncomplete && !isOnboardingPath) {
        return redirect('/onboarding', 'Driver profile incomplete, forcing onboarding')
      }
      
      if (!isIncomplete && isOnboardingPath) {
        return redirect('/driver/dashboard', 'Profile complete, skipping onboarding')
      }
    }
  }

  // 4. Redirect logged-in users away from Login page
  if (isLoginPath && user) {
    if (isAdminEmail) {
      return redirect('/admin/dashboard', 'Authenticated admin on /login')
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, full_name, vehicle_number, car_type')
      .eq('id', user.id)
      .single()

    if (profile) {
      if (profile.role === 'admin') {
        return redirect('/admin/dashboard', 'Authenticated admin on /login')
      }
      
      const isIncomplete = !profile.full_name || !profile.vehicle_number || !profile.car_type
      if (isIncomplete) {
        return redirect('/onboarding', 'Incomplete driver profile on /login')
      }
      
      return redirect('/driver/dashboard', 'Authenticated driver on /login')
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
