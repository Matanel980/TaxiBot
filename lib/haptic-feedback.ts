/**
 * Haptic Feedback Manager
 * Provides tactile feedback for premium UX on mobile devices
 */

interface HapticPattern {
  duration: number // in milliseconds
  interval?: number // optional interval between pulses
  intensity?: 'light' | 'medium' | 'heavy' // iOS 13+ only
}

class HapticFeedbackManager {
  private isSupported: boolean = false
  private isAvailable: boolean = false

  constructor() {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      this.isSupported = true
      this.isAvailable = true
    }
  }

  /**
   * Check if haptic feedback is supported
   */
  isHapticSupported(): boolean {
    return this.isSupported
  }

  /**
   * Light haptic feedback (for subtle interactions)
   */
  light(): void {
    if (!this.isAvailable) return
    
    try {
      // Light vibration pattern (10ms)
      navigator.vibrate(10)
    } catch (error) {
      console.warn('[HapticFeedback] Light feedback failed:', error)
    }
  }

  /**
   * Medium haptic feedback (for confirmations)
   */
  medium(): void {
    if (!this.isAvailable) return
    
    try {
      // Medium vibration pattern (20ms)
      navigator.vibrate(20)
    } catch (error) {
      console.warn('[HapticFeedback] Medium feedback failed:', error)
    }
  }

  /**
   * Strong haptic feedback (for important actions)
   */
  strong(): void {
    if (!this.isAvailable) return
    
    try {
      // Strong vibration pattern (30ms)
      navigator.vibrate(30)
    } catch (error) {
      console.warn('[HapticFeedback] Strong feedback failed:', error)
    }
  }

  /**
   * Success pattern (for trip acceptance)
   */
  success(): void {
    if (!this.isAvailable) return
    
    try {
      // Success pattern: short-long-short
      navigator.vibrate([10, 50, 10])
    } catch (error) {
      console.warn('[HapticFeedback] Success pattern failed:', error)
    }
  }

  /**
   * Error pattern (for failed actions)
   */
  error(): void {
    if (!this.isAvailable) return
    
    try {
      // Error pattern: three short pulses
      navigator.vibrate([10, 30, 10, 30, 10])
    } catch (error) {
      console.warn('[HapticFeedback] Error pattern failed:', error)
    }
  }

  /**
   * Custom vibration pattern
   */
  pattern(pattern: number | number[]): void {
    if (!this.isAvailable) return
    
    try {
      navigator.vibrate(pattern)
    } catch (error) {
      console.warn('[HapticFeedback] Custom pattern failed:', error)
    }
  }
}

// Singleton instance
let hapticManagerInstance: HapticFeedbackManager | null = null

export function getHapticFeedback(): HapticFeedbackManager {
  if (!hapticManagerInstance) {
    hapticManagerInstance = new HapticFeedbackManager()
  }
  return hapticManagerInstance
}

/**
 * Quick access functions
 */
export const haptic = {
  light: () => getHapticFeedback().light(),
  medium: () => getHapticFeedback().medium(),
  strong: () => getHapticFeedback().strong(),
  success: () => getHapticFeedback().success(),
  error: () => getHapticFeedback().error(),
  pattern: (pattern: number | number[]) => getHapticFeedback().pattern(pattern),
  isSupported: () => getHapticFeedback().isHapticSupported(),
}





