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
      // Only keep if it matches current project
      return cookieProjectId === supabaseProjectId
    }
    // Keep all non-Supabase cookies (Next.js, etc.)
    return true
  })

  // Log cookie filtering
  if (allCookies.length !== filteredCookies.length) {
    console.log(`[Middleware] Filtered ${allCookies.length - filteredCookies.length} cookies from other projects`)
  }

  // CRITICAL: Create response object that will be used throughout
  // This ensures all cookie updates go to the same response instance
  let response = NextResponse.next({
    request: {
      headers: request.headers,
    },
  })

  // Track cookies being written for debugging
  const writtenCookies = new Set<string>()

  // Initialize Supabase client with proper cookie handling
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
            const cookieOptions: {
              path: string
              sameSite: 'lax' | 'strict' | 'none'
              httpOnly?: boolean
              secure?: boolean
              maxAge?: number
            } = {
              path: '/', // CRITICAL: Explicit path for cookie persistence
              sameSite: 'lax', // Allow cookies in cross-site requests
              secure: process.env.NODE_ENV === 'production', // Secure in production
            }
            
            // Preserve httpOnly if set
            if ('httpOnly' in cookie && typeof cookie.httpOnly === 'boolean') {
              cookieOptions.httpOnly = cookie.httpOnly
            }
            
            // Preserve maxAge if set
            if ('maxAge' in cookie && typeof cookie.maxAge === 'number') {
              cookieOptions.maxAge = cookie.maxAge
            }
            
            // Write cookie to response
            response.cookies.set(name, value, cookieOptions)
            writtenCookies.add(name)
            
            // Debug log for cookie writes
            console.log(`[Cookie Write] Setting cookie: ${name.substring(0, 30)}... | Path: ${cookieOptions.path} | HttpOnly: ${cookieOptions.httpOnly ?? false} | Secure: ${cookieOptions.secure ?? false}`)
          })
        },
      },
    }
  )

  // Use getUser() for reliable authentication (more reliable than getSession)
  // This call may trigger cookie updates (token refresh, etc.)
  const { data: { user }, error: userError } = await supabase.auth.getUser()
  
  // CRITICAL: After getUser(), ensure any cookie updates are captured
  // The setAll() callback above should have already updated response.cookies,
  // but we verify here that cookies were written
  if (writtenCookies.size > 0) {
    console.log(`[Cookie Sync] ${writtenCookies.size} cookie(s) written after getUser():`, Array.from(writtenCookies))
  }
  
  const { pathname } = request.nextUrl

  // LOGGING
  console.log(`[Middleware] Path: ${pathname} | User ID: ${user?.id || 'none'} | Phone: ${user?.phone || 'none'}`)
  
  if (userError) {
    console.error(`[Middleware] Error getting user:`, {
      message: userError.message,
      status: userError.status
    })
  }

  // Helper for strict redirects with cookie propagation
  const redirect = (path: string, reason: string) => {
    console.log(`[Middleware] Redirecting to ${path} | Reason: ${reason}`)
    const url = new URL(path, request.url)
    const redirectResponse = NextResponse.redirect(url)
    
    // CRITICAL: Copy ALL cookies from response to redirect response
    // This includes any cookies that Supabase set during getUser() or other auth calls
    const allResponseCookies = response.cookies.getAll()
    console.log(`[Cookie Redirect] Copying ${allResponseCookies.length} cookie(s) to redirect response`)
    
    allResponseCookies.forEach((cookie) => {
      const { name, value } = cookie
      
      // Get original cookie options if available, otherwise use defaults
      const cookieOptions: {
        path: string
        sameSite: 'lax' | 'strict' | 'none'
        httpOnly?: boolean
        secure?: boolean
        maxAge?: number
      } = {
        path: '/', // Ensure path is set
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      }
      
      // Preserve httpOnly if it was set
      if ('httpOnly' in cookie && typeof cookie.httpOnly === 'boolean') {
        cookieOptions.httpOnly = cookie.httpOnly
      }
      
      // Preserve maxAge if it was set
      if ('maxAge' in cookie && typeof cookie.maxAge === 'number') {
        cookieOptions.maxAge = cookie.maxAge
      }
      
      redirectResponse.cookies.set(name, value, cookieOptions)
      console.log(`[Cookie Redirect] Copied cookie: ${name.substring(0, 30)}... to redirect`)
    })
    
    return redirectResponse
  }

  // Auth-In-Progress Grace: Allow /auth/* routes
  // CRITICAL: Return response AFTER Supabase has had a chance to update cookies
  // The getUser() call above may have triggered cookie updates, which are now in response.cookies
  if (pathname.startsWith('/auth/')) {
    // Log cookies that will be returned
    const authCookies = response.cookies.getAll()
    if (authCookies.length > 0) {
      console.log(`[Auth Route] Returning ${authCookies.length} cookie(s) for /auth/* route`)
    }
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
    
    // Debug logging: Show what the server sees
    if (profile) {
      console.log(`[Middleware Debug] Profile fetched:`, {
        id: profile.id,
        role: profile.role,
        full_name: profile.full_name,
        station_id: profile.station_id,
        phone: profile.phone,
        has_vehicle: !!profile.vehicle_number,
        has_car_type: !!profile.car_type
      })
    } else if (error) {
      console.log(`[Middleware Debug] Profile fetch error:`, {
        code: error.code,
        message: error.message,
        hint: error.hint
      })
    } else {
      console.log(`[Middleware Debug] Profile not found for user: ${userId}`)
    }
    
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
          console.log('[Middleware] Profile not found but admin email whitelisted')
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

    // Log station isolation status (warn but don't block if null during transition)
    if (profile && !stationId) {
      console.warn(`[Middleware] ⚠️ User ${user.id} (${userRole}) has no station_id assigned - this is allowed during transition`)
    }

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

  // CRITICAL: Before returning, verify cookies are in the response
  // This ensures any cookies set by Supabase during auth calls are included
  const finalCookies = response.cookies.getAll()
  if (finalCookies.length > 0) {
    console.log(`[Middleware] Returning response with ${finalCookies.length} cookie(s)`)
    // Log Supabase auth cookies specifically
    const authCookies = finalCookies.filter(c => c.name.includes('sb-') && c.name.includes('auth-token'))
    if (authCookies.length > 0) {
      console.log(`[Middleware] ✅ Auth cookies present: ${authCookies.map(c => c.name.substring(0, 30)).join(', ')}`)
    } else {
      console.warn(`[Middleware] ⚠️ No auth cookies found in response (this may cause session loss)`)
    }
  } else {
    console.warn(`[Middleware] ⚠️ No cookies in response at all (this will cause session loss)`)
  }

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
