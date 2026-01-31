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
  

  // CRITICAL: Detect if we're in production (Vercel sets VERCEL=1)
  const isProduction = process.env.VERCEL === '1' || process.env.NODE_ENV === 'production'
  
  // CRITICAL FIX: Explicit cookie options for Vercel production
  // These options ensure cookies persist correctly in Vercel's edge network
  const getCookieOptions = (cookieName: string, cookieValue: string) => {
    const isAuthCookie = cookieName.includes('auth-token') || cookieName.includes('auth-refresh')
    
    // Explicit cookie options as requested
    const cookieOptions: {
      name: string
      value: string
      secure: boolean
      sameSite: 'lax' | 'strict' | 'none'
      path: string
      domain?: string
      httpOnly: boolean
      maxAge?: number
    } = {
      name: cookieName,
      value: cookieValue,
      secure: true, // CRITICAL: Required for Vercel HTTPS
      sameSite: 'lax',
      path: '/',
      domain: '', // CRITICAL: Leave empty to let Vercel handle it automatically
      httpOnly: isAuthCookie, // Auth cookies should be HttpOnly
    }
    
    // Set maxAge for auth cookies
    if (isAuthCookie) {
      if (cookieName.includes('auth-token')) {
        cookieOptions.maxAge = 60 * 60 * 24 * 7 // 7 days
      } else if (cookieName.includes('auth-refresh')) {
        cookieOptions.maxAge = 60 * 60 * 24 * 30 // 30 days
      }
    }
    
    return cookieOptions
  }

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
          // 2. Update response.cookies AND response.headers (so browser receives the session update)
          
          cookiesToSet.forEach((cookie) => {
            const { name, value } = cookie
            
            // CRITICAL: Don't filter when WRITING cookies - always write current project's cookies
            // The filtering in getAll() only affects reading, not writing
            
            // Step 1: Set on request cookies (for current request processing)
            request.cookies.set(name, value)
            
            // Step 2: Get explicit cookie options
            const cookieOptions = getCookieOptions(name, value)
            
            // Step 3: Set on response.cookies (standard Next.js way)
            response.cookies.set(name, value, {
              path: cookieOptions.path,
              sameSite: cookieOptions.sameSite,
              httpOnly: cookieOptions.httpOnly,
              secure: cookieOptions.secure,
              maxAge: cookieOptions.maxAge,
            })
            
            // CRITICAL FIX: Also set via response.headers.set('set-cookie', ...) for Vercel
            // This ensures cookies are properly synced in Vercel's edge network
            const setCookieValue = [
              `${name}=${value}`,
              `Path=${cookieOptions.path}`,
              `SameSite=${cookieOptions.sameSite}`,
              cookieOptions.secure ? 'Secure' : '',
              cookieOptions.httpOnly ? 'HttpOnly' : '',
              cookieOptions.maxAge ? `Max-Age=${cookieOptions.maxAge}` : '',
            ]
              .filter(Boolean)
              .join('; ')
            
            // Append to existing Set-Cookie header or create new one
            const existingSetCookie = response.headers.get('set-cookie')
            if (existingSetCookie) {
              response.headers.set('set-cookie', `${existingSetCookie}, ${setCookieValue}`)
            } else {
              response.headers.set('set-cookie', setCookieValue)
            }
            
            writtenCookies.add(name)
            
            // PRODUCTION DEBUG: Log cookie writes (only first few times)
            if (isProduction && cookieOptions.httpOnly && writtenCookies.size <= 2) {
              console.error(`[Middleware Production] Setting auth cookie: ${name.substring(0, 30)}... | Secure: ${cookieOptions.secure} | HttpOnly: ${cookieOptions.httpOnly} | Path: ${cookieOptions.path} | Domain: ${cookieOptions.domain || '(auto)'}`)
            }
          })
        },
      },
    }
  )

  // CRITICAL: Use getUser() for reliable authentication (more secure, forces refresh)
  // getUser() is more secure than getSession() and forces a refresh if cookie is valid but session is stale
  // This call will trigger cookie updates if tokens need refreshing
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  
  const { pathname } = request.nextUrl

  // PRODUCTION FIX: After getUser(), check if cookies were written to response
  // If not, manually extract and set them from the Supabase client
  const cookiesAfterGetUser = response.cookies.getAll()
  const authCookiesAfterGetUser = cookiesAfterGetUser.filter(c => 
    c.name.includes('sb-') && (c.name.includes('auth-token') || c.name.includes('auth-refresh'))
  )
  
  // PRODUCTION DEBUG: Log cookie state
  if (isProduction) {
    console.error(`[Middleware Production] After getUser() - Has user: ${!!user}, Auth cookies in response: ${authCookiesAfterGetUser.length}`)
  }
  
  // CRITICAL FIX: If user exists but no cookies in response, manually extract from request and set them
  // This handles the case where Supabase's setAll() was called but cookies didn't make it to response
  if (user && authCookiesAfterGetUser.length === 0) {
    // Check if we have cookies in the request (user is authenticated but cookies weren't written to response)
    const incomingAuthCookies = filteredCookies.filter(c => 
      c.name.includes('sb-') && (c.name.includes('auth-token') || c.name.includes('auth-refresh'))
    )
    
    if (incomingAuthCookies.length > 0) {
      // PRODUCTION FIX: Manually re-attach cookies to response
      // This ensures cookies persist even if setAll() didn't work correctly
      if (isProduction) {
        console.error(`[Middleware Production] ⚠️ User authenticated but no cookies in response. Re-attaching ${incomingAuthCookies.length} cookie(s)`)
      }
      
      incomingAuthCookies.forEach((cookie) => {
        // Use the same explicit cookie options function
        const cookieOptions = getCookieOptions(cookie.name, cookie.value)
        
        // Set on response.cookies
        response.cookies.set(cookie.name, cookie.value, {
          path: cookieOptions.path,
          sameSite: cookieOptions.sameSite,
          httpOnly: cookieOptions.httpOnly,
          secure: cookieOptions.secure,
          maxAge: cookieOptions.maxAge,
        })
        
        // CRITICAL FIX: Also set via response.headers.set('set-cookie', ...) for Vercel
        const setCookieValue = [
          `${cookie.name}=${cookie.value}`,
          `Path=${cookieOptions.path}`,
          `SameSite=${cookieOptions.sameSite}`,
          cookieOptions.secure ? 'Secure' : '',
          cookieOptions.httpOnly ? 'HttpOnly' : '',
          cookieOptions.maxAge ? `Max-Age=${cookieOptions.maxAge}` : '',
        ]
          .filter(Boolean)
          .join('; ')
        
        const existingSetCookie = response.headers.get('set-cookie')
        if (existingSetCookie) {
          response.headers.set('set-cookie', `${existingSetCookie}, ${setCookieValue}`)
        } else {
          response.headers.set('set-cookie', setCookieValue)
        }
      })
    }
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
      
      // Use the same explicit cookie options function
      const cookieOptions = getCookieOptions(name, value)
      
      // Set on redirect response.cookies
      redirectResponse.cookies.set(name, value, {
        path: cookieOptions.path,
        sameSite: cookieOptions.sameSite,
        httpOnly: cookieOptions.httpOnly,
        secure: cookieOptions.secure,
        maxAge: cookieOptions.maxAge,
      })
      
      // CRITICAL FIX: Also set via redirectResponse.headers.set('set-cookie', ...) for Vercel
      const setCookieValue = [
        `${name}=${value}`,
        `Path=${cookieOptions.path}`,
        `SameSite=${cookieOptions.sameSite}`,
        cookieOptions.secure ? 'Secure' : '',
        cookieOptions.httpOnly ? 'HttpOnly' : '',
        cookieOptions.maxAge ? `Max-Age=${cookieOptions.maxAge}` : '',
      ]
        .filter(Boolean)
        .join('; ')
      
      const existingSetCookie = redirectResponse.headers.get('set-cookie')
      if (existingSetCookie) {
        redirectResponse.headers.set('set-cookie', `${existingSetCookie}, ${setCookieValue}`)
      } else {
        redirectResponse.headers.set('set-cookie', setCookieValue)
      }
    })
    
    return redirectResponse
  }

  // CRITICAL FIX: With refined matcher, /login and /auth are already excluded
  // But we keep this check as a safety net in case matcher changes
  // Early return for /login, /auth, and API routes to prevent infinite redirect loops
  if (pathname === '/login' || pathname.startsWith('/auth/') || pathname.startsWith('/api/')) {
    // These routes should not be processed by middleware
    // /login is completely excluded via matcher
    // /auth/* routes are excluded via matcher
    // /api/* routes are excluded via matcher
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
  // CRITICAL FIX: Only redirect if path is NOT /login (prevents infinite loop)
  // GRACE PERIOD: Allow /onboarding to load even if session is temporarily missing
  // This handles the case where cookies were just set but middleware hasn't seen them yet
  if ((isDriverPath || isAdminPath || isOnboardingPath) && !isLoginPath) {
    if (!user) {
      // GRACE PERIOD: If user is accessing /onboarding without session, allow it
      // This handles the case where createSession just set cookies but middleware hasn't seen them yet
      // The client-side will handle auth check and redirect if needed
      if (isOnboardingPath) {
        console.warn(`[Middleware] ⚠️ Grace period: Allowing /onboarding access without session (cookies may be propagating)`)
        return response
      }
      return redirect('/login', 'Unauthenticated access to protected route')
    }

    // Fetch profile with station isolation support
    const { profile, error } = await fetchUserProfile(user.id)

    // CRITICAL FIX: Handle profile fetch errors gracefully without redirect loops
    // If profile is missing, allow access but let client-side handle the error
    // This prevents infinite redirect loops when user exists but profile is missing
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
          // CRITICAL FIX: Don't redirect if already on /login - this causes infinite loop
          if (!isLoginPath) {
          return redirect('/login', 'RLS policy error - contact admin')
          }
          // If already on /login, allow access and let client handle error
          return response
        }
      } else {
        // Other errors (profile not found, etc.)
        console.error(`[Middleware] Profile fetch error for user ${user.id}:`, {
          code: error.code,
          message: error.message,
          hint: 'Profile may not exist yet. Allowing access to let client-side handle.'
        })
        
        // CRITICAL FIX: If profile is missing, allow access to let client-side handle
        // Redirecting causes infinite loop if user is authenticated but profile is missing
        if (isAdminEmail) {
          // Admin email fallback - allow access
        } else {
          // For non-admin users with missing profile, allow access but log warning
          // Client-side code should handle missing profile (show onboarding, etc.)
          console.warn(`[Middleware] ⚠️ Profile not found for user ${user.id} - allowing access to let client handle`)
          // Don't redirect - let the page render and show appropriate error/onboarding
        }
      }
    }

    // CRITICAL FIX: Only redirect if profile is missing AND not already on /login
    // If profile is missing but user is authenticated, allow access to let client handle
    if (!profile && !isAdminEmail) {
      // Check if this is a profile-not-found scenario (user exists but no profile)
      // In this case, allow access to let client-side handle (show onboarding, etc.)
      if (error && (error.code === 'PGRST116' || error.message?.includes('No rows'))) {
        console.warn(`[Middleware] ⚠️ Profile not found for authenticated user ${user.id} - allowing access for onboarding`)
        // Don't redirect - let the page render and show onboarding
        return response
      }
      
      // Only redirect if not already on /login
      if (!isLoginPath) {
      return redirect('/login', 'Profile not found - contact admin')
      }
      // If already on /login, allow access
      return response
    }

    const userRole = profile?.role || (isAdminEmail ? 'admin' : '')
    const fullName = profile?.full_name || ''
    const vehicleNumber = profile?.vehicle_number || ''
    const carType = profile?.car_type || ''
    const stationId = profile?.station_id || null


    // 2. Strict Role-Based Access Control (RBAC)
    // ENTERPRISE-GRADE: Server-side role validation before page render
    // CRITICAL FIX: Only redirect if not already on /login
    if (isAdminPath && userRole !== 'admin' && !isAdminEmail) {
      console.warn(`[Middleware] 🚫 RBAC Violation: User ${user.id} (role: ${userRole}) attempted to access /admin`)
      if (!isLoginPath) {
      return redirect('/login', 'Non-admin attempt to access /admin')
      }
    }

    if (isDriverPath && userRole !== 'driver' && !isAdminEmail) {
      console.warn(`[Middleware] 🚫 RBAC Violation: User ${user.id} (role: ${userRole}) attempted to access /driver`)
      if (!isLoginPath) {
      return redirect('/login', 'Unauthorized access to /driver')
      }
    }
    
    // ENTERPRISE-GRADE: Additional security - ensure drivers cannot trigger admin-only features
    // This is a defense-in-depth measure (RBAC is already enforced above)
    if (userRole === 'driver' && isAdminPath) {
      console.error(`[Middleware] ❌ CRITICAL: Driver ${user.id} attempted admin access - this should never happen after RBAC check`)
      if (!isLoginPath) {
        return redirect('/login', 'Security violation - contact admin')
      }
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

  // PRODUCTION FIX: Before returning, verify cookies are in response headers
  // Check if set-cookie headers contain sb- tokens
  const finalCookies = response.cookies.getAll()
  const finalAuthCookies = finalCookies.filter(c => 
    c.name.includes('sb-') && (c.name.includes('auth-token') || c.name.includes('auth-refresh'))
  )
  
  // PRODUCTION DEBUG: Log final cookie state
  if (isProduction && user) {
    const setCookieHeader = response.headers.get('set-cookie')
    const hasSetCookieHeader = setCookieHeader && setCookieHeader.includes('sb-')
    
    console.error(`[Middleware Production] Final check - Auth cookies in response: ${finalAuthCookies.length}, Set-Cookie header present: ${!!hasSetCookieHeader}`)
    
    // If user exists but no cookies, log warning
    if (finalAuthCookies.length === 0) {
      console.error(`[Middleware Production] ⚠️ CRITICAL: User authenticated but no auth cookies in final response!`)
      console.error(`[Middleware Production] Set-Cookie header: ${setCookieHeader ? setCookieHeader.substring(0, 100) : 'null'}`)
      
      // LAST RESORT: Try to get cookies from request and set them one more time
      const lastResortCookies = filteredCookies.filter(c => 
        c.name.includes('sb-') && (c.name.includes('auth-token') || c.name.includes('auth-refresh'))
      )
      
      if (lastResortCookies.length > 0) {
        console.error(`[Middleware Production] 🔧 LAST RESORT: Re-attaching ${lastResortCookies.length} cookie(s) from request`)
        lastResortCookies.forEach((cookie) => {
          // Use the same explicit cookie options function
          const cookieOptions = getCookieOptions(cookie.name, cookie.value)
          
          // Set on response.cookies
          response.cookies.set(cookie.name, cookie.value, {
            path: cookieOptions.path,
            sameSite: cookieOptions.sameSite,
            httpOnly: cookieOptions.httpOnly,
            secure: cookieOptions.secure,
            maxAge: cookieOptions.maxAge,
          })
          
          // CRITICAL FIX: Also set via response.headers.set('set-cookie', ...) for Vercel
          const setCookieValue = [
            `${cookie.name}=${cookie.value}`,
            `Path=${cookieOptions.path}`,
            `SameSite=${cookieOptions.sameSite}`,
            cookieOptions.secure ? 'Secure' : '',
            cookieOptions.httpOnly ? 'HttpOnly' : '',
            cookieOptions.maxAge ? `Max-Age=${cookieOptions.maxAge}` : '',
          ]
            .filter(Boolean)
            .join('; ')
          
          const existingSetCookie = response.headers.get('set-cookie')
          if (existingSetCookie) {
            response.headers.set('set-cookie', `${existingSetCookie}, ${setCookieValue}`)
    } else {
            response.headers.set('set-cookie', setCookieValue)
          }
        })
      }
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * CRITICAL FIX: Only match protected routes to prevent /login from being processed
     * This ensures /login page is completely untouched by middleware
     * 
     * Matches:
     * - /admin/:path* (all admin routes)
     * - /driver/:path* (all driver routes)
     * - /onboarding (driver onboarding)
     * 
     * Excludes:
     * - /login (completely excluded - no middleware processing)
     * - /auth/* (auth callbacks - excluded)
     * - /api/* (API routes - excluded)
     * - /_next/* (Next.js internals - excluded)
     * - Static files (images, fonts, etc. - excluded)
     */
    '/admin/:path*',
    '/driver/:path*',
    '/onboarding',
  ],
}
