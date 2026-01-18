import { NextRequest, NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase-server'

/**
 * DELETE /api/push/unregister
 * Remove a push notification token (on logout/uninstall)
 */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createServerSupabaseClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const body = await request.json().catch(() => ({}))
    const { token } = body

    if (token) {
      // Remove specific token
      const { error } = await supabase
        .from('push_tokens')
        .delete()
        .eq('token', token)
        .eq('driver_id', user.id)

      if (error) {
        console.error('[Push Unregister] Database error:', error)
        return NextResponse.json(
          { error: 'Failed to unregister push token', details: error.message },
          { status: 500 }
        )
      }
    } else {
      // Remove all tokens for this driver (logout scenario)
      const { error } = await supabase
        .from('push_tokens')
        .update({ is_active: false })
        .eq('driver_id', user.id)
        .eq('is_active', true)

      if (error) {
        console.error('[Push Unregister] Database error:', error)
        return NextResponse.json(
          { error: 'Failed to unregister push tokens', details: error.message },
          { status: 500 }
        )
      }
    }

    return NextResponse.json({
      success: true,
    })
  } catch (error: any) {
    console.error('[Push Unregister] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}





