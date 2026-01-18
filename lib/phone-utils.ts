/**
 * Phone Number Utilities
 * Handles Israeli phone number normalization to E.164 format
 * SINGLE SOURCE OF TRUTH for all phone number operations
 */

/**
 * Extracts only digits from a phone number (for comparison)
 * @param phone - Phone number in any format
 * @returns Only digits (e.g., "972526099607")
 */
export function extractPhoneDigits(phone: string): string {
  if (!phone) return ''
  return phone.replace(/\D/g, '')
}

/**
 * Normalizes an Israeli phone number to E.164 format (+972...)
 * 
 * Accepts formats:
 * - 0526099607 (Israeli mobile, no leading 0)
 * - 050-123-4567 (with dashes)
 * - +972526099607 (already in E.164)
 * - 972526099607 (without +)
 * 
 * @param phone - Raw phone input
 * @returns Normalized phone in E.164 format (+972XXXXXXXXX)
 * @throws Error if phone is invalid
 */
export function normalizeIsraeliPhone(phone: string): string {
  if (!phone) {
    throw new Error('מספר טלפון לא יכול להיות ריק')
  }
  
  // Extract only digits
  let digits = extractPhoneDigits(phone)
  
  if (!digits || digits.length === 0) {
    throw new Error('מספר טלפון לא תקין. אנא הזן מספר טלפון ישראלי (05X-XXXXXXX)')
  }
  
  // Handle Israeli country code (972)
  if (digits.startsWith('972')) {
    digits = digits.substring(3)
  }
  
  // Handle Israeli mobile prefix (0)
  if (digits.startsWith('0')) {
    digits = digits.substring(1)
  }
  
  // Validate length (Israeli mobile numbers are 9 digits after removing 0)
  if (digits.length < 8 || digits.length > 9) {
    throw new Error('מספר טלפון לא תקין. אנא הזן מספר טלפון ישראלי (05X-XXXXXXX)')
  }
  
  // Return in E.164 format (ALWAYS with + prefix)
  return `+972${digits}`
}

/**
 * Validates if a phone number is a valid Israeli mobile number
 */
export function isValidIsraeliPhone(phone: string): boolean {
  try {
    const normalized = normalizeIsraeliPhone(phone)
    // Israeli mobile numbers start with +9725 (after normalization)
    return normalized.startsWith('+9725') && normalized.length === 13
  } catch {
    return false
  }
}

/**
 * Formats phone number for display (e.g., 050-123-4567)
 */
export function formatPhoneForDisplay(phone: string): string {
  try {
    const normalized = normalizeIsraeliPhone(phone)
    // Remove +972 and format
    const digits = normalized.substring(4) // Remove +972
    if (digits.length === 9) {
      return `${digits.substring(0, 3)}-${digits.substring(3, 6)}-${digits.substring(6)}`
    }
    return normalized
  } catch {
    return phone
  }
}

/**
 * Compares two phone numbers in a format-agnostic way
 * Strips all non-digit characters and compares digits only
 * @param phone1 - First phone number
 * @param phone2 - Second phone number
 * @returns true if phones match (ignoring format)
 */
export function comparePhones(phone1: string, phone2: string): boolean {
  if (!phone1 || !phone2) return false
  return extractPhoneDigits(phone1) === extractPhoneDigits(phone2)
}

