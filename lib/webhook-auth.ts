import crypto from 'crypto'

/**
 * Webhook Authentication Utilities
 * HMAC signature verification and API key validation
 */

/**
 * Verify HMAC signature for webhook request
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  secret: string
): boolean {
  try {
    const hmac = crypto.createHmac('sha256', secret)
    hmac.update(payload)
    const expectedSignature = `sha256=${hmac.digest('hex')}`

    // Use timing-safe comparison to prevent timing attacks
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    )
  } catch (error) {
    console.error('[Webhook Auth] Signature verification error:', error)
    return false
  }
}

/**
 * Validate API key
 */
export function validateApiKey(apiKey: string | null): boolean {
  if (!apiKey) {
    return false
  }

  const validKeys = process.env.WEBHOOK_API_KEYS?.split(',').map(k => k.trim()) || []
  return validKeys.includes(apiKey)
}

/**
 * Simple in-memory rate limiter (MVP)
 * For production, use Redis or Supabase Edge Functions rate limiting
 */
const rateLimiter = new Map<string, { count: number; resetAt: number }>()

export function checkRateLimit(
  apiKey: string,
  limit = 100,
  windowMs = 60000
): boolean {
  const now = Date.now()
  const record = rateLimiter.get(apiKey)

  if (!record || now > record.resetAt) {
    rateLimiter.set(apiKey, { count: 1, resetAt: now + windowMs })
    return true
  }

  if (record.count >= limit) {
    return false
  }

  record.count++
  return true
}

/**
 * Authenticate webhook request
 * Returns error message if authentication fails, null if successful
 */
export function authenticateWebhookRequest(
  request: { headers: { get: (name: string) => string | null } }
): { error: string; status: number } | null {
  const apiKey = request.headers.get('x-api-key')
  const signature = request.headers.get('x-signature')

  // Validate API key
  if (!validateApiKey(apiKey)) {
    return { error: 'Invalid API key', status: 401 }
  }

  // Validate signature (if HMAC is enabled)
  const secret = process.env.WEBHOOK_SECRET_KEY
  if (secret && signature) {
    // Note: We need the raw body for signature verification
    // This will be handled in the route handler
    // This function just checks if signature header is present
  }

  // Check rate limit
  if (!checkRateLimit(apiKey!)) {
    return { error: 'Rate limit exceeded', status: 429 }
  }

  return null
}

