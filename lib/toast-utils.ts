/**
 * Toast notification utilities with error mapping
 * Maps Supabase/API errors to user-friendly Hebrew messages
 */

export interface ToastOptions {
  duration?: number
  action?: {
    label: string
    onClick: () => void
  }
}

/**
 * Maps common Supabase/API errors to user-friendly Hebrew messages
 */
export function mapErrorToHebrew(error: string | Error | unknown): string {
  const errorMessage = error instanceof Error ? error.message : String(error)
  const lowerMessage = errorMessage.toLowerCase()

  // Phone number errors - check for exact match first (most specific)
  if (lowerMessage.includes('phone number already registered') || 
      lowerMessage.includes('phone already registered') ||
      lowerMessage.includes('phone number already registered by another user') ||
      lowerMessage.includes('user already registered') && lowerMessage.includes('phone') ||
      (lowerMessage.includes('phone') && lowerMessage.includes('already registered'))) {
    return 'מספר הטלפון הזה כבר רשום במערכת'
  }
  
  // E.164 format errors
  if (lowerMessage.includes('e.164') || lowerMessage.includes('invalid phone number format')) {
    return 'מספר טלפון לא תקין. אנא הזן מספר טלפון ישראלי (05X-XXXXXXX)'
  }
  
  // General phone number errors
  if (lowerMessage.includes('phone') && (lowerMessage.includes('already') || lowerMessage.includes('exists') || lowerMessage.includes('registered'))) {
    return 'מספר הטלפון הזה כבר רשום במערכת'
  }

  // Email errors
  if (lowerMessage.includes('email') && (lowerMessage.includes('already') || lowerMessage.includes('exists') || lowerMessage.includes('registered'))) {
    return 'כתובת האימייל כבר קיימת במערכת'
  }

  // Authentication errors
  if (lowerMessage.includes('invalid') && (lowerMessage.includes('credentials') || lowerMessage.includes('login'))) {
    return 'אימייל או סיסמה שגויים'
  }
  if (lowerMessage.includes('user not found')) {
    return 'משתמש לא נמצא'
  }
  if (lowerMessage.includes('wrong password') || lowerMessage.includes('incorrect password')) {
    return 'סיסמה שגויה'
  }

  // Service role key errors
  if (lowerMessage.includes('service role') || lowerMessage.includes('supabase_service_role')) {
    return 'שגיאת תצורה במערכת, פנה למנהל'
  }

  // Validation errors
  if (lowerMessage.includes('required') || lowerMessage.includes('missing')) {
    return 'אנא מלא את כל השדות הנדרשים'
  }
  if (lowerMessage.includes('invalid') && lowerMessage.includes('email')) {
    return 'כתובת אימייל לא תקינה'
  }
  if (lowerMessage.includes('invalid') && lowerMessage.includes('phone')) {
    return 'מספר טלפון לא תקין'
  }

  // Database errors
  if (lowerMessage.includes('relation') && lowerMessage.includes('does not exist')) {
    return 'שגיאה במסד הנתונים, פנה למנהל'
  }
  if (lowerMessage.includes('foreign key') || lowerMessage.includes('constraint')) {
    return 'שגיאה בהקשר הנתונים'
  }

  // Network errors
  if (lowerMessage.includes('network') || lowerMessage.includes('fetch')) {
    return 'שגיאת רשת, אנא נסה שוב'
  }
  if (lowerMessage.includes('timeout')) {
    return 'פג תוקף הבקשה, אנא נסה שוב'
  }

  // Permission errors
  if (lowerMessage.includes('unauthorized') || lowerMessage.includes('forbidden')) {
    return 'אין לך הרשאה לבצע פעולה זו'
  }

  // Generic fallback
  if (errorMessage.length > 100) {
    return 'שגיאה בלתי צפויה, אנא נסה שוב'
  }

  // Return original message if it's already in Hebrew or short enough
  return errorMessage
}

/**
 * Formats phone numbers to E.164 format for API submission
 * Converts Israeli format (052...) to E.164 format (+97252...)
 * Always returns E.164 format starting with +972
 */
export function formatPhoneNumber(phone: string): string {
  if (!phone) return ''
  
  // Sanitize first: remove all non-digit characters
  const digits = phone.replace(/\D/g, '')
  
  if (!digits) return '' // Return empty if no digits found
  
  // If already in E.164 format (+972...), return as-is
  if (phone.trim().startsWith('+972')) {
    // Ensure it's properly formatted
    const cleanDigits = phone.replace(/\D/g, '')
    if (cleanDigits.startsWith('972')) {
      return `+${cleanDigits}`
    }
    return phone.trim()
  }
  
  // Handle Israeli phone numbers (starting with 0)
  // Convert 052... or 050... to +97252... or +97250...
  if (digits.startsWith('0') && (digits.length === 9 || digits.length === 10)) {
    // Remove leading 0 and add +972
    return `+972${digits.substring(1)}`
  }
  
  // Handle international format without + (972...)
  if (digits.startsWith('972')) {
    return `+${digits}`
  }
  
  // If 9 digits, assume Israeli and add +972
  if (digits.length === 9) {
    return `+972${digits}`
  }
  
  // If 10 digits, assume Israeli (should start with 0, but handle if not)
  if (digits.length === 10) {
    if (digits.startsWith('0')) {
      return `+972${digits.substring(1)}`
    }
    // If 10 digits without 0, assume it's missing the 0 prefix
    // Take last 9 digits and add +972
    return `+972${digits.substring(1)}`
  }
  
  // Default: try to construct E.164 format
  // If it looks like it could be Israeli, add +972
  if (digits.length >= 9 && digits.length <= 10) {
    if (digits.startsWith('0')) {
      return `+972${digits.substring(1)}`
    }
    return `+972${digits}`
  }
  
  // Fallback: add + if not present
  return phone.startsWith('+') ? phone : `+${digits}`
}

/**
 * Validates phone number format (Israeli)
 * Sanitizes input first, then validates
 */
export function validatePhoneNumber(phone: string): { valid: boolean; error?: string } {
  if (!phone || !phone.trim()) {
    return { valid: false, error: 'מספר טלפון נדרש' }
  }
  
  // Sanitize first: remove all non-digit characters
  const digits = phone.replace(/\D/g, '')
  
  if (!digits) {
    return { valid: false, error: 'מספר טלפון נדרש' }
  }
  
  // Check length after sanitization
  if (digits.length < 9 || digits.length > 10) {
    return { valid: false, error: 'מספר טלפון חייב להכיל 9-10 ספרות' }
  }
  
  // For 9 digits, must start with 0
  if (digits.length === 9 && !digits.startsWith('0')) {
    return { valid: false, error: 'מספר טלפון חייב להתחיל ב-0' }
  }
  
  // For 10 digits, should start with 0 (Israeli format)
  if (digits.length === 10 && !digits.startsWith('0')) {
    // Allow but it's not standard Israeli format
    // We'll convert it in formatPhoneNumber
  }
  
  return { valid: true }
}

/**
 * Validates email format
 */
export function validateEmail(email: string): { valid: boolean; error?: string } {
  if (!email) {
    return { valid: false, error: 'כתובת אימייל נדרשת' }
  }
  
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return { valid: false, error: 'כתובת אימייל לא תקינה' }
  }
  
  return { valid: true }
}

