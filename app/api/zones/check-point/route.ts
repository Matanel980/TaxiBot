import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * Point-in-Polygon API Endpoint (n8n Compatible)
 * Check if a coordinate is within any defined zone
 */

export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { lat, lng } = await request.json()

    if (!lat || !lng) {
      return NextResponse.json({ 
        error: 'Latitude and longitude required' 
      }, { status: 400 })
    }

    // Validate coordinates
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json({ 
        error: 'Invalid coordinates' 
      }, { status: 400 })
    }

    // Use PostGIS function to check point-in-polygon
    const { data, error } = await supabase.rpc('get_zone_for_point', {
      lat,
      lng
    })

    if (error) {
      console.error('Point-in-polygon check error:', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Return standardized response
    return NextResponse.json({
      in_zone: !!data && data.length > 0,
      zone: data && data.length > 0 ? {
        id: data[0].zone_id,
        name: data[0].zone_name,
        color: data[0].zone_color
      } : null,
      coordinates: { lat, lng }
    })
  } catch (error: any) {
    console.error('Check point error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// GET - Check point via query params (for webhook/GET requests)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const searchParams = request.nextUrl.searchParams
    const lat = parseFloat(searchParams.get('lat') || '')
    const lng = parseFloat(searchParams.get('lng') || '')

    if (isNaN(lat) || isNaN(lng)) {
      return NextResponse.json({ 
        error: 'Valid latitude and longitude required' 
      }, { status: 400 })
    }

    // Validate coordinates
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      return NextResponse.json({ 
        error: 'Invalid coordinates' 
      }, { status: 400 })
    }

    // Use PostGIS function to check point-in-polygon
    const { data, error } = await supabase.rpc('get_zone_for_point', {
      lat,
      lng
    })

    if (error) {
      console.error('Point-in-polygon check error:', error)
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Return standardized response
    return NextResponse.json({
      in_zone: !!data && data.length > 0,
      zone: data && data.length > 0 ? {
        id: data[0].zone_id,
        name: data[0].zone_name,
        color: data[0].zone_color
      } : null,
      coordinates: { lat, lng }
    })
  } catch (error: any) {
    console.error('Check point error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

