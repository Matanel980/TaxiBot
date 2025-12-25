import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
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
          supabaseResponse = NextResponse.next({
            request,
          })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
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

  // Helper to handle redirects while preserving cookies
  const redirect = (path: string, reason: string) => {
    console.log(`[Middleware] Redirecting to ${path} | Reason: ${reason}`)
    const response = NextResponse.redirect(new URL(path, request.url))
    // Copy cookies from supabaseResponse to the redirect response
    supabaseResponse.cookies.getAll().forEach(cookie => {
      response.cookies.set(cookie.name, cookie.value, {
        path: cookie.path,
        domain: cookie.domain,
        maxAge: cookie.maxAge,
        expires: cookie.expires,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
        sameSite: cookie.sameSite,
      })
    })
    return response
  }

  // Protect driver routes
  if (pathname.startsWith('/driver')) {
    if (!user) return redirect('/login', 'No user session for driver route')

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (error || !profile) {
      console.error(`[Middleware] Profile fetch error for driver:`, error)
      return redirect('/login', 'Profile not found')
    }

    if (profile.role !== 'driver') {
      console.log(`[Middleware] Role mismatch: expected driver, got ${profile.role}`)
      return redirect('/login', 'Unauthorized driver access')
    }
  }

  // Protect admin routes
  if (pathname.startsWith('/admin')) {
    if (!user) return redirect('/login', 'No user session for admin route')

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

  // Redirect authenticated users away from login
  if (pathname === '/login' && user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role === 'driver') return redirect('/driver/dashboard', 'Authenticated driver on login page')
    if (profile?.role === 'admin') return redirect('/admin/dashboard', 'Authenticated admin on login page')
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}


