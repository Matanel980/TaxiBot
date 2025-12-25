import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

// GET - Fetch all zones as GeoJSON FeatureCollection (n8n compatible)
export async function GET(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    // Try PostGIS table first, fallback to legacy table
    let { data: zones, error } = await supabase
      .from('zones_postgis')
      .select('*')
      .order('name')

    // If PostGIS table doesn't exist or is empty, try legacy table
    if (error || !zones || zones.length === 0) {
      const { data: legacyZones } = await supabase
        .from('zones')
        .select('*')
        .order('name')

      if (legacyZones && legacyZones.length > 0) {
        // Return legacy format for backward compatibility
        const { data: drivers } = await supabase
          .from('profiles')
          .select('current_zone, is_online')
          .eq('role', 'driver')

        const zonesWithCounts = legacyZones.map(zone => ({
          ...zone,
          driverCount: drivers?.filter(
            d => d.current_zone === zone.id && d.is_online
          ).length || 0
        }))

        return NextResponse.json({ zones: zonesWithCounts })
      }
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Get driver counts per zone
    const { data: drivers } = await supabase
      .from('profiles')
      .select('current_zone, is_online')
      .eq('role', 'driver')

    // Convert to GeoJSON FeatureCollection
    const featureCollection: GeoJSON.FeatureCollection = {
      type: 'FeatureCollection',
      features: zones?.map(zone => ({
        type: 'Feature',
        id: zone.id,
        geometry: zone.geometry, // PostGIS returns geometry as GeoJSON
        properties: {
          name: zone.name,
          color: zone.color,
          area_sqm: zone.area_sqm,
          center_lat: zone.center_lat,
          center_lng: zone.center_lng,
          created_at: zone.created_at,
          driverCount: drivers?.filter(
            d => d.current_zone === zone.id && d.is_online
          ).length || 0
        }
      })) || []
    }

    return NextResponse.json(featureCollection)
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Create new zone (accepts WKT and metadata)
export async function POST(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { name, wkt, color, center_lat, center_lng, area_sqm } = await request.json()

    if (!wkt) {
      return NextResponse.json({ error: 'WKT geometry required' }, { status: 400 })
    }

    // Use PostGIS function to create zone from WKT
    const { data, error } = await supabase.rpc('create_zone_from_wkt', {
      zone_name: name,
      wkt_string: wkt,
      zone_color: color || '#F7C948',
      center_latitude: center_lat,
      center_longitude: center_lng,
      area: area_sqm
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ zone: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// PUT - Update zone (accepts WKT and metadata)
export async function PUT(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { id, name, wkt, color, center_lat, center_lng, area_sqm } = await request.json()

    if (!id) {
      return NextResponse.json({ error: 'Zone ID required' }, { status: 400 })
    }

    // Use PostGIS function to update zone from WKT
    const { data, error } = await supabase.rpc('update_zone_from_wkt', {
      zone_id: id,
      zone_name: name,
      wkt_string: wkt,
      zone_color: color || '#F7C948',
      center_latitude: center_lat,
      center_longitude: center_lng,
      area: area_sqm
    })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ zone: data })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Delete zone
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'admin') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const searchParams = request.nextUrl.searchParams
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Zone ID required' }, { status: 400 })
    }

    // Try PostGIS table first, fallback to legacy table
    let { error } = await supabase
      .from('zones_postgis')
      .delete()
      .eq('id', id)

    if (error) {
      // Try legacy table
      const { error: legacyError } = await supabase
        .from('zones')
        .delete()
        .eq('id', id)

      if (legacyError) {
        return NextResponse.json({ error: legacyError.message }, { status: 400 })
      }
    }

    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
