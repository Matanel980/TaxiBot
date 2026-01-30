# Vercel Cron Jobs Setup (Alternative to pg_cron)

If `pg_cron` is not available in your Supabase plan, you can use Vercel Cron Jobs for automated tasks.

---

## Setup Instructions

### Step 1: Create `vercel.json`

Create `vercel.json` in your project root:

```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup-old-trips",
      "schedule": "0 2 * * *"
    },
    {
      "path": "/api/cron/cleanup-expired-tokens",
      "schedule": "0 3 * * 0"
    }
  ]
}
```

### Step 2: Create API Routes

#### `app/api/cron/cleanup-old-trips/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-server'

/**
 * Cron job to clean up old completed trips
 * Runs daily at 2 AM UTC
 * 
 * Authentication: Vercel Cron jobs include a secret token
 */
export async function GET(request: NextRequest) {
  try {
    // Verify this is a Vercel Cron request
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const supabase = createSupabaseAdminClient()
    
    // Delete completed trips older than 90 days
    const { data, error } = await supabase
      .from('trips')
      .delete()
      .eq('status', 'completed')
      .lt('updated_at', new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString())
    
    if (error) {
      console.error('[Cron] Error cleaning up old trips:', error)
      return NextResponse.json(
        { error: 'Failed to clean up trips', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      deleted_count: data?.length || 0,
      message: `Cleaned up ${data?.length || 0} old trips`
    })
  } catch (error: any) {
    console.error('[Cron] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
```

#### `app/api/cron/cleanup-expired-tokens/route.ts`

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase-server'

/**
 * Cron job to clean up expired push tokens
 * Runs weekly on Sunday at 3 AM UTC
 */
export async function GET(request: NextRequest) {
  try {
    // Verify this is a Vercel Cron request
    const authHeader = request.headers.get('authorization')
    const cronSecret = process.env.CRON_SECRET
    
    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const supabase = createSupabaseAdminClient()
    
    // Mark expired tokens as inactive
    const { data, error } = await supabase
      .from('push_tokens')
      .update({ is_active: false })
      .lt('expires_at', new Date().toISOString())
      .eq('is_active', true)
    
    if (error) {
      console.error('[Cron] Error cleaning up expired tokens:', error)
      return NextResponse.json(
        { error: 'Failed to clean up tokens', details: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      updated_count: data?.length || 0,
      message: `Cleaned up ${data?.length || 0} expired tokens`
    })
  } catch (error: any) {
    console.error('[Cron] Unexpected error:', error)
    return NextResponse.json(
      { error: 'Internal server error', details: error.message },
      { status: 500 }
    )
  }
}
```

### Step 3: Add Environment Variable

Add to Vercel Dashboard → Environment Variables:

```bash
CRON_SECRET=your-random-secret-key-here
```

**Generate a secure secret:**
```bash
openssl rand -base64 32
```

### Step 4: Deploy

Push to main branch. Vercel will automatically set up the cron jobs.

---

## Schedule Format

Vercel uses standard cron syntax:

```
* * * * *
│ │ │ │ │
│ │ │ │ └─── Day of week (0-7, 0 and 7 = Sunday)
│ │ │ └───── Month (1-12)
│ │ └─────── Day of month (1-31)
│ └───────── Hour (0-23)
└─────────── Minute (0-59)
```

**Examples:**
- `0 2 * * *` - Daily at 2 AM UTC
- `0 3 * * 0` - Weekly on Sunday at 3 AM UTC
- `*/30 * * * *` - Every 30 minutes
- `0 */6 * * *` - Every 6 hours

---

## Monitoring

View cron job executions in Vercel Dashboard → Your Project → Cron Jobs

---

## Notes

- Cron jobs run in UTC timezone
- Free tier includes 1,000 cron executions/month
- Pro tier includes 10,000 cron executions/month
- Cron jobs must complete within 60 seconds (Pro: 300 seconds)
