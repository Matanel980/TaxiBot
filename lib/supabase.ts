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
  station_id: string | null // uuid foreign key to stations (MULTI-TENANT)
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
  zone_id?: string | null // uuid foreign key to zones
  station_id: string | null // uuid foreign key to stations (MULTI-TENANT)
  pickup_lat: number | null // Pickup latitude (REQUIRED - no trip without coordinates)
  pickup_lng: number | null // Pickup longitude (REQUIRED - no trip without coordinates)
  destination_lat: number | null // Destination latitude (REQUIRED - no trip without coordinates)
  destination_lng: number | null // Destination longitude (REQUIRED - no trip without coordinates)
  created_at: string // timestamp
  updated_at: string // timestamp
}

export interface PushToken {
  id: string // uuid
  driver_id: string // uuid foreign key to profiles
  token: string // Push subscription token (unique)
  platform: 'web' | 'ios' | 'android'
  user_agent?: string | null
  created_at: string // timestamp
  updated_at: string // timestamp
  expires_at?: string | null // timestamp
  is_active: boolean
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
  station_id: string | null // uuid foreign key to stations (MULTI-TENANT)
  center_lat: number | null
  center_lng: number | null
  area_sqm: number | null
  created_at: string
  updated_at: string
}

// Station interface
export interface Station {
  id: string // uuid
  name: string
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
        autoRefreshToken: true,
        flowType: 'pkce',
      },
      // Using default Supabase cookie naming convention for middleware compatibility
      // Cookies will be named: sb-<project-ref>-auth-token
    }
  )
}
