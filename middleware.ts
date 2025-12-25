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

  // This refreshes the session if it's expired - crucial for mobile
  const { data: { user } } = await supabase.auth.getUser()
  
  // LOGGING FOR VERCEL
  console.log(`[Middleware] Path: ${request.nextUrl.pathname} | User ID: ${user?.id} | Email: ${user?.email}`)

  const { pathname } = request.nextUrl

  // Helper to handle redirects while preserving cookies and headers
  const redirect = (path: string, reason: string) => {
    console.log(`[Middleware] Redirecting to ${path} | Reason: ${reason}`)
    const redirectResponse = NextResponse.redirect(new URL(path, request.url))
    
    // Copy all headers from the current response to the redirect response
    // This ensures cookies are propagated correctly
    response.headers.forEach((value, key) => {
      redirectResponse.headers.set(key, value)
    })
    
    return redirectResponse
  }

  // Admin Fallback Logic (requested by user)
  const isAdminEmail = user?.email === 'mamat.clutchy@gmail.com' || user?.email === 'matanel.clutchy@gmail.com'

  // Protect driver routes
  if (pathname.startsWith('/driver')) {
    if (!user) return redirect('/login', 'No user session for driver route')

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role, full_name')
      .eq('id', user.id)
      .single()

    if (error || !profile) {
      console.error(`[Middleware] Profile fetch error for driver:`, error)
      return redirect('/login', 'Profile not found')
    }

    // Onboarding Trigger: If no full_name, redirect to onboarding
    if (!profile.full_name && !pathname.startsWith('/onboarding')) {
      return redirect('/onboarding', 'Missing full_name, triggering onboarding')
    }

    if (profile.role !== 'driver' && !isAdminEmail) {
      console.log(`[Middleware] Role mismatch: expected driver, got ${profile.role}`)
      return redirect('/login', 'Unauthorized driver access')
    }
  }

  // Protect admin routes
  if (pathname.startsWith('/admin')) {
    if (!user) return redirect('/login', 'No user session for admin route')

    // Force admin role for the user's specific email if DB query fails or role is wrong
    if (isAdminEmail) {
      console.log(`[Middleware] Admin bypass triggered for: ${user.email}`)
    } else {
      const { data: profile, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single()

      if (error || !profile) {
        console.error(`[Middleware] Profile fetch error for admin:`, error)
        return redirect('/login', 'Profile not found')
      }

      if (profile.role !== 'admin') {
        console.log(`[Middleware] Role mismatch: expected admin, got ${profile.role}`)
        return redirect('/login', 'Unauthorized admin access')
      }
    }
  }

  // Redirect authenticated users away from login
  if (pathname === '/login' && user) {
    if (isAdminEmail) return redirect('/admin/dashboard', 'Admin bypass redirect')

    const { data: profile } = await supabase
      .from('profiles')
      .select('role, full_name')
      .eq('id', user.id)
      .single()

    if (profile?.role === 'driver') {
      if (!profile.full_name) return redirect('/onboarding', 'Driver missing name on login')
      return redirect('/driver/dashboard', 'Authenticated driver on login page')
    } else if (profile?.role === 'admin') {
      return redirect('/admin/dashboard', 'Authenticated admin on login page')
    }
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}


