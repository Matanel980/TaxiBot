import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  // Get current Supabase project ID from URL to filter cookies
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const supabaseProjectId = supabaseUrl.match(/https?:\/\/([^.]+)\.supabase\.co/)?.[1] || ''
  
  // Filter cookies to only include current project's cookies
  const allCookies = request.cookies.getAll()
  
  const filteredCookies = allCookies.filter(cookie => {
    // Only keep cookies that belong to current project or are Next.js cookies
    const isSupabaseCookie = cookie.name.includes('sb-') || cookie.name.includes('supabase')
    if (isSupabaseCookie) {
      // Extract project ID from cookie name (e.g., sb-zfzahgxrmlwotdzpjvhz-auth-token)
      const projectIdMatch = cookie.name.match(/sb-([^-]+)-/)
      const cookieProjectId = projectIdMatch?.[1]
      const matches = cookieProjectId === supabaseProjectId
      
      // Only keep if it matches current project
      return matches
    }
    // Keep all non-Supabase cookies (Next.js, etc.)
    return true
  })

  // CRITICAL: Create response object that will be used throughout
  // This ensures all cookie updates go to the same response instance
  // We pass the request object to ensure cookies are properly propagated
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Track cookies being written for debugging
  const writtenCookies = new Set<string>()
  

  // Initialize Supabase client with proper cookie handling
  // CRITICAL: In Vercel production, we need to ensure cookies are properly set
  // with correct domain, secure, and sameSite flags
  const supabase = createServerClient(
    supabaseUrl,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          // Only filter when READING cookies (not writing)
          // This ensures we don't read cookies from other projects
          return filteredCookies
        },
        setAll(cookiesToSet) {
          // CRITICAL: Double Sync Pattern for Next.js Middleware
          // 1. Update request.cookies (so current process sees the session)
          // 2. Update response.cookies (so browser receives the session update)
          
          cookiesToSet.forEach((cookie) => {
            const { name, value } = cookie
            
            // CRITICAL: Don't filter when WRITING cookies - always write current project's cookies
            // The filtering in getAll() only affects reading, not writing
            
            // Step 1: Set on request cookies (for current request processing)
            request.cookies.set(name, value)
            
            // Step 2: Set on response with explicit path and secure options (for browser)
            // PRODUCTION FIX: Enhanced cookie settings for Vercel
            const isAuthCookie = name.includes('auth-token') || name.includes('auth-refresh')
            
            // CRITICAL: Detect if we're in production (Vercel sets VERCEL=1)
            const isProduction = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production'
            
            const cookieOptions: {
              path: string
              sameSite: 'lax' | 'strict' | 'none'
              httpOnly: boolean
              secure: boolean
              maxAge?: number
            } = {
              path: '/', // CRITICAL: Explicit path for cookie persistence
              sameSite: 'lax', // Allow cookies in cross-site requests (required for Vercel)
              // PRODUCTION FIX: Auth cookies should be HttpOnly to prevent XSS
              httpOnly: isAuthCookie ? true : ((cookie.options?.httpOnly) ?? false),
              // PRODUCTION FIX: Always secure in production (Vercel uses HTTPS)
              secure: isProduction,
            }
            
            // Preserve maxAge if set, otherwise set defaults for auth cookies
            if (cookie.options?.maxAge && typeof cookie.options.maxAge === 'number') {
              cookieOptions.maxAge = cookie.options.maxAge
            } else if (isAuthCookie) {
              // Set reasonable expiration for auth cookies
              if (name.includes('auth-token')) {
                cookieOptions.maxAge = 60 * 60 * 24 * 7 // 7 days for access token
              } else if (name.includes('auth-refresh')) {
                cookieOptions.maxAge = 60 * 60 * 24 * 30 // 30 days for refresh token
              }
            }
            
            // PRODUCTION FIX: Log cookie writes in production for debugging (only first few times)
            if (isProduction && isAuthCookie && writtenCookies.size <= 2) {
              console.error(`[Middleware Production] Setting auth cookie: ${name.substring(0, 30)}... | Secure: ${cookieOptions.secure} | HttpOnly: ${cookieOptions.httpOnly} | Path: ${cookieOptions.path}`)
            }
            
            // Write cookie to response
            response.cookies.set(name, value, cookieOptions)
            writtenCookies.add(name)
            
          })
        },
      },
    }
  )

  // CRITICAL: Refresh session first to ensure tokens are up-to-date
  // This call will trigger cookie updates if tokens need refreshing
  // We use getSession() which automatically refreshes expired tokens
  const { data: { session }, error: sessionError } = await supabase.auth.getSession()
  
  // PRODUCTION DEBUG: Log session state in production
  const isProduction = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production'
  if (isProduction) {
    const cookiesAfterGetSession = response.cookies.getAll()
    const authCookiesAfterGetSession = cookiesAfterGetSession.filter(c => 
      c.name.includes('sb-') && (c.name.includes('auth-token') || c.name.includes('auth-refresh'))
    )
    console.error(`[Middleware Production] After getSession() - Has session: ${!!session}, Auth cookies in response: ${authCookiesAfterGetSession.length}`)
  }
  
  if (sessionError) {
    console.error(`[Middleware] Error getting session:`, {
      message: sessionError.message,
      status: sessionError.status
    })
    
    // PRODUCTION DEBUG: Log cookie state when session error occurs
    if (isProduction) {
      const allCookies = request.cookies.getAll()
      const authCookies = allCookies.filter(c => 
        c.name.includes('sb-') && (c.name.includes('auth-token') || c.name.includes('auth-refresh'))
      )
      console.error(`[Middleware Production] Session error - Incoming auth cookies: ${authCookies.length}, Cookie names: ${authCookies.map(c => c.name.substring(0, 30)).join(', ')}`)
    }
    
    // GRACEFUL FAIL: If session refresh fails, clear cookies and redirect to login
    // This prevents hanging on blank screens
    if (sessionError.status === 401 || sessionError.message?.includes('JWT') || sessionError.message?.includes('session')) {
      console.warn(`[Middleware] ⚠️ Session invalid - clearing cookies and redirecting to login`)
      
      // Clear all auth cookies
      const allCookies = request.cookies.getAll()
      const authCookies = allCookies.filter(c => 
        c.name.includes('sb-') && (c.name.includes('auth-token') || c.name.includes('auth-refresh'))
      )
      
      const clearResponse = NextResponse.redirect(new URL('/login', request.url))
      authCookies.forEach((cookie) => {
        clearResponse.cookies.delete(cookie.name)
      })
      
      return clearResponse
    }
  }
  

  // Use getUser() for reliable authentication (more reliable than getSession)
  // This call may trigger additional cookie updates (token refresh, etc.)
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  
  const { pathname } = request.nextUrl
  
  // PRODUCTION DEBUG: Log user state in production
  if (isProduction) {
    const cookiesAfterGetUser = response.cookies.getAll()
    const authCookiesAfterGetUser = cookiesAfterGetUser.filter(c => 
      c.name.includes('sb-') && (c.name.includes('auth-token') || c.name.includes('auth-refresh'))
    )
    console.error(`[Middleware Production] After getUser() - Has user: ${!!user}, Auth cookies in response: ${authCookiesAfterGetUser.length}`)
  }
  
  if (userError) {
    console.error(`[Middleware] Error getting user:`, {
      message: userError.message,
      status: userError.status
    })
    
    // PRODUCTION DEBUG: Log cookie state when user error occurs
    if (isProduction) {
      const allCookies = request.cookies.getAll()
      const authCookies = allCookies.filter(c => 
        c.name.includes('sb-') && (c.name.includes('auth-token') || c.name.includes('auth-refresh'))
      )
      console.error(`[Middleware Production] User error - Incoming auth cookies: ${authCookies.length}, Response auth cookies: ${response.cookies.getAll().filter(c => c.name.includes('auth')).length}`)
    }
    
    // GRACEFUL FAIL: If user fetch fails (invalid token, expired, etc.), clear and redirect
    if (userError.status === 401 || userError.message?.includes('JWT') || userError.message?.includes('token') || userError.message?.includes('session')) {
      console.warn(`[Middleware] ⚠️ User authentication failed - clearing cookies and redirecting to login`)
      
      // Clear all auth cookies
      const allCookies = request.cookies.getAll()
      const authCookies = allCookies.filter(c => 
        c.name.includes('sb-') && (c.name.includes('auth-token') || c.name.includes('auth-refresh'))
      )
      
      const clearResponse = NextResponse.redirect(new URL('/login', request.url))
      authCookies.forEach((cookie) => {
        clearResponse.cookies.delete(cookie.name)
      })
      
      return clearResponse
    }
  }
  

  // Helper for strict redirects with cookie propagation
  const redirect = (path: string, reason: string) => {
    const url = new URL(path, request.url)
    const redirectResponse = NextResponse.redirect(url)
    
    // CRITICAL: Copy ALL cookies from response to redirect response
    // This includes any cookies that Supabase set during getUser() or other auth calls
    const allResponseCookies = response.cookies.getAll()
    
    allResponseCookies.forEach((cookie) => {
      const { name, value } = cookie
      
      // Get original cookie options if available, otherwise use defaults
      // ENTERPRISE-GRADE: Apply same security settings as main cookie writes
      const isAuthCookie = cookie.name.includes('auth-token') || cookie.name.includes('auth-refresh')
      
      const cookieOptions: {
        path: string
        sameSite: 'lax' | 'strict' | 'none'
        httpOnly: boolean
        secure: boolean
        maxAge?: number
      } = {
        path: '/', // Ensure path is set
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        // ENTERPRISE-GRADE: Auth cookies should be HttpOnly
        httpOnly: isAuthCookie ? true : (cookie.httpOnly ?? false),
      }
      
      // Preserve maxAge if it was set
      if ('maxAge' in cookie && typeof cookie.maxAge === 'number') {
        cookieOptions.maxAge = cookie.maxAge
      } else if (isAuthCookie) {
        // Set defaults for auth cookies if not set
        if (cookie.name.includes('auth-token')) {
          cookieOptions.maxAge = 60 * 60 * 24 * 7 // 7 days
        } else if (cookie.name.includes('auth-refresh')) {
          cookieOptions.maxAge = 60 * 60 * 24 * 30 // 30 days
        }
      }
      
      redirectResponse.cookies.set(name, value, cookieOptions)
    })
    
    return redirectResponse
  }

  // Auth-In-Progress Grace: Allow /auth/* routes
  // CRITICAL: Return response AFTER Supabase has had a chance to update cookies
  // The getUser() call above may have triggered cookie updates, which are now in response.cookies
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

  // Helper function to fetch profile with station isolation support
  // Uses ONLY the "profiles_select_own" policy (auth.uid() = id) - NO RECURSION
  const fetchUserProfile = async (userId: string) => {
    // CRITICAL: Use .eq('id', userId) which matches ONLY "profiles_select_own" policy
    // This policy uses direct auth.uid() = id check (NO function calls, NO recursion)
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('id, role, full_name, vehicle_number, car_type, station_id, phone, is_online, is_approved')
      .eq('id', userId)
      .single()
    
    
    return { profile, error }
  }

  // 1. Authenticated User Protection
  if (isDriverPath || isAdminPath || isOnboardingPath) {
    if (!user) {
      return redirect('/login', 'Unauthenticated access to protected route')
    }

    // Fetch profile with station isolation support
    const { profile, error } = await fetchUserProfile(user.id)

    // Handle 42P17 (infinite recursion) error specifically
    if (error) {
      if (error.code === '42P17' || error.message?.includes('infinite recursion')) {
        console.error(`[Middleware] ⚠️ RLS Recursion Error (42P17) for user ${user.id}. Profile exists but RLS policy is broken.`)
        console.error(`[Middleware] Error details:`, {
          code: error.code,
          message: error.message,
          hint: 'This indicates the RLS policies need to be fixed. Run supabase-fix-rls-recursion-final.sql'
        })
        
        // For 42P17, we know the profile exists but RLS is broken
        // Allow access with email fallback if available, but log critical error
        if (isAdminEmail) {
          console.warn('[Middleware] ⚠️ Allowing access via email fallback due to RLS recursion error')
          // Continue with email-based role
        } else {
          console.error('[Middleware] ❌ Cannot proceed: RLS recursion error and no email fallback')
          return redirect('/login', 'RLS policy error - contact admin')
        }
      } else {
        // Other errors (profile not found, etc.)
        console.error(`[Middleware] Profile not found for user ${user.id}:`, error)
        if (isAdminEmail) {
        } else {
          return redirect('/login', 'Profile not found - contact admin')
        }
      }
    }

    if (!profile && !isAdminEmail) {
      return redirect('/login', 'Profile not found - contact admin')
    }

    const userRole = profile?.role || (isAdminEmail ? 'admin' : '')
    const fullName = profile?.full_name || ''
    const vehicleNumber = profile?.vehicle_number || ''
    const carType = profile?.car_type || ''
    const stationId = profile?.station_id || null


    // 2. Strict Role-Based Access Control (RBAC)
    // ENTERPRISE-GRADE: Server-side role validation before page render
    if (isAdminPath && userRole !== 'admin' && !isAdminEmail) {
      console.warn(`[Middleware] 🚫 RBAC Violation: User ${user.id} (role: ${userRole}) attempted to access /admin`)
      return redirect('/login', 'Non-admin attempt to access /admin')
    }

    if (isDriverPath && userRole !== 'driver' && !isAdminEmail) {
      console.warn(`[Middleware] 🚫 RBAC Violation: User ${user.id} (role: ${userRole}) attempted to access /driver`)
      return redirect('/login', 'Unauthorized access to /driver')
    }
    
    // ENTERPRISE-GRADE: Additional security - ensure drivers cannot trigger admin-only features
    // This is a defense-in-depth measure (RBAC is already enforced above)
    if (userRole === 'driver' && isAdminPath) {
      console.error(`[Middleware] ❌ CRITICAL: Driver ${user.id} attempted admin access - this should never happen after RBAC check`)
      return redirect('/login', 'Security violation - contact admin')
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

    const { profile, error: profileError } = await fetchUserProfile(user.id)

    // Handle 42P17 recursion error gracefully
    if (profileError && (profileError.code === '42P17' || profileError.message?.includes('infinite recursion'))) {
      console.error(`[Middleware] ⚠️ RLS Recursion Error (42P17) on /login for user ${user.id}`)
      // If we can't fetch profile due to RLS error, redirect to admin dashboard as fallback
      // (assuming the user is authenticated and profile exists)
      return redirect('/admin/dashboard', 'RLS error - redirecting to admin dashboard')
    }

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

  // 5. Add cache-control headers for driver routes to prevent caching
  if (isDriverPath || isOnboardingPath) {
    response.headers.set('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate, proxy-revalidate')
    response.headers.set('Pragma', 'no-cache')
    response.headers.set('Expires', '0')
    response.headers.set('X-Accel-Expires', '0') // Nginx cache control
    response.headers.set('Surrogate-Control', 'no-store') // CDN cache control
  }

  // Also add cache headers for admin routes to ensure real-time updates
  if (isAdminPath) {
    response.headers.set('Cache-Control', 'no-store, no-cache, max-age=0, must-revalidate')
    response.headers.set('Pragma', 'no-cache')
  }


  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
