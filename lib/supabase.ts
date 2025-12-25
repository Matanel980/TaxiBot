import { createBrowserClient } from '@supabase/ssr'

// Database Schema Types
export interface Profile {
  id: string // uuid
  phone: string // unique
  role: 'driver' | 'admin'
  full_name: string
  vehicle_number?: string | null // Vehicle registration number
  car_type?: string | null // Car model/type
  current_zone: string | null // uuid foreign key to zones
  is_online: boolean
  is_approved?: boolean // Driver approval status
  latitude: number | null
  longitude: number | null
  current_address: string | null // Human-readable address
  heading: number | null // Direction in degrees (0-360)
  updated_at: string // timestamp
}

export interface Trip {
  id: string // uuid
  customer_phone: string
  pickup_address: string
  destination_address: string
  status: 'pending' | 'active' | 'completed'
  driver_id: string | null // uuid foreign key to profiles
  created_at: string // timestamp
  updated_at: string // timestamp
}

export interface Zone {
  id: string // uuid
  name: string
  polygon_coordinates: GeoJSON.Polygon // jsonb
  color?: string // Hex color code for zone display
  created_at?: string // timestamp
  updated_at?: string // timestamp
}

// PostGIS-based zone (production)
export interface ZonePostGIS {
  id: string
  name: string
  geometry: any // PostGIS geometry (will be returned as GeoJSON by Supabase)
  color: string
  center_lat: number | null
  center_lng: number | null
  area_sqm: number | null
  created_at: string
  updated_at: string
}

// For API responses (n8n compatible)
export interface ZoneGeoJSON {
  type: 'Feature'
  id: string
  geometry: GeoJSON.Polygon
  properties: {
    name: string
    color: string
    area_sqm: number | null
    center_lat: number | null
    center_lng: number | null
    created_at: string
  }
}

// Browser client (for use in Client Components)
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        persistSession: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
      cookieOptions: {
        name: 'sb-auth-token',
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
      }
    }
  )
}
