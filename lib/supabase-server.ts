import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { Profile, Trip } from './supabase'

/**
 * CRITICAL: Request-level client cache
 * Prevents multiple client initializations per request which can cause token mismatches
 */
const requestClientCache = new Map<string, ReturnType<typeof createServerClient>>()

// Server client (for use in Server Components and API Routes)
export async function createServerSupabaseClient() {
  // CRITICAL: Use request ID for caching (Next.js provides this via AsyncLocalStorage)
  // For now, we'll use a simple cache key based on cookies
  const cookieStore = await cookies()
  const cacheKey = cookieStore.toString() // Simple cache key based on cookie state
  
  // Return cached client if available
  if (requestClientCache.has(cacheKey)) {
    return requestClientCache.get(cacheKey)!
  }
  
  const client = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  )
  
  // Cache client for this request
  requestClientCache.set(cacheKey, client)
  
  // Cleanup cache after a short delay (Next.js request lifecycle)
  setTimeout(() => {
    requestClientCache.delete(cacheKey)
  }, 5000) // 5 second cleanup
  
  return client
}

/**
 * CRITICAL: Admin client cache (singleton pattern)
 * Service role client should be reused across requests to prevent token mismatches
 */
let adminClientInstance: ReturnType<typeof createClient> | null = null

// Admin client (for use in API Routes only - bypasses RLS and email confirmation)
export function createSupabaseAdminClient() {
  // CRITICAL: Return cached instance if available
  if (adminClientInstance) {
    return adminClientInstance
  }
  
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured. Please add it to .env.local')
  }

  if (serviceRoleKey.trim().length === 0) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is empty. Please check your .env.local file')
  }

  adminClientInstance = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
  
  return adminClientInstance
}

// Helper functions (server-side only)
export async function getDriverQueuePosition(zoneId: string, driverId: string) {
  const supabase = await createServerSupabaseClient()
  
  const { data: drivers } = await supabase
    .from('profiles')
    .select('id, is_online, updated_at')
    .eq('current_zone', zoneId)
    .eq('role', 'driver')
    .eq('is_online', true)
    .order('updated_at', { ascending: true })
  
  if (!drivers) return 0
  
  const position = drivers.findIndex((d: { id: string }) => d.id === driverId) + 1
  return position > 0 ? position : 0
}

export async function getActiveTrips(driverId: string) {
  const supabase = await createServerSupabaseClient()
  
  const { data, error } = await supabase
    .from('trips')
    .select('id, customer_phone, pickup_address, destination_address, status, driver_id, created_at, updated_at')
    .eq('driver_id', driverId)
    .in('status', ['pending', 'active'])
    .order('created_at', { ascending: false })
  
  if (error) {
    console.error('[getDriverTrips] Error:', error)
    return []
  }
  
  return data || []
}

export async function getPendingTrips() {
  const supabase = await createServerSupabaseClient()
  
  const { data, error } = await supabase
    .from('trips')
    .select('id, customer_phone, pickup_address, destination_address, status, driver_id, created_at, updated_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  
  if (error) {
    console.error('[getPendingTrips] Error:', error)
    return []
  }
  
  return data || []
}


