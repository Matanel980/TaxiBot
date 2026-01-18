// Supabase Edge Function: Send Push Notification
// Sends a push notification to a driver when a trip is assigned

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Get Supabase client with service role key
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get VAPID keys from environment
    const vapidPublicKey = Deno.env.get('VAPID_PUBLIC_KEY')
    const vapidPrivateKey = Deno.env.get('VAPID_PRIVATE_KEY')
    const vapidSubject = Deno.env.get('VAPID_SUBJECT') || 'mailto:your-email@example.com'

    if (!vapidPublicKey || !vapidPrivateKey) {
      console.error('[send-push-notification] VAPID keys not configured')
      return new Response(
        JSON.stringify({ error: 'VAPID keys not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body
    const { trip_id, driver_id } = await req.json()

    if (!trip_id || !driver_id) {
      return new Response(
        JSON.stringify({ error: 'trip_id and driver_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch trip details
    const { data: trip, error: tripError } = await supabase
      .from('trips')
      .select('id, customer_phone, pickup_address, destination_address, status, driver_id')
      .eq('id', trip_id)
      .single()

    if (tripError || !trip) {
      console.error('[send-push-notification] Trip fetch error:', tripError)
      return new Response(
        JSON.stringify({ error: 'Trip not found', details: tripError?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify trip is assigned to this driver
    if (trip.driver_id !== driver_id) {
      return new Response(
        JSON.stringify({ error: 'Trip not assigned to this driver' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Fetch active push tokens for the driver
    const { data: pushTokens, error: tokensError } = await supabase
      .from('push_tokens')
      .select('id, token, platform')
      .eq('driver_id', driver_id)
      .eq('is_active', true)
      .or('expires_at.is.null,expires_at.gt.' + new Date().toISOString())

    if (tokensError) {
      console.error('[send-push-notification] Push tokens fetch error:', tokensError)
      return new Response(
        JSON.stringify({ error: 'Failed to fetch push tokens', details: tokensError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!pushTokens || pushTokens.length === 0) {
      console.log('[send-push-notification] No active push tokens found for driver')
      return new Response(
        JSON.stringify({ message: 'No active push tokens found', driver_id }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Prepare notification payload
    const notificationPayload = JSON.stringify({
      title: 'נסיעה חדשה!',
      body: `מ-${trip.pickup_address} ל-${trip.destination_address}`,
      icon: '/icon-192x192.png',
      badge: '/icon-96x96.png',
      tag: `trip-${trip_id}`,
      requireInteraction: true,
      data: {
        tripId: trip_id,
        driverId: driver_id,
        pickupAddress: trip.pickup_address,
        destinationAddress: trip.destination_address,
      },
      actions: [
        {
          action: 'accept',
          title: 'אישור',
        },
        {
          action: 'decline',
          title: 'דחייה',
        },
      ],
      vibrate: [200, 100, 200],
    })

    // Import web-push dynamically (Deno-compatible)
    const webPush = await import('https://esm.sh/web-push@3.6.6')

    // Set VAPID details
    webPush.default.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey)

    // Send notification to all active tokens
    const results = await Promise.allSettled(
      pushTokens.map(async (tokenRecord) => {
        try {
          // Parse subscription token (it's stored as JSON string)
          const subscription = JSON.parse(tokenRecord.token)

          await webPush.default.sendNotification(
            {
              endpoint: subscription.endpoint,
              keys: {
                p256dh: subscription.keys?.p256dh || '',
                auth: subscription.keys?.auth || '',
              },
            },
            notificationPayload
          )

          return { token_id: tokenRecord.id, success: true }
        } catch (error: any) {
          console.error(`[send-push-notification] Failed to send to token ${tokenRecord.id}:`, error)

          // Mark token as inactive if it's invalid/expired (410 = Gone, 404 = Not Found)
          if (error.statusCode === 410 || error.statusCode === 404) {
            await supabase
              .from('push_tokens')
              .update({ is_active: false })
              .eq('id', tokenRecord.id)
          }

          return { token_id: tokenRecord.id, success: false, error: error.message }
        }
      })
    )

    const successCount = results.filter((r) => r.status === 'fulfilled' && r.value.success).length
    const failureCount = results.length - successCount

    console.log(
      `[send-push-notification] Sent ${successCount}/${results.length} notifications for trip ${trip_id}`
    )

    return new Response(
      JSON.stringify({
        success: true,
        trip_id,
        driver_id,
        tokens_sent: successCount,
        tokens_failed: failureCount,
        total_tokens: results.length,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('[send-push-notification] Unexpected error:', error)
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
