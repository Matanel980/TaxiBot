/**
 * Slide Sound Effects
 * Mechanical sliding sound for premium UX
 */

let slideSoundInstance: HTMLAudioElement | null = null
let isPlaying = false
let playStartTime = 0

/**
 * Initialize slide sound (very subtle mechanical sound)
 */
function initSlideSound(): HTMLAudioElement | null {
  if (typeof window === 'undefined') return null
  
  try {
    // Create a subtle sliding sound using Web Audio API (synthetic)
    // For now, we'll use a very short, low-volume audio file
    // In production, you'd want a real mechanical sliding sound
    
    // Option 1: Use a real audio file (recommended)
    const audio = new Audio('/sounds/slide-mechanical.mp3') // You'll need to add this file
    audio.volume = 0.15 // Very subtle (15% volume)
    audio.preload = 'auto'
    
    // Option 2: Generate synthetic sound (fallback - very basic)
    // We'll skip this for now and use the audio file approach
    
    return audio
  } catch (error) {
    console.warn('[SlideSound] Failed to initialize:', error)
    return null
  }
}

/**
 * Play subtle sliding sound (looped while dragging)
 */
export function playSlideSound(): void {
  if (typeof window === 'undefined') return
  
  try {
    if (!slideSoundInstance) {
      slideSoundInstance = initSlideSound()
    }
    
    if (!slideSoundInstance || isPlaying) return
    
    slideSoundInstance.currentTime = 0
    slideSoundInstance.loop = true
    const playPromise = slideSoundInstance.play()
    
    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          isPlaying = true
          playStartTime = Date.now()
        })
        .catch((error) => {
          // Silently fail - sound is optional, don't block UI
          if (error.name !== 'NotAllowedError' && error.name !== 'NotSupportedError') {
            // Only log non-standard errors
          }
        })
    }
  } catch (error: any) {
    // Silently fail - sound is optional, don't block UI
    if (error?.name !== 'NotSupportedError') {
      // Don't log NotSupportedError - it's expected if file is missing
    }
  }
}

/**
 * Stop sliding sound
 */
export function stopSlideSound(): void {
  if (!slideSoundInstance || !isPlaying) return
  
  try {
    slideSoundInstance.pause()
    slideSoundInstance.currentTime = 0
    isPlaying = false
  } catch (error) {
    // Silently fail
  }
}

/**
 * Reset slide sound state
 */
export function resetSlideSound(): void {
  stopSlideSound()
  slideSoundInstance = null
}

