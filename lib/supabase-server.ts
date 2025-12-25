import { createServerClient } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import type { Profile, Trip } from './supabase'

// Server client (for use in Server Components and API Routes)
export async function createServerSupabaseClient() {
  const cookieStore = await cookies()
  
  return createServerClient(
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
}

// Admin client (for use in API Routes only - bypasses RLS and email confirmation)
export function createSupabaseAdminClient() {
  // Debug: Check if key exists
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  const keyExists = !!serviceRoleKey
  const keyLength = serviceRoleKey?.length || 0
  const keyPreview = serviceRoleKey ? `${serviceRoleKey.substring(0, 10)}...` : 'undefined'
  
  console.log('[DEBUG] Supabase Admin Client Initialization:')
  console.log('  - SUPABASE_SERVICE_ROLE_KEY exists:', keyExists)
  console.log('  - Key length:', keyLength)
  console.log('  - Key preview:', keyPreview)
  console.log('  - All env vars with SUPABASE:', Object.keys(process.env).filter(k => k.includes('SUPABASE')))
  
  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured. Please add it to .env.local')
  }

  if (serviceRoleKey.trim().length === 0) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is empty. Please check your .env.local file')
  }

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    }
  )
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
  
  const position = drivers.findIndex(d => d.id === driverId) + 1
  return position > 0 ? position : 0
}

export async function getActiveTrips(driverId: string) {
  const supabase = await createServerSupabaseClient()
  
  const { data } = await supabase
    .from('trips')
    .select('*')
    .eq('driver_id', driverId)
    .in('status', ['pending', 'active'])
    .order('created_at', { ascending: false })
  
  return data || []
}

export async function getPendingTrips() {
  const supabase = await createServerSupabaseClient()
  
  const { data } = await supabase
    .from('trips')
    .select('*')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  
  return data || []
}


