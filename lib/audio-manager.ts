/**
 * Premium Audio Manager
 * Handles notification sounds with professional audio management
 */

type SoundType = 'new-trip' | 'trip-taken' | 'missed'

interface AudioManagerOptions {
  enabled: boolean
  volume: number // 0.0 to 1.0
}

class AudioManager {
  private sounds: Map<SoundType, HTMLAudioElement> = new Map()
  private options: AudioManagerOptions = {
    enabled: true,
    volume: 0.7, // Default volume (70%)
  }
  private audioContext: AudioContext | null = null

  constructor() {
    if (typeof window !== 'undefined') {
      this.initializeAudioContext()
      this.preloadSounds()
    }
  }

  private initializeAudioContext() {
    try {
      // Create AudioContext for better control (optional, for future enhancements)
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)()
    } catch (error) {
      console.warn('[AudioManager] AudioContext not supported:', error)
    }
  }

  private preloadSounds() {
    // Preload all sounds for instant playback
    const soundFiles: Record<SoundType, string> = {
      'new-trip': '/sounds/new-trip.mp3',
      'trip-taken': '/sounds/trip-taken.mp3',
      'missed': '/sounds/trip-taken.mp3', // Reuse trip-taken for missed
    }

    Object.entries(soundFiles).forEach(([type, url]) => {
      const audio = new Audio(url)
      audio.preload = 'auto'
      audio.volume = this.options.volume
      
      // Handle loading errors gracefully
      audio.addEventListener('error', (e) => {
        console.warn(`[AudioManager] Failed to load sound: ${type}`, e)
      })

      this.sounds.set(type as SoundType, audio)
    })
  }

  /**
   * Play a sound notification
   */
  async playSound(type: SoundType): Promise<void> {
    if (!this.options.enabled || typeof window === 'undefined') {
      return
    }

    const audio = this.sounds.get(type)
    if (!audio) {
      // Silently fail - sound file might be missing
      return
    }

    try {
      // Reset playback position if sound was already played
      audio.currentTime = 0
      
      // Play the sound
      const playPromise = audio.play()
      
      if (playPromise !== undefined) {
        await playPromise.catch((error) => {
          // Silently fail - don't block UI for sound errors
          // NotAllowedError, NotSupportedError, etc. are expected in some cases
        })
      }
    } catch (error: any) {
      // Silently fail - sound is optional, don't block UI
      // Don't log errors - they're expected if files are missing
    }
  }

  /**
   * Set audio options
   */
  setOptions(options: Partial<AudioManagerOptions>) {
    this.options = { ...this.options, ...options }
    
    // Update volume for all sounds
    this.sounds.forEach((audio) => {
      audio.volume = this.options.volume
    })
  }

  /**
   * Enable/disable audio
   */
  setEnabled(enabled: boolean) {
    this.options.enabled = enabled
  }

  /**
   * Get current options
   */
  getOptions(): AudioManagerOptions {
    return { ...this.options }
  }
}

// Singleton instance
let audioManagerInstance: AudioManager | null = null

export function getAudioManager(): AudioManager {
  if (!audioManagerInstance) {
    audioManagerInstance = new AudioManager()
  }
  return audioManagerInstance
}

/**
 * Play new trip notification sound
 */
export async function playNewTripSound(): Promise<void> {
  return getAudioManager().playSound('new-trip')
}

/**
 * Play trip taken/missed sound
 */
export async function playTripTakenSound(): Promise<void> {
  return getAudioManager().playSound('trip-taken')
}

/**
 * Play missed trip sound (alias for trip-taken)
 */
export async function playMissedTripSound(): Promise<void> {
  return getAudioManager().playSound('missed')
}

