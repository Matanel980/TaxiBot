'use client'

import { useEffect, useState, useRef } from 'react'

/**
 * Marker Interpolation Utility
 * 
 * Provides smooth interpolation for map markers with position (lat/lng) and heading (rotation).
 * Handles 0-360 degree wrap-around for heading to prevent "spinning" icons when crossing North.
 * 
 * Performance: Uses requestAnimationFrame for 60fps smooth animations, GPU-accelerated.
 * Scalability: Optimized for 1000+ concurrent markers (admin side).
 */

export interface LatLng {
  lat: number
  lng: number
}

export interface InterpolationOptions {
  /**
   * Animation duration in milliseconds
   * Default: 2000ms (2 seconds)
   */
  duration?: number
  
  /**
   * Easing function for smooth start/stop
   * Default: cubic ease-out (smooth deceleration)
   */
  easing?: (t: number) => number
  
  /**
   * Minimum distance in meters to trigger interpolation
   * If distance is less, marker jumps instantly (performance optimization)
   * Default: 5 meters
   */
  minDistanceMeters?: number
  
  /**
   * Maximum distance in meters to allow interpolation
   * If distance is greater, marker jumps instantly to avoid "supersonic" movements
   * Default: 200 meters
   */
  maxDistanceMeters?: number
  
  /**
   * Whether to enable interpolation (can be disabled for instant updates)
   * Default: true
   */
  enabled?: boolean
}

export interface InterpolationState {
  position: LatLng
  heading: number
  isAnimating: boolean
}

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in meters
 */
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371e3 // Earth's radius in meters
  const φ1 = lat1 * Math.PI / 180
  const φ2 = lat2 * Math.PI / 180
  const Δφ = (lat2 - lat1) * Math.PI / 180
  const Δλ = (lng2 - lng1) * Math.PI / 180

  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2)
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))

  return R * c // Distance in meters
}

/**
 * Normalize heading to 0-360 range
 */
function normalizeHeading(heading: number): number {
  // Normalize to 0-360 range
  let normalized = heading % 360
  if (normalized < 0) {
    normalized += 360
  }
  return normalized
}

/**
 * Calculate shortest rotation path between two headings (handles 0-360 wrap)
 * Returns the difference in degrees (-180 to 180)
 * 
 * Example:
 * - From 350° to 10°: Returns 20° (shortest path, not -340°)
 * - From 10° to 350°: Returns -20° (shortest path, not 340°)
 */
function calculateHeadingDifference(startHeading: number, targetHeading: number): number {
  const start = normalizeHeading(startHeading)
  const target = normalizeHeading(targetHeading)
  
  // Calculate direct difference
  let diff = target - start
  
  // Handle wrap-around: if difference > 180, go the other way
  if (diff > 180) {
    diff -= 360
  } else if (diff < -180) {
    diff += 360
  }
  
  return diff
}

/**
 * Interpolate heading with proper 0-360 wrap-around handling
 * Prevents "spinning" icons when crossing North (0°/360°)
 */
function interpolateHeading(
  startHeading: number,
  targetHeading: number,
  progress: number
): number {
  const start = normalizeHeading(startHeading)
  const diff = calculateHeadingDifference(start, targetHeading)
  
  // Interpolate along shortest path
  const interpolated = start + diff * progress
  
  // Normalize result to 0-360
  return normalizeHeading(interpolated)
}

/**
 * Default easing function: cubic ease-out
 * Provides smooth deceleration (feels natural for vehicle movement)
 */
function defaultEasing(t: number): number {
  // Cubic ease-out: 1 - (1-t)^3
  return 1 - Math.pow(1 - t, 3)
}

/**
 * React hook for marker interpolation
 * 
 * Smoothly interpolates marker position and heading between updates.
 * Handles 0-360 degree wrap-around for heading to prevent spinning.
 * 
 * @param targetPosition - Target position to interpolate to
 * @param targetHeading - Target heading in degrees (0-360)
 * @param options - Interpolation options
 * 
 * @returns Current interpolated position, heading, and animation state
 * 
 * @example
 * ```tsx
 * const { position, heading, isAnimating } = useMarkerInterpolation(
 *   { lat: 32.0853, lng: 34.7818 },
 *   45,
 *   { duration: 2000 }
 * )
 * ```
 */
export function useMarkerInterpolation(
  targetPosition: LatLng | null,
  targetHeading: number | null,
  options: InterpolationOptions = {}
): InterpolationState {
  const {
    duration = 2000, // 2 seconds default
    easing = defaultEasing,
    minDistanceMeters = 5, // Skip interpolation for tiny movements
    maxDistanceMeters = 200, // Skip interpolation for large jumps (avoid "supersonic" movement)
    enabled = true,
  } = options

  // Current interpolated state
  const [position, setPosition] = useState<LatLng>(targetPosition || { lat: 0, lng: 0 })
  const [heading, setHeading] = useState<number>(targetHeading || 0)
  const [isAnimating, setIsAnimating] = useState(false)

  // Animation state refs (to avoid stale closures)
  const animationFrameRef = useRef<number | null>(null)
  const startPositionRef = useRef<LatLng | null>(null)
  const startHeadingRef = useRef<number | null>(null)
  const startTimeRef = useRef<number | null>(null)
  const targetPositionRef = useRef<LatLng | null>(null)
  const targetHeadingRef = useRef<number | null>(null)

  useEffect(() => {
    // Skip if disabled or no target position
    if (!enabled || !targetPosition) {
      if (targetPosition) {
        // Update instantly if interpolation disabled
        setPosition(targetPosition)
        if (targetHeading !== null) {
          setHeading(normalizeHeading(targetHeading))
        }
      }
      return
    }

    // Cancel any ongoing animation
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current)
      animationFrameRef.current = null
    }

    // Check if we need to interpolate (distance threshold)
    const currentPos = position
    const distance = calculateDistance(
      currentPos.lat,
      currentPos.lng,
      targetPosition.lat,
      targetPosition.lng
    )

    // If movement is too small, update instantly (performance optimization)
    if (distance < minDistanceMeters) {
      setPosition(targetPosition)
      if (targetHeading !== null) {
        setHeading(normalizeHeading(targetHeading))
      }
      setIsAnimating(false)
      return
    }

    // If movement is too large, jump instantly to avoid "supersonic" movement
    // This happens when GPS signal is lost and regained, or user teleports
    if (distance > maxDistanceMeters) {
      setPosition(targetPosition)
      if (targetHeading !== null) {
        setHeading(normalizeHeading(targetHeading))
      }
      setIsAnimating(false)
      return
    }

    // Store start and target values
    startPositionRef.current = { ...currentPos }
    startHeadingRef.current = heading
    targetPositionRef.current = { ...targetPosition }
    targetHeadingRef.current = targetHeading !== null ? normalizeHeading(targetHeading) : heading
    startTimeRef.current = performance.now()
    setIsAnimating(true)

    // Animation loop using requestAnimationFrame (60fps)
    const animate = (currentTime: number) => {
      const startTime = startTimeRef.current
      if (!startTime || !startPositionRef.current || !targetPositionRef.current) {
        return
      }

      const elapsed = currentTime - startTime
      const progress = Math.min(elapsed / duration, 1)

      // Apply easing function
      const easedProgress = easing(progress)

      // Interpolate position
      const startPos = startPositionRef.current
      const targetPos = targetPositionRef.current
      const currentLat = startPos.lat + (targetPos.lat - startPos.lat) * easedProgress
      const currentLng = startPos.lng + (targetPos.lng - startPos.lng) * easedProgress

      // Interpolate heading with wrap-around handling
      const startHead = startHeadingRef.current ?? 0
      const targetHead = targetHeadingRef.current ?? startHead
      const currentHeading = interpolateHeading(startHead, targetHead, easedProgress)

      // Update state
      setPosition({ lat: currentLat, lng: currentLng })
      setHeading(currentHeading)

      // Continue animation if not complete
      if (progress < 1) {
        animationFrameRef.current = requestAnimationFrame(animate)
      } else {
        // Animation complete
        setIsAnimating(false)
        animationFrameRef.current = null
        
        // Ensure final values are exact (no floating point errors)
        setPosition(targetPos)
        if (targetHeading !== null) {
          setHeading(normalizeHeading(targetHeading))
        }
      }
    }

    // Start animation
    animationFrameRef.current = requestAnimationFrame(animate)

    // Cleanup on unmount or dependency change
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current)
        animationFrameRef.current = null
      }
      setIsAnimating(false)
    }
  }, [
    targetPosition?.lat,
    targetPosition?.lng,
    targetHeading,
    duration,
    enabled,
    minDistanceMeters,
    maxDistanceMeters,
    // Note: easing function is not in deps to avoid re-animating on every render
    // If you need to change easing, create a new hook instance
  ])

  return {
    position,
    heading,
    isAnimating,
  }
}

/**
 * Standalone interpolation function (non-React, for use in non-React contexts)
 * 
 * @param startPosition - Starting position
 * @param targetPosition - Target position
 * @param startHeading - Starting heading (0-360)
 * @param targetHeading - Target heading (0-360)
 * @param progress - Progress from 0 to 1
 * @returns Interpolated position and heading
 */
export function interpolateMarker(
  startPosition: LatLng,
  targetPosition: LatLng,
  startHeading: number,
  targetHeading: number,
  progress: number
): { position: LatLng; heading: number } {
  const easedProgress = defaultEasing(progress)
  
  const position: LatLng = {
    lat: startPosition.lat + (targetPosition.lat - startPosition.lat) * easedProgress,
    lng: startPosition.lng + (targetPosition.lng - startPosition.lng) * easedProgress,
  }
  
  const heading = interpolateHeading(startHeading, targetHeading, easedProgress)
  
  return { position, heading }
}
